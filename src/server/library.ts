/**
 * Library storage on disk.
 *
 * - Managed library: `<project>/library/originals/<artist>/<title>.<ext>` — files
 *   downloaded by the worker are moved here once validated (RF-ING-04).
 * - Scan folders: folders the operator adds by path. Their audio files are
 *   referenced in place — never copied, moved, re-encoded or deleted.
 *
 * Only files inside the managed library or a registered folder are ever served.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readdir, readFile, rename, rm, stat, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { runTool } from "./tools";
import type { ProbeResult } from "@/lib/worker-types";
import type { FolderScanEntry, LibraryFolder, LocalProbe } from "@/lib/library-types";

export const LIBRARY_ROOT = path.join(process.cwd(), "library");
export const ORIGINALS_DIR = path.join(LIBRARY_ROOT, "originals");
const CONFIG = path.join(process.cwd(), ".worker", "folders.json");
export const AUDIO_EXT = ["opus", "webm", "m4a", "mp4", "mp3", "ogg", "oga", "flac", "wav", "aac", "weba", "mka", "aif", "aiff", "wma"];

const MIME: Record<string, string> = {
  opus: "audio/ogg", ogg: "audio/ogg", oga: "audio/ogg", webm: "audio/webm", weba: "audio/webm", mka: "audio/x-matroska",
  m4a: "audio/mp4", mp4: "audio/mp4", mp3: "audio/mpeg", flac: "audio/flac", wav: "audio/wav", aac: "audio/aac", aif: "audio/aiff", aiff: "audio/aiff", wma: "audio/x-ms-wma",
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
};

const norm = (p: string) => {
  const r = path.resolve(p);
  return process.platform === "win32" ? r.toLowerCase() : r;
};
const inside = (child: string, parent: string) => {
  const c = norm(child);
  const pr = norm(parent);
  return c === pr || c.startsWith(pr.endsWith(path.sep) ? pr : pr + path.sep);
};

/* ------------------------------------------------------------------ */
/* scan folders (persisted on the server: they gate which files serve) */
/* ------------------------------------------------------------------ */

export async function listFolders(): Promise<LibraryFolder[]> {
  try {
    return JSON.parse(await readFile(CONFIG, "utf8")) as LibraryFolder[];
  } catch {
    return [];
  }
}

async function saveFolders(f: LibraryFolder[]) {
  await mkdir(path.dirname(CONFIG), { recursive: true });
  await writeFile(CONFIG, JSON.stringify(f, null, 2), "utf8");
}

export async function addFolder(raw: string, authorizationId: string): Promise<{ ok: true; folder: LibraryFolder } | { ok: false; message: string }> {
  const p = raw.trim().replace(/^"(.*)"$/, "$1");
  if (!p || !path.isAbsolute(p)) return { ok: false, message: "Enter a full folder path, e.g. D:\\Music or C:\\Users\\you\\Music." };
  const abs = path.resolve(p);
  const st = await stat(abs).catch(() => null);
  if (!st) return { ok: false, message: `Folder not found: ${abs}` };
  if (!st.isDirectory()) return { ok: false, message: `Not a folder: ${abs}` };
  if (inside(abs, LIBRARY_ROOT) || inside(LIBRARY_ROOT, abs)) return { ok: false, message: "This folder contains or is inside the managed library folder. Add a separate music folder." };
  const folders = await listFolders();
  const clash = folders.find((f) => inside(abs, f.path) || inside(f.path, abs));
  if (clash) return { ok: false, message: `Already covered by ${clash.path}.` };
  const folder: LibraryFolder = { id: `fld_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, path: abs, authorizationId, addedAt: Date.now() };
  await saveFolders([...folders, folder]);
  return { ok: true, folder };
}

export async function removeFolder(id: string) {
  const folders = await listFolders();
  await saveFolders(folders.filter((f) => f.id !== id));
}

export async function updateFolder(id: string, patch: Partial<Pick<LibraryFolder, "lastScanAt" | "lastScanCount">>) {
  const folders = await listFolders();
  await saveFolders(folders.map((f) => (f.id === id ? { ...f, ...patch } : f)));
}

/** Audio files under a registered folder (recursive), with their tags read by ffprobe. */
export async function scanFolder(id: string): Promise<{ ok: true; folder: LibraryFolder; files: FolderScanEntry[]; skipped: number } | { ok: false; message: string }> {
  const folder = (await listFolders()).find((f) => f.id === id);
  if (!folder) return { ok: false, message: "Folder not registered" };
  if (!existsSync(folder.path)) return { ok: false, message: `Folder not found: ${folder.path}` };
  const found: { p: string; size: number; mtimeMs: number }[] = [];
  let skipped = 0;
  const walk = async (d: string, depth: number) => {
    if (depth > 12) return;
    for (const ent of await readdir(d, { withFileTypes: true }).catch(() => [])) {
      if (ent.name.startsWith(".")) continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) await walk(p, depth + 1);
      else if (ent.isFile()) {
        if (!AUDIO_EXT.includes(path.extname(ent.name).slice(1).toLowerCase())) continue;
        const st = await stat(p).catch(() => null);
        if (st) found.push({ p, size: st.size, mtimeMs: st.mtimeMs });
        else skipped++;
      }
      if (found.length >= 5000) return;
    }
  };
  await walk(folder.path, 0);
  // Tags (title / artist / album / duration), 4 files at a time.
  const files: FolderScanEntry[] = [];
  for (let i = 0; i < found.length; i += 4) {
    const batch = await Promise.all(
      found.slice(i, i + 4).map(async (f) => {
        const t = await tagsOf(f.p);
        return { path: f.p, name: path.basename(f.p), sizeBytes: f.size, mtimeMs: f.mtimeMs, ...t };
      }),
    );
    files.push(...batch);
  }
  await updateFolder(id, { lastScanAt: Date.now(), lastScanCount: files.length });
  return { ok: true, folder: { ...folder, lastScanAt: Date.now(), lastScanCount: files.length }, files, skipped };
}

async function tagsOf(file: string): Promise<Pick<FolderScanEntry, "title" | "artist" | "album" | "durationSec">> {
  const r = await runTool("ffprobe", ["-v", "error", "-show_entries", "format=duration:format_tags=title,artist,album,album_artist", "-of", "json", file], { timeoutMs: 30_000 });
  try {
    const d = JSON.parse(r.stdout) as { format?: { duration?: string; tags?: Record<string, string> } };
    const tags = Object.fromEntries(Object.entries(d.format?.tags ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
    return { title: tags.title || undefined, artist: tags.artist || tags.album_artist || undefined, album: tags.album || undefined, durationSec: d.format?.duration ? Number(d.format.duration) : undefined };
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* validation helpers shared with the worker                           */
/* ------------------------------------------------------------------ */

export async function ffprobe(file: string): Promise<ProbeResult | null> {
  const r = await runTool("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", file], { timeoutMs: 60_000 });
  try {
    const d = JSON.parse(r.stdout) as { streams?: { codec_type?: string; codec_name?: string; sample_rate?: string; channels?: number; bit_rate?: string; duration?: string }[]; format?: { format_name?: string; duration?: string; bit_rate?: string } };
    const s = d.streams?.find((x) => x.codec_type === "audio");
    if (!s?.codec_name) return null;
    return {
      codec: s.codec_name,
      container: (d.format?.format_name ?? "").split(",")[0] || "unknown",
      bitrateKbps: Math.round(Number(s.bit_rate ?? d.format?.bit_rate ?? 0) / 1000),
      sampleRateHz: s.sample_rate ? Number(s.sample_rate) : null,
      channels: s.channels ?? null,
      durationSec: Number(s.duration ?? d.format?.duration ?? 0),
    };
  } catch {
    return null;
  }
}

/**
 * Decodes the whole stream with FFmpeg and measures how long it really is.
 * A truncated file often decodes without errors (MP3 just stops), so the
 * decoded length is compared with the length the headers declare.
 */
export async function decodeCheck(file: string, declaredSec?: number) {
  let decodedUs = 0;
  const dec = await runTool("ffmpeg", ["-hide_banner", "-nostats", "-v", "error", "-xerror", "-i", file, "-f", "null", "-", "-progress", "pipe:1"], {
    timeoutMs: 5 * 60_000,
    onStdoutLine: (l) => {
      const m = /^out_time_us=(\d+)/.exec(l);
      if (m) decodedUs = Number(m[1]);
    },
  });
  const decodedSec = decodedUs / 1e6;
  let errors = dec.timedOut ? "Decode timed out" : dec.stderr.trim();
  if (!errors && declaredSec && declaredSec > 2 && decodedSec < declaredSec - Math.max(1, declaredSec * 0.02)) {
    errors = `Stream ends at ${decodedSec.toFixed(1)} s of the ${declaredSec.toFixed(1)} s its headers declare — the file is truncated`;
  }
  return { ok: dec.code === 0 && !errors, errors: errors.slice(0, 600), decodedSec };
}

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (c) => h.update(c))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

/** Full validation of a file already on disk (scan-folder import). */
export async function probeLocal(file: string): Promise<{ ok: true; result: LocalProbe } | { ok: false; status: number; message: string }> {
  if (!(await isServable(file))) return { ok: false, status: 403, message: "File is outside the library and the registered folders" };
  const st = await stat(file).catch(() => null);
  if (!st?.isFile()) return { ok: false, status: 404, message: `File not found: ${file}` };
  const t0 = Date.now();
  const probe = await ffprobe(file);
  if (!probe) return { ok: true, result: { sizeBytes: st.size, probe: null, decode: { ok: false, errors: "ffprobe found no audio stream" }, sha256: "", hasCover: false, processMs: Date.now() - t0 } };
  const [dec, sha256, cover] = await Promise.all([decodeCheck(file, probe.durationSec), sha256File(file), hasEmbeddedPicture(file)]);
  const decode = { ok: dec.ok, errors: dec.errors };
  if (dec.ok && dec.decodedSec > 0) probe.durationSec = dec.decodedSec; // the real length, as decoded
  return { ok: true, result: { sizeBytes: st.size, probe, decode, sha256, hasCover: cover, processMs: Date.now() - t0 } };
}

async function hasEmbeddedPicture(file: string) {
  const r = await runTool("ffprobe", ["-v", "error", "-select_streams", "v", "-show_entries", "stream=codec_name", "-of", "csv=p=0", file], { timeoutMs: 20_000 });
  return !!r.stdout.trim();
}

/** Embedded picture of an audio file (first video stream), as JPEG/PNG bytes. */
export async function embeddedPicture(file: string): Promise<Buffer | null> {
  if (!(await isServable(file))) return null;
  const { spawn } = await import("node:child_process");
  const { resolveTool, childPath } = await import("./tools");
  const ff = resolveTool("ffmpeg");
  if (!ff) return null;
  return new Promise((resolve) => {
    const c = spawn(ff, ["-v", "error", "-i", file, "-an", "-map", "0:v:0", "-c", "copy", "-f", "image2pipe", "-"], { windowsHide: true, env: { ...process.env, PATH: childPath() } });
    const chunks: Buffer[] = [];
    c.stdout.on("data", (d: Buffer) => chunks.push(d));
    c.on("error", () => resolve(null));
    c.on("close", (code) => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
  });
}

/* ------------------------------------------------------------------ */
/* managed library                                                     */
/* ------------------------------------------------------------------ */

const safe = (s: string) =>
  (s || "unknown")
    .normalize("NFKC")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "")
    .slice(0, 80) || "unknown";

/** Moves a validated file from staging into library/originals/<artist>/<title>.<ext> (never overwrites). */
export async function publishToLibrary(src: string, artist: string, title: string, ext: string): Promise<string> {
  const dir = path.join(ORIGINALS_DIR, safe(artist));
  await mkdir(dir, { recursive: true });
  let dest = path.join(dir, `${safe(title)}.${ext}`);
  for (let n = 2; existsSync(dest); n++) dest = path.join(dir, `${safe(title)} (${n}).${ext}`);
  try {
    await rename(src, dest);
  } catch {
    await copyFile(src, dest); // staging on another volume
    await rm(src, { force: true });
  }
  return dest;
}

export async function isServable(file: string) {
  if (!file || !path.isAbsolute(file)) return false;
  if (inside(file, LIBRARY_ROOT)) return true;
  return (await listFolders()).some((f) => inside(file, f.path));
}

/** Deletes a file of the managed library. Files in scan folders are never deleted. */
export async function deleteManaged(file: string) {
  if (!inside(file, ORIGINALS_DIR)) return { ok: false as const, message: "Only files in the managed library are deleted; files in your folders are kept." };
  await rm(file, { force: true });
  // remove the artist folder when it is empty
  const dir = path.dirname(file);
  if ((await readdir(dir).catch(() => ["x"])).length === 0) await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  return { ok: true as const };
}

/** Streams a library file with HTTP Range support (seeking in the player). */
export async function serveFile(file: string, range: string | null): Promise<Response> {
  if (!(await isServable(file))) return Response.json({ error: "Not in the library or a registered folder" }, { status: 403 });
  const st = await stat(file).catch(() => null);
  if (!st?.isFile()) return Response.json({ error: "File not found on disk" }, { status: 404 });
  const type = MIME[path.extname(file).slice(1).toLowerCase()] ?? "application/octet-stream";
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "no-store" };
  const m = range ? /bytes=(\d*)-(\d*)/.exec(range) : null;
  if (m && (m[1] || m[2])) {
    let start = m[1] ? Number(m[1]) : st.size - Number(m[2]);
    let end = m[1] && m[2] ? Number(m[2]) : st.size - 1;
    start = Math.max(0, start);
    end = Math.min(st.size - 1, end);
    if (start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${st.size}` } });
    return new Response(Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream, {
      status: 206,
      headers: { ...base, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Content-Length": String(end - start + 1) },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, { headers: { ...base, "Content-Length": String(st.size) } });
}
