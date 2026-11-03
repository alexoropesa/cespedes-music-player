/**
 * Local ingestion worker (SRS §9; spec info/SPEC-WORKER-INGESTA.md).
 *
 * Runs inside the Next.js server process on the client's PC (TBD-09: internal
 * process for the pilot). It inspects sources without downloading, downloads
 * ONE job at a time into an isolated staging folder with yt-dlp, spotDL or
 * FreyrJS, and probes/decodes the result with FFmpeg. The browser app owns the
 * job record, authorization and library; it pulls the validated bytes from
 * here and the staging folder is removed afterwards.
 */
import type { ChildProcess } from "node:child_process";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { killTree, resolveTool, runTool, toolVersion, type ToolId } from "./tools";
import { decodeCheck, ffprobe, publishToLibrary, sha256File } from "./library";
import type { EngineId } from "@/lib/types";
import type { CreateWorkerJob, HealthResponse, InspectMeta, InspectResponse, WorkerFailureCode, WorkerJobState } from "@/lib/worker-types";

export const STAGING_ROOT = path.join(process.cwd(), ".worker", "staging");
const AUDIO_EXT = ["opus", "webm", "m4a", "mp4", "mp3", "ogg", "oga", "flac", "wav", "aac", "weba", "mka"];
const IMAGE_EXT = ["jpg", "jpeg", "png", "webp"];

/**
 * spotDL ships shared Spotify API credentials that Spotify rate-limits; the
 * client's own app credentials (Spotify Developer Dashboard, TBD-04) go in
 * BF_SPOTIFY_CLIENT_ID / BF_SPOTIFY_CLIENT_SECRET.
 */
const spotifyCreds = () =>
  process.env.BF_SPOTIFY_CLIENT_ID && process.env.BF_SPOTIFY_CLIENT_SECRET ? ["--client-id", process.env.BF_SPOTIFY_CLIENT_ID, "--client-secret", process.env.BF_SPOTIFY_CLIENT_SECRET] : [];
const SPOTIFY_SLOW =
  "Spotify did not answer in time. spotDL's shared API credentials are probably rate-limited — wait a few minutes, or set the client's own Spotify app credentials in BF_SPOTIFY_CLIENT_ID and BF_SPOTIFY_CLIENT_SECRET (TBD-04).";

const ENGINE_TOOL: Record<EngineId, ToolId> = { "yt-dlp": "yt-dlp", spotdl: "spotdl", freyrjs: "freyr" };
const ENGINE_NAME: Record<EngineId, string> = { "yt-dlp": "yt-dlp", spotdl: "spotDL", freyrjs: "FreyrJS" };

/* ------------------------------------------------------------------ */
/* registry (survives dev hot reloads)                                 */
/* ------------------------------------------------------------------ */

interface Entry {
  state: WorkerJobState;
  dir: string;
  child?: ChildProcess;
  cancelled?: boolean;
}

const g = globalThis as unknown as { __bfWorker?: { jobs: Map<string, Entry>; cleaned: boolean } };
const reg = (g.__bfWorker ??= { jobs: new Map(), cleaned: false });

async function ensureStaging() {
  if (!reg.cleaned) {
    // Worker (re)start: partial files from an interrupted run are discarded (RNF-FIA-01).
    reg.cleaned = true;
    await rm(STAGING_ROOT, { recursive: true, force: true }).catch(() => undefined);
  }
  await mkdir(STAGING_ROOT, { recursive: true });
}

const log = (e: Entry, line: string) => {
  const clean = line.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim();
  if (!clean) return;
  e.state.log = [...e.state.log, clean].slice(-40);
};

/* ------------------------------------------------------------------ */
/* health                                                              */
/* ------------------------------------------------------------------ */

export async function health(): Promise<HealthResponse> {
  const [yt, sp, fr, ff, fp, ap] = await Promise.all((["yt-dlp", "spotdl", "freyr", "ffmpeg", "ffprobe", "atomicparsley"] as ToolId[]).map((t) => toolVersion(t)));
  return {
    engines: {
      "yt-dlp": { id: "yt-dlp", name: "yt-dlp", version: yt },
      spotdl: { id: "spotdl", name: "spotDL", version: sp },
      freyrjs: { id: "freyrjs", name: "FreyrJS", version: fr },
    },
    ffmpeg: { id: "ffmpeg", name: "FFmpeg", version: ff },
    ffprobe: { id: "ffprobe", name: "ffprobe", version: fp },
    atomicparsley: { id: "atomicparsley", name: "AtomicParsley", version: ap },
    stagingDir: STAGING_ROOT,
  };
}

/* ------------------------------------------------------------------ */
/* URL rules                                                           */
/* ------------------------------------------------------------------ */

type Kind = "spotify-track" | "spotify-collection" | "apple-song" | "apple-collection" | "deezer-track" | "deezer-collection" | "web";

function classify(raw: string): { url: URL; kind: Kind } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const h = u.hostname.replace(/^www\./, "");
  if (h === "open.spotify.com" || h === "spotify.link") return { url: u, kind: /\/track\//.test(u.pathname) ? "spotify-track" : "spotify-collection" };
  if (h === "music.apple.com") return { url: u, kind: u.pathname.includes("/song/") || u.searchParams.has("i") ? "apple-song" : "apple-collection" };
  if (h === "deezer.com" || h.endsWith(".deezer.com") || h === "deezer.page.link") return { url: u, kind: /\/track\//.test(u.pathname) ? "deezer-track" : "deezer-collection" };
  return { url: u, kind: "web" };
}

function platformOf(u: URL, extractor?: string) {
  const h = u.hostname.replace(/^www\./, "");
  if (h === "music.youtube.com") return "YouTube Music";
  if (h.endsWith("youtube.com") || h === "youtu.be") return "YouTube";
  if (h.endsWith("soundcloud.com")) return "SoundCloud";
  if (h.endsWith("bandcamp.com")) return "Bandcamp";
  if (h.endsWith("wikimedia.org")) return "Wikimedia Commons";
  if (h === "open.spotify.com") return "Spotify";
  if (h === "music.apple.com") return "Apple Music";
  if (h.endsWith("deezer.com")) return "Deezer";
  return extractor && extractor !== "Generic" ? extractor : h;
}

function classifyError(text: string): { code: WorkerFailureCode; retryable: boolean } {
  if (/sign in|log ?in|members[- ]only|private video|age[- ]restricted|confirm your age|premium|requires payment|purchase|not a bot|cookies/i.test(text)) return { code: "ACCESS_REQUIRED", retryable: false };
  if (/unsupported url|no video formats|not available|unavailable|has been removed|http error 404|does not exist/i.test(text)) return { code: "UNSUPPORTED", retryable: false };
  if (/timed? ?out|connection|getaddrinfo|network|temporary failure|unable to download|http error 5\d\d|econnreset|eai_again|ssl/i.test(text)) return { code: "NETWORK", retryable: true };
  return { code: "ENGINE_ERROR", retryable: false };
}

function lastError(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").trim())
    .filter(Boolean);
  const err = [...lines].reverse().find((l) => /error|exception|failed|unable|denied|not found/i.test(l));
  return (err ?? lines.at(-1) ?? "Engine exited without output").replace(/^ERROR:\s*/, "").slice(0, 400);
}

function normCodec(acodec: string | null | undefined, ext: string) {
  const a = (acodec ?? "").toLowerCase();
  if (a && a !== "none") {
    if (a.startsWith("mp4a")) return "aac";
    if (a.startsWith("opus")) return "opus";
    if (a.startsWith("vorbis")) return "vorbis";
    if (a.startsWith("mp3")) return "mp3";
    if (a.startsWith("flac")) return "flac";
    if (a.startsWith("alac")) return "alac";
    return a.split(".")[0];
  }
  return { opus: "opus", mp3: "mp3", flac: "flac", m4a: "aac", wav: "pcm_s16le" }[ext] ?? "unknown";
}
const containerOf = (ext: string) => ({ m4a: "mp4", mp4: "mp4", opus: "ogg", oga: "ogg", weba: "webm" })[ext] ?? ext;

/* ------------------------------------------------------------------ */
/* inspect (no download)                                               */
/* ------------------------------------------------------------------ */

interface YtFormat {
  format_id: string;
  ext?: string;
  acodec?: string | null;
  vcodec?: string | null;
  abr?: number | null;
  tbr?: number | null;
  asr?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  format_note?: string;
}

export async function inspect(rawUrl: string, engine: EngineId): Promise<InspectResponse> {
  const c = classify(rawUrl);
  if (!c) return { ok: false, engine, code: "INVALID_URL", message: "Enter a full http(s) URL." };
  const version = await toolVersion(ENGINE_TOOL[engine]);
  if (!version) return { ok: false, engine, code: "ENGINE_MISSING", message: `${ENGINE_NAME[engine]} is not installed on this PC.` };

  if (c.kind.endsWith("collection")) {
    return { ok: false, engine, code: "PLAYLIST", message: "This link is an album, playlist or artist. Whole collections are never downloaded — open a single track and ingest it on its own (RF-ING-09)." };
  }

  if (engine === "yt-dlp") {
    if (c.kind !== "web") {
      return { ok: false, engine, code: "WRONG_ENGINE", message: "Streaming-catalog links (Spotify, Apple Music, Deezer) carry no downloadable audio. Use spotDL or FreyrJS, which match the reference to an audio source.", suggest: c.kind === "spotify-track" ? ["spotdl", "freyrjs"] : ["freyrjs"] };
    }
    return inspectYtDlp(c.url, version);
  }
  if (engine === "spotdl") {
    if (c.kind !== "spotify-track") return { ok: false, engine, code: "WRONG_ENGINE", message: "spotDL takes a Spotify track link. Use yt-dlp for direct source URLs, or FreyrJS for Apple Music and Deezer.", suggest: c.kind === "web" ? ["yt-dlp"] : ["freyrjs"] };
    return inspectSpotify(c.url, engine, version);
  }
  // FreyrJS
  if (c.kind === "web") return { ok: false, engine, code: "WRONG_ENGINE", message: "FreyrJS takes Spotify, Apple Music or Deezer track links. Use yt-dlp for direct source URLs.", suggest: ["yt-dlp"] };
  if (c.kind === "spotify-track" && resolveTool("spotdl")) return inspectSpotify(c.url, engine, version);
  const provider = c.kind === "apple-song" ? "Apple Music" : c.kind === "deezer-track" ? "Deezer" : "Spotify";
  const meta: InspectMeta = {
    url: c.url.toString(),
    platform: provider,
    sourceId: c.url.pathname.split("/").filter(Boolean).pop() ?? "",
    title: "",
    channel: "Matched by FreyrJS on YouTube Music",
    durationSec: 0,
    bitrateKbps: 320,
    formats: [{ id: "freyr", ext: "m4a", codec: "aac", container: "mp4", abrKbps: 320, asrHz: 44100, sizeBytes: 0 }],
    coverSeed: c.url.toString(),
    metadataAfterDownload: true,
  };
  return { ok: true, engine, toolVersion: version, meta, warnings: [`${provider} metadata is not read before downloading with FreyrJS — confirm the title and artist yourself; duration and codec are measured after the download.`] };
}

/** Some extractors (e.g. Wikimedia) return HTML in the title; keep the visible text only. */
function plainText(s: string) {
  if (!s.includes("<")) return s.trim();
  const t = s
    .replace(/<div style="display: ?none;?">[\s\S]*?<\/div>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  return t.split(/\s+label QS:/)[0].trim();
}

async function inspectYtDlp(u: URL, version: string): Promise<InspectResponse> {
  const r = await runTool("yt-dlp", ["-J", "--no-playlist", "--no-warnings", "--", u.toString()], { timeoutMs: 60_000 });
  let d: Record<string, unknown> | null = null;
  try {
    d = JSON.parse(r.stdout);
  } catch {
    d = null;
  }
  if (!d) {
    const text = r.timedOut ? "Timed out after 60 s" : `${r.stderr}\n${r.stdout}`;
    const cls = classifyError(text);
    return { ok: false, engine: "yt-dlp", code: cls.code === "ACCESS_REQUIRED" ? "ACCESS_REQUIRED" : cls.code === "UNSUPPORTED" ? "UNSUPPORTED" : cls.code === "NETWORK" ? "NETWORK" : "ENGINE_ERROR", message: lastError(text) };
  }
  if (d._type === "playlist" || Array.isArray(d.entries)) {
    return { ok: false, engine: "yt-dlp", code: "PLAYLIST", message: "This URL resolves to a playlist. Each track needs its own selection (RF-ING-09)." };
  }
  const duration = Math.round(Number(d.duration ?? 0));
  const formats = ((d.formats as YtFormat[] | undefined) ?? [])
    .filter((f) => (!f.vcodec || f.vcodec === "none") && f.acodec !== "none" && !/storyboard|mhtml/.test(f.format_note ?? "") && f.ext !== "mhtml")
    .reverse() // yt-dlp lists worst → best
    .map((f) => {
      const ext = f.ext ?? "bin";
      const kbps = Math.round(Number(f.abr ?? f.tbr ?? 0));
      const size = Number(f.filesize ?? f.filesize_approx ?? 0) || (kbps && duration ? Math.round((kbps * 1000 * duration) / 8) : 0);
      return { id: f.format_id, ext, codec: normCodec(f.acodec, ext), container: containerOf(ext), abrKbps: kbps, asrHz: Number(f.asr ?? 0), sizeBytes: size };
    });
  if (!formats.length) {
    // Single-file sources (e.g. a direct audio link) report the file itself.
    const ext = String(d.ext ?? "bin");
    formats.push({ id: String(d.format_id ?? "best"), ext, codec: normCodec(d.acodec as string, ext), container: containerOf(ext), abrKbps: Math.round(Number(d.abr ?? d.tbr ?? 0)), asrHz: Number(d.asr ?? 0), sizeBytes: Number(d.filesize ?? d.filesize_approx ?? 0) });
  }
  const meta: InspectMeta = {
    url: String(d.webpage_url ?? u.toString()),
    platform: platformOf(u, d.extractor_key as string),
    sourceId: String(d.id ?? ""),
    title: plainText(String(d.track ?? d.title ?? "")),
    channel: String(d.channel ?? d.uploader ?? d.uploader_id ?? "Unknown uploader"),
    durationSec: duration,
    bitrateKbps: formats[0]?.abrKbps ?? 0,
    album: (d.album as string) || undefined,
    artistGuess: ((d.artist as string) || (d.creator as string) || undefined)?.split(",")[0]?.trim(),
    formats,
    coverSeed: String(d.webpage_url ?? u.toString()),
    thumbnailUrl: (d.thumbnail as string) || undefined,
    license: (d.license as string) || undefined,
  };
  const warnings: string[] = [];
  if (!duration) warnings.push("The source did not report a duration; it is measured after the download.");
  if (formats.some((f) => !f.sizeBytes)) warnings.push("Some formats report no size; the size limit is enforced while downloading.");
  return { ok: true, engine: "yt-dlp", toolVersion: version, meta, warnings };
}

async function inspectSpotify(u: URL, engine: EngineId, version: string): Promise<InspectResponse> {
  await ensureStaging();
  const dir = path.join(STAGING_ROOT, `inspect-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  await mkdir(dir, { recursive: true });
  try {
    const r = await runTool("spotdl", ["save", u.toString(), "--save-file", "meta.spotdl", "--log-level", "ERROR", "--headless", ...spotifyCreds()], { cwd: dir, timeoutMs: 45_000 });
    const file = path.join(dir, "meta.spotdl");
    if (!existsSync(file)) {
      if (r.timedOut) return { ok: false, engine, code: "NETWORK", message: SPOTIFY_SLOW };
      const text = `${r.stderr}\n${r.stdout}`;
      return { ok: false, engine, code: classifyError(text).code === "NETWORK" ? "NETWORK" : "ENGINE_ERROR", message: lastError(text) };
    }
    const { readFile } = await import("node:fs/promises");
    const songs = JSON.parse(await readFile(file, "utf8")) as { name: string; artists?: string[]; artist?: string; album_name?: string; duration?: number; song_id?: string; cover_url?: string; url?: string }[];
    if (songs.length !== 1) return { ok: false, engine, code: "PLAYLIST", message: `The link resolves to ${songs.length} tracks. Ingest one track at a time (RF-ING-09).` };
    const s = songs[0];
    const artist = s.artist ?? s.artists?.[0] ?? "";
    const meta: InspectMeta = {
      url: s.url ?? u.toString(),
      platform: "Spotify (reference)",
      sourceId: s.song_id ?? "",
      title: s.name,
      channel: `Matched by ${ENGINE_NAME[engine]} on YouTube Music`,
      durationSec: Math.round(s.duration ?? 0),
      bitrateKbps: engine === "freyrjs" ? 320 : 0,
      album: s.album_name,
      artistGuess: artist,
      formats: [
        engine === "freyrjs"
          ? { id: "freyr", ext: "m4a", codec: "aac", container: "mp4", abrKbps: 320, asrHz: 44100, sizeBytes: Math.round((320 * 1000 * (s.duration ?? 0)) / 8) }
          : { id: "spotdl", ext: "opus", codec: "opus", container: "ogg", abrKbps: 0, asrHz: 48000, sizeBytes: 0 },
      ],
      coverSeed: s.url ?? u.toString(),
      thumbnailUrl: s.cover_url,
      reference: { provider: "spotify", title: s.name, artist, album: s.album_name, durationSec: Math.round(s.duration ?? 0) },
    };
    return {
      ok: true,
      engine,
      toolVersion: version,
      meta,
      warnings: [
        "Spotify only supplies the reference. The audio is matched on YouTube Music and its duration is checked against this reference after the download.",
        engine === "freyrjs" ? "FreyrJS re-encodes to AAC 320 kbps — recorded as the real codec, never as a quality gain." : "spotDL may convert the matched stream; the real codec is read with ffprobe after the download.",
      ],
    };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/* ------------------------------------------------------------------ */
/* jobs                                                                */
/* ------------------------------------------------------------------ */

export function getJob(key: string) {
  return reg.jobs.get(key)?.state ?? null;
}

export async function createJob(input: CreateWorkerJob): Promise<{ ok: true; state: WorkerJobState } | { ok: false; status: number; message: string }> {
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(input.key)) return { ok: false, status: 400, message: "Invalid job key" };
  const existing = reg.jobs.get(input.key);
  if (existing) return { ok: true, state: existing.state }; // idempotent (RNF-FIA-03)
  const c = classify(input.url);
  if (!c || c.kind.endsWith("collection")) return { ok: false, status: 400, message: "Single-track http(s) URL required" };
  if (input.engine === "yt-dlp" && c.kind !== "web") return { ok: false, status: 400, message: "yt-dlp takes direct source URLs only" };
  if (input.engine === "spotdl" && c.kind !== "spotify-track") return { ok: false, status: 400, message: "spotDL takes Spotify track links only" };
  if (input.engine === "freyrjs" && c.kind === "web") return { ok: false, status: 400, message: "FreyrJS takes Spotify, Apple Music or Deezer track links" };
  const version = await toolVersion(ENGINE_TOOL[input.engine]);
  if (!version) return { ok: false, status: 503, message: `${ENGINE_NAME[input.engine]} is not installed on this PC` };

  // One job at a time (RF-ING-05): a newer job supersedes anything still running.
  for (const [k, e] of reg.jobs) if (k !== input.key && (e.state.status === "downloading" || e.state.status === "validating")) await cancelJob(k);

  await ensureStaging();
  const dir = path.join(STAGING_ROOT, input.key);
  await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  await mkdir(dir, { recursive: true });
  const entry: Entry = {
    dir,
    state: { key: input.key, engine: input.engine, toolVersion: version, url: c.url.toString(), status: "downloading", progress: input.engine === "yt-dlp" ? 0 : null, downloadedBytes: 0, startedAt: Date.now(), log: [] },
  };
  reg.jobs.set(input.key, entry);
  void runJob(entry, input).catch((e: unknown) => fail(entry, "ENGINE_ERROR", (e as Error).message || "Worker error", false));
  return { ok: true, state: entry.state };
}

function fail(e: Entry, code: WorkerFailureCode, message: string, retryable: boolean) {
  if (e.state.status === "failed") return;
  e.state = { ...e.state, status: "failed", failure: { code, message, retryable } };
  void rm(e.dir, { recursive: true, force: true }).catch(() => undefined); // partial never published (RF-ING-04)
}

async function dirBytes(dir: string) {
  let total = 0;
  const walk = async (d: string) => {
    for (const ent of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else total += (await stat(p).catch(() => null))?.size ?? 0;
    }
  };
  await walk(dir);
  return total;
}

async function findFile(dir: string, exts: string[], prefer?: string): Promise<string | null> {
  const found: string[] = [];
  const walk = async (d: string) => {
    for (const ent of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p);
      else if (exts.includes(path.extname(ent.name).slice(1).toLowerCase()) && !ent.name.endsWith(".part")) found.push(p);
    }
  };
  await walk(dir);
  if (prefer && found.includes(prefer)) return prefer;
  return found[0] ?? null;
}

async function runJob(e: Entry, input: CreateWorkerJob) {
  const limit = input.maxSizeMB * 1024 * 1024;
  const t0 = Date.now();
  // Size guard for every engine: the staging folder may never exceed the limit.
  const guard = setInterval(() => {
    void dirBytes(e.dir).then((b) => {
      if (e.state.status !== "downloading") return;
      e.state.downloadedBytes = Math.max(e.state.downloadedBytes, b);
      if (b > limit) {
        log(e, `Staging reached ${(b / 1048576).toFixed(1)} MB — over the ${input.maxSizeMB} MB limit, aborting`);
        e.cancelled = true;
        if (e.child) killTree(e.child);
        fail(e, "SIZE_LIMIT", `Size limit exceeded — download aborted at ${input.maxSizeMB} MB. Partial file removed from staging.`, false);
      }
    });
  }, 500);

  let filePrint: string | null = null;
  let sizeAbort = false;
  const onLine = (line: string) => {
    log(e, line);
    const m = /^\[bf\] (\S+) (\S+) (\S+)/.exec(line);
    if (m) {
      const done = Number(m[1]);
      const total = Number(m[2]) || Number(m[3]);
      if (Number.isFinite(done)) e.state.downloadedBytes = done;
      if (Number.isFinite(total) && total > 0) e.state.progress = Math.min(1, done / total);
      return;
    }
    const f = /^\[bf-file\] (.+)$/.exec(line);
    if (f) filePrint = f[1].trim();
    if (/larger than max-filesize/i.test(line)) sizeAbort = true;
  };
  const ffmpeg = resolveTool("ffmpeg");
  let args: string[];
  if (input.engine === "yt-dlp") {
    args = [
      "-f", input.formatId || "bestaudio/best",
      "--no-playlist", "--newline", "--progress", "--no-warnings", "--no-mtime", "--no-cache-dir",
      "--max-filesize", `${input.maxSizeMB}M`,
      "--progress-template", "download:[bf] %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
      "--print", "after_move:[bf-file] %(filepath)s",
      "--write-thumbnail", "--convert-thumbnails", "jpg",
      "-o", `thumbnail:${path.join(e.dir, "cover.%(ext)s")}`,
      "-o", path.join(e.dir, "audio.%(ext)s"),
      ...(ffmpeg ? ["--ffmpeg-location", ffmpeg] : []),
      "--", input.url,
    ];
  } else if (input.engine === "spotdl") {
    args = ["download", input.url, "--output", path.join(e.dir, "{title}.{output-ext}"), "--format", "opus", "--bitrate", "disable", "--threads", "1", "--simple-tui", "--print-errors", "--log-level", "INFO", "--headless", ...spotifyCreds(), ...(ffmpeg ? ["--ffmpeg", ffmpeg] : [])];
  } else {
    const ap = resolveTool("atomicparsley");
    args = ["get", input.url, "-d", e.dir, "-T", "-P", "--no-logo", "--no-header", "--no-bar", "--no-stats", "--no-browser", ...(ap ? ["--atomic-parsley", ap] : [])];
  }
  log(e, `${ENGINE_NAME[input.engine]} ${e.state.toolVersion} · staging ${e.dir}`);

  const r = await runTool(ENGINE_TOOL[input.engine], args, {
    cwd: e.dir,
    timeoutMs: 15 * 60_000,
    onSpawn: (child) => (e.child = child),
    onStdoutLine: onLine,
    onStderrLine: onLine,
  });
  clearInterval(guard);
  e.child = undefined;
  if (e.cancelled || e.state.status === "failed") return;
  const output = `${r.stdout}\n${r.stderr}`;
  if (sizeAbort) return fail(e, "SIZE_LIMIT", `The source is larger than the ${input.maxSizeMB} MB limit — download aborted, nothing kept.`, false);
  if (r.timedOut) return fail(e, "NETWORK", input.engine === "yt-dlp" ? "The engine did not finish within 15 minutes — stopped, partial file removed." : `${SPOTIFY_SLOW} Stopped after 15 minutes; partial file removed.`, true);

  const audio = await findFile(e.dir, AUDIO_EXT, filePrint ?? undefined);
  if (!audio) {
    const cls = classifyError(output);
    return fail(e, cls.code, r.code === 0 ? `${ENGINE_NAME[input.engine]} finished without producing an audio file — ${lastError(output)}` : lastError(output), cls.retryable);
  }
  const size = (await stat(audio)).size;
  if (size > limit) return fail(e, "SIZE_LIMIT", `File is ${(size / 1048576).toFixed(1)} MB — over the ${input.maxSizeMB} MB limit.`, false);
  e.state = { ...e.state, status: "validating", progress: 1, downloadedBytes: size, downloadMs: Date.now() - t0 };
  log(e, `Downloaded ${path.basename(audio)} (${(size / 1048576).toFixed(2)} MB) · probing with ffprobe`);

  const t1 = Date.now();
  const probe = await ffprobe(audio);
  if (!probe) return fail(e, "DECODE_ERROR", "ffprobe could not read an audio stream from the downloaded file — not published.", false);
  const [dec, sha256] = await Promise.all([decodeCheck(audio, probe.durationSec), sha256File(audio)]);
  const decode = { ok: dec.ok, errors: dec.errors };
  if (dec.ok && dec.decodedSec > 0) probe.durationSec = dec.decodedSec; // the real length, as decoded
  const cover = await findFile(e.dir, IMAGE_EXT);
  e.state = {
    ...e.state,
    status: "done",
    processMs: Date.now() - t1,
    hasCover: !!cover,
    file: { name: path.basename(audio), ext: path.extname(audio).slice(1).toLowerCase(), sizeBytes: size, probe, decode, sha256 },
  };
  log(e, `ffprobe: ${probe.codec} · ${probe.container} · ${probe.durationSec.toFixed(1)} s · decode ${decode.ok ? "ok" : "failed"} · sha256 ${sha256.slice(0, 12)}…`);
}

export async function cancelJob(key: string) {
  const e = reg.jobs.get(key);
  if (!e) return false;
  e.cancelled = true;
  if (e.child) killTree(e.child);
  if (e.state.status === "downloading" || e.state.status === "validating") fail(e, "CANCELLED", "Cancelled by operator — staging folder cleaned.", true);
  return true;
}

/** Removes a job and its staging folder (called after the app took the bytes, or on cancel). */
export async function removeJob(key: string) {
  await cancelJob(key);
  const e = reg.jobs.get(key);
  reg.jobs.delete(key);
  if (e) await rm(e.dir, { recursive: true, force: true }).catch(() => undefined);
}

/**
 * Moves the validated file from staging into the managed library
 * (library/originals/<artist>/<title>.<ext>) and drops the job. Called by the
 * app only after every check passed, so nothing unvalidated is ever published.
 */
export async function publishJob(key: string, artist: string, title: string): Promise<{ ok: true; path: string } | { ok: false; status: number; message: string }> {
  const e = reg.jobs.get(key);
  if (!e || e.state.status !== "done" || !e.state.file) return { ok: false, status: 404, message: "Nothing validated to publish for this job" };
  const src = path.join(e.dir, e.state.file.name);
  if (!existsSync(src)) return { ok: false, status: 410, message: "The staged file is gone" };
  const dest = await publishToLibrary(src, artist, title, e.state.file.ext);
  reg.jobs.delete(key);
  await rm(e.dir, { recursive: true, force: true }).catch(() => undefined);
  return { ok: true, path: dest };
}

export async function openFile(key: string, which: "audio" | "cover"): Promise<{ stream: ReadableStream; size: number; type: string; name: string } | null> {
  const e = reg.jobs.get(key);
  if (!e || e.state.status !== "done" || !e.state.file) return null;
  const p = which === "audio" ? path.join(e.dir, e.state.file.name) : await findFile(e.dir, IMAGE_EXT);
  if (!p || !existsSync(p)) return null;
  const st = await stat(p);
  const ext = path.extname(p).slice(1).toLowerCase();
  const type =
    { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", opus: "audio/ogg", ogg: "audio/ogg", oga: "audio/ogg", webm: "audio/webm", weba: "audio/webm", m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", aac: "audio/aac" }[ext] ??
    "application/octet-stream";
  return { stream: Readable.toWeb(createReadStream(p)) as ReadableStream, size: st.size, type, name: path.basename(p) };
}
