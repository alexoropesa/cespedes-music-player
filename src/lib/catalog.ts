/**
 * Simulation adapter — fictional repertoire + deterministic source/engine behaviour.
 *
 * The real ingestion worker (yt-dlp / spotDL / FreyrJS + ffprobe in an isolated
 * sandbox) is not decided yet (SRS TBD-08/TBD-09) and no authorized sample has
 * been received (TBD-03). The UI therefore talks to this adapter, which behaves
 * like the documented tools (formats, matching quirks, failure modes) so every
 * flow and state can be exercised end-to-end. Artists and tracks are fictitious.
 */
import type {
  ArtistTier,
  BenchResult,
  BenchSample,
  EngineId,
  MatchFlag,
  Provider,
  Scenario,
  SearchResult,
  SourceFormat,
  SourceMetadata,
} from "./types";
import { hashString, seeded, slug } from "./util";

export const ENGINE_INFO: Record<
  EngineId,
  { name: string; version: string; runtime: string; input: string; upstream: string; license: string; notes: string }
> = {
  "yt-dlp": {
    name: "yt-dlp",
    version: "2026.10.22",
    runtime: "Python 3.11+ (isolated venv)",
    input: "Direct URL or ytsearch query",
    upstream: "YouTube / YouTube Music, SoundCloud, Bandcamp…",
    license: "Unlicense",
    notes: "Returns source metadata as published; the channel is not a confirmed artist.",
  },
  spotdl: {
    name: "spotDL",
    version: "4.4.3",
    runtime: "Python 3.11+ (isolated venv)",
    input: "Spotify reference (track / text)",
    upstream: "Spotify metadata → audio matched on YouTube Music",
    license: "MIT",
    notes: "Never extracts audio from Spotify; it matches the reference to another source.",
  },
  freyrjs: {
    name: "FreyrJS",
    version: "0.10.3",
    runtime: "Node.js 20 LTS (isolated)",
    input: "Spotify / Apple Music / Deezer reference",
    upstream: "Reference metadata → audio matched on YouTube / YouTube Music",
    license: "Apache-2.0",
    notes: "Documented default: re-encodes to AAC/M4A 320 kbps. Not source quality.",
  },
  match: {
    name: "Match",
    version: "2026.10.22",
    runtime: "yt-dlp + Node.js (in the app server)",
    input: "Spotify track link",
    upstream: "Spotify metadata → operator-picked YouTube upload",
    license: "Unlicense (yt-dlp)",
    notes: "No Spotify credentials needed. Candidates are scored; the operator picks one. The stream is kept as received.",
  },
};

export const PROVIDER_LABEL: Record<Provider, string> = {
  youtube: "YouTube",
  "youtube-music": "YouTube Music",
  spotify: "Spotify",
  "apple-music": "Apple Music",
  soundcloud: "SoundCloud",
  bandcamp: "Bandcamp",
  web: "Direct (web server)",
  deezer: "Deezer",
};

export const FLAG_LABEL: Record<MatchFlag, string> = {
  "duration-mismatch": "Duration mismatch",
  live: "Live version",
  cover: "Cover",
  remix: "Remix / edit",
  "lyric-video": "Lyric video (uploader ≠ artist)",
  "music-video": "Music video cut",
  reencoded: "Re-encoded by engine",
  "no-reference": "No reference found",
};

interface CArtist {
  key: string;
  name: string;
  tier: ArtistTier;
  country: string;
  onSpotify: boolean;
  onApple: boolean;
  onDeezer?: boolean;
  channel: string;
}

export const CATALOG_ARTISTS: CArtist[] = [
  { key: "marea", name: "Marea Alta", tier: "established", country: "ES", onSpotify: true, onApple: true, channel: "MareaAltaVEVO" },
  { key: "nova", name: "Nova Lindqvist", tier: "established", country: "SE", onSpotify: true, onApple: true, channel: "Nova Lindqvist" },
  { key: "hollow", name: "The Hollow Arcade", tier: "established", country: "GB", onSpotify: true, onApple: true, channel: "TheHollowArcadeVEVO" },
  { key: "kairo", name: "Kairo Vance", tier: "established", country: "US", onSpotify: true, onApple: true, channel: "Kairo Vance" },
  { key: "lumen", name: "Lumen Ensemble", tier: "established", country: "DE", onSpotify: true, onApple: true, channel: "Lumen Ensemble" },
  { key: "paloma", name: "Paloma Cruz", tier: "independent", country: "MX", onSpotify: true, onApple: false, channel: "paloma cruz" },
  { key: "static", name: "Static Orchard", tier: "independent", country: "US", onSpotify: false, onApple: false, channel: "staticorchard" },
  { key: "juno", name: "Juno Barrett", tier: "independent", country: "IE", onSpotify: true, onApple: true, channel: "Juno Barrett Music" },
  { key: "velvet", name: "Velvet Tides", tier: "independent", country: "AR", onSpotify: false, onApple: false, onDeezer: true, channel: "Velvet Tides" },
  { key: "oskar", name: "Oskar Mend", tier: "independent", country: "NL", onSpotify: true, onApple: false, channel: "oskarmend" },
  { key: "studio", name: "Bitferalda Studio", tier: "independent", country: "ES", onSpotify: false, onApple: false, channel: "Bitferalda Studio" },
];

interface CSong {
  key: string;
  title: string;
  artist: string;
  album: string;
  dur: number;
}

export const CATALOG_SONGS: CSong[] = [
  { key: "luz-de-agosto", title: "Luz de Agosto", artist: "marea", album: "Puerto Norte", dur: 214 },
  { key: "corazon-satelite", title: "Corazón Satélite", artist: "marea", album: "Puerto Norte", dur: 197 },
  { key: "mareas", title: "Mareas", artist: "marea", album: "Puerto Norte", dur: 236 },
  { key: "glasshouse", title: "Glasshouse", artist: "nova", album: "Northern Static", dur: 203 },
  { key: "midnight-ferry", title: "Midnight Ferry", artist: "nova", album: "Northern Static", dur: 228 },
  { key: "neon-cathedral", title: "Neon Cathedral", artist: "hollow", album: "Afterhours", dur: 251 },
  { key: "paper-satellites", title: "Paper Satellites", artist: "hollow", album: "Afterhours", dur: 219 },
  { key: "gravity-talks", title: "Gravity Talks", artist: "kairo", album: "Concrete Bloom", dur: 186 },
  { key: "westbound", title: "Westbound", artist: "kairo", album: "Concrete Bloom", dur: 172 },
  { key: "aurora-dawn", title: "Aurora Suite: I. Dawn", artist: "lumen", album: "Aurora Suite", dur: 412 },
  { key: "aurora-ember", title: "Aurora Suite: II. Ember", artist: "lumen", album: "Aurora Suite", dur: 367 },
  { key: "cuarto-azul", title: "Cuarto Azul", artist: "paloma", album: "Cuarto Azul EP", dur: 178 },
  { key: "tarde-lenta", title: "Tarde Lenta", artist: "paloma", album: "Cuarto Azul EP", dur: 201 },
  { key: "fieldnotes", title: "Fieldnotes", artist: "static", album: "Tape Hiss Vol. 2", dur: 143 },
  { key: "cassette-rain", title: "Cassette Rain", artist: "static", album: "Tape Hiss Vol. 2", dur: 131 },
  { key: "harbour-lights", title: "Harbour Lights", artist: "juno", album: "Salt & Stone", dur: 224 },
  { key: "wren", title: "Wren", artist: "juno", album: "Salt & Stone", dur: 189 },
  { key: "espejismo", title: "Espejismo", artist: "velvet", album: "Marea Lila", dur: 262 },
  { key: "lavanda", title: "Lavanda", artist: "velvet", album: "Marea Lila", dur: 241 },
  { key: "pulse-theory", title: "Pulse Theory", artist: "oskar", album: "Grid Works", dur: 318 },
  { key: "low-orbit", title: "Low Orbit", artist: "oskar", album: "Grid Works", dur: 296 },
  { key: "session-01", title: "Session 01 — Warmup Groove", artist: "studio", album: "Studio Sessions", dur: 245 },
  { key: "session-02", title: "Session 02 — Night Drive", artist: "studio", album: "Studio Sessions", dur: 274 },
  { key: "live-room-jam", title: "Live Room Jam (Full Take)", artist: "studio", album: "Studio Sessions", dur: 1120 },
];

export const artistByKey = (k: string) => CATALOG_ARTISTS.find((a) => a.key === k)!;
export const songByKey = (k: string) => CATALOG_SONGS.find((s) => s.key === k)!;

type VariantKind = "topic" | "video" | "live" | "lyric" | "cover" | "upload" | "master" | "preview";

export interface Variant {
  key: string;
  songKey: string;
  kind: VariantKind;
  provider: Provider;
  url: string;
  title: string;
  channel: string;
  durationSec: number;
  formats: SourceFormat[];
  scenario: Scenario;
  flags: MatchFlag[];
}

function ytId(seed: string) {
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  const r = seeded(`yt:${seed}`);
  let s = "";
  for (let i = 0; i < 11; i++) s += abc[Math.floor(r() * abc.length)];
  return s;
}

const kb = (kbps: number, sec: number) => Math.round((kbps * 1000 * sec) / 8);

function ytFormats(dur: number): SourceFormat[] {
  return [
    { id: "251", ext: "webm", codec: "opus", container: "webm", abrKbps: 141, asrHz: 48000, sizeBytes: kb(141, dur) },
    { id: "140", ext: "m4a", codec: "aac", container: "mp4", abrKbps: 129, asrHz: 44100, sizeBytes: kb(129, dur) },
    { id: "250", ext: "webm", codec: "opus", container: "webm", abrKbps: 68, asrHz: 48000, sizeBytes: kb(68, dur) },
  ];
}
function scFormats(dur: number): SourceFormat[] {
  return [
    { id: "hls_opus_64", ext: "opus", codec: "opus", container: "ogg", abrKbps: 64, asrHz: 48000, sizeBytes: kb(64, dur) },
    { id: "http_mp3_128", ext: "mp3", codec: "mp3", container: "mp3", abrKbps: 128, asrHz: 44100, sizeBytes: kb(128, dur) },
  ];
}
function bcFormats(dur: number): SourceFormat[] {
  return [{ id: "mp3-128", ext: "mp3", codec: "mp3", container: "mp3", abrKbps: 128, asrHz: 44100, sizeBytes: kb(128, dur) }];
}
function masterFormats(dur: number, hi = false): SourceFormat[] {
  return [
    { id: "flac", ext: "flac", codec: "flac", container: "flac", abrKbps: hi ? 2900 : 1650, asrHz: hi ? 96000 : 48000, sizeBytes: kb(hi ? 2900 : 1650, dur) },
    { id: "wav", ext: "wav", codec: "pcm_s24le", container: "wav", abrKbps: hi ? 4608 : 2304, asrHz: hi ? 96000 : 48000, sizeBytes: kb(hi ? 4608 : 2304, dur) },
  ];
}

function buildVariants(): Variant[] {
  const out: Variant[] = [];
  for (const s of CATALOG_SONGS) {
    const a = artistByKey(s.artist);
    const v = (kind: VariantKind, p: Partial<Variant> & Pick<Variant, "provider" | "url" | "title" | "channel" | "durationSec" | "formats">) =>
      out.push({ key: `${s.key}:${kind}`, songKey: s.key, kind, scenario: "ok", flags: [], ...p });

    if (a.key === "studio") {
      v("master", {
        provider: "web",
        url: `https://samples.bitferalda.example/studio/${s.key}.flac`,
        title: s.title,
        channel: "Bitferalda Studio (own server)",
        durationSec: s.dur,
        formats: masterFormats(s.dur),
      });
      continue;
    }
    if (a.key === "lumen") {
      v("master", {
        provider: "web",
        url: `https://press.lumen-ensemble.example/aurora/${s.key}.wav`,
        title: `${s.title} (press master)`,
        channel: "Lumen Ensemble — press area",
        durationSec: s.dur,
        formats: masterFormats(s.dur, true).reverse(),
        scenario: "oversize",
      });
    }
    if (a.key === "static" || a.key === "juno") {
      v("upload", {
        provider: "bandcamp",
        url: `https://${slug(a.name).replace(/-/g, "")}.bandcamp.com/track/${s.key}`,
        title: s.title,
        channel: a.name,
        durationSec: s.dur,
        formats: bcFormats(s.dur),
        scenario: s.key === "cassette-rain" || s.key === "wren" ? "ext-mismatch" : "ok",
      });
    }
    if (a.key === "oskar" || a.key === "velvet") {
      v("upload", {
        provider: "soundcloud",
        url: `https://soundcloud.com/${slug(a.channel)}/${s.key}`,
        title: s.title,
        channel: a.channel,
        durationSec: s.dur,
        formats: scFormats(s.dur),
        scenario: s.key === "low-orbit" ? "network-flaky" : s.key === "lavanda" ? "duration-off" : "ok",
      });
    }
    // YouTube Music "Topic" (auto-generated official audio)
    if (a.key !== "static") {
      v("topic", {
        provider: "youtube-music",
        url: `https://music.youtube.com/watch?v=${ytId(`${s.key}:topic`)}`,
        title: s.title,
        channel: `${a.name} - Topic`,
        durationSec: s.dur,
        formats: ytFormats(s.dur),
        scenario: s.key === "espejismo" ? "network-flaky" : "ok",
      });
    }
    if (a.tier === "established") {
      v("video", {
        provider: "youtube",
        url: `https://www.youtube.com/watch?v=${ytId(`${s.key}:video`)}`,
        title: `${a.name} - ${s.title} (Official Video)`,
        channel: a.channel,
        durationSec: s.dur + 9 + (hashString(s.key) % 17),
        formats: ytFormats(s.dur + 18),
        scenario: s.key === "westbound" ? "access-required" : s.key === "midnight-ferry" ? "truncated" : "ok",
        flags: ["music-video"],
      });
      v("live", {
        provider: "youtube",
        url: `https://www.youtube.com/watch?v=${ytId(`${s.key}:live`)}`,
        title: `${s.title} (Live at the Roundhouse)`,
        channel: a.channel,
        durationSec: s.dur + 31 + (hashString(s.key + "l") % 25),
        formats: ytFormats(s.dur + 40),
        flags: ["live"],
      });
    }
    v("lyric", {
      provider: "youtube",
      url: `https://www.youtube.com/watch?v=${ytId(`${s.key}:lyric`)}`,
      title: `${a.name} — ${s.title} (Lyrics)`,
      channel: "LyricVault",
      durationSec: s.dur + 1,
      formats: ytFormats(s.dur + 1),
      flags: ["lyric-video"],
    });
    if (hashString(s.key) % 3 === 0) {
      v("cover", {
        provider: "youtube",
        url: `https://www.youtube.com/watch?v=${ytId(`${s.key}:cover`)}`,
        title: `${s.title} - acoustic cover`,
        channel: "Sofia Reyes Covers",
        durationSec: s.dur - 14,
        formats: ytFormats(s.dur - 14),
        flags: ["cover"],
      });
    }
  }
  return out;
}

export const VARIANTS = buildVariants();
export const variantByKey = (k: string) => VARIANTS.find((v) => v.key === k);

/* ------------------------------------------------------------------ */
/* URL inspection (RF-01 / RF-BUS-01) — metadata without downloading   */
/* ------------------------------------------------------------------ */

export type InspectResult =
  | { kind: "ok"; meta: SourceMetadata; scenario: Scenario; variantKey?: string }
  | { kind: "provider-reference"; provider: Provider; message: string }
  | { kind: "error"; code: "INVALID_URL" | "UNREACHABLE" | "ACCESS_REQUIRED"; message: string };

export function inspectUrl(raw: string, engine: EngineId): InspectResult {
  let url: URL;
  try {
    url = new URL(raw.trim());
    if (!/^https?:$/.test(url.protocol)) throw new Error();
  } catch {
    return { kind: "error", code: "INVALID_URL", message: "Enter a full http(s) URL to an authorized sample." };
  }
  const host = url.hostname.replace(/^www\./, "");
  if (host.endsWith("spotify.com") || host.endsWith("music.apple.com") || host === "deezer.com") {
    const provider: Provider = host.endsWith("spotify.com") ? "spotify" : "apple-music";
    return {
      kind: "provider-reference",
      provider,
      message:
        "Streaming-provider links are references, not downloadable sources. Provider audio is DRM-protected and never enters the local library. Save it as a reference, or use Text search to review a match from an authorized source.",
    };
  }
  if (engine !== "yt-dlp") {
    return {
      kind: "error",
      code: "UNREACHABLE",
      message: `${ENGINE_INFO[engine].name} resolves provider references, not direct URLs. Switch the engine to yt-dlp for direct sources.`,
    };
  }
  const variant = VARIANTS.find((v) => v.url === url.toString() || v.url === raw.trim());
  if (variant) {
    const song = songByKey(variant.songKey);
    const artist = artistByKey(song.artist);
    if (variant.scenario === "access-required") {
      return {
        kind: "error",
        code: "ACCESS_REQUIRED",
        message:
          "The source requires sign-in or membership (HTTP 403). Account cookies and paid content are out of pilot scope — the limitation can be recorded; no alternative version is substituted.",
      };
    }
    return {
      kind: "ok",
      scenario: variant.scenario,
      variantKey: variant.key,
      meta: {
        url: variant.url,
        platform: PROVIDER_LABEL[variant.provider],
        sourceId: variant.url.split(/[=/]/).pop() ?? variant.key,
        title: variant.title,
        channel: variant.channel,
        durationSec: variant.durationSec,
        bitrateKbps: variant.formats[0].abrKbps,
        album: variant.kind === "topic" || variant.kind === "upload" || variant.kind === "master" ? song.album : undefined,
        artistGuess: variant.kind === "topic" || variant.kind === "upload" || variant.kind === "master" ? artist.name : undefined,
        formats: variant.formats,
        coverSeed: song.key,
      },
    };
  }
  // Unknown but well-formed URL → generic deterministic metadata.
  const r = seeded(url.toString());
  const dur = 150 + Math.floor(r() * 170);
  const last = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? "untitled")
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[-_]+/g, " ");
  const isYt = host.includes("youtube.com") || host === "youtu.be";
  const isSc = host.includes("soundcloud.com");
  const formats = isYt ? ytFormats(dur) : isSc ? scFormats(dur) : masterFormats(dur);
  const roll = r();
  return {
    kind: "ok",
    scenario: roll < 0.12 ? "network-flaky" : roll < 0.18 ? "truncated" : "ok",
    meta: {
      url: url.toString(),
      platform: isYt ? "YouTube" : isSc ? "SoundCloud" : `Direct (${host})`,
      sourceId: url.searchParams.get("v") ?? last.slice(0, 24),
      title: isYt ? `Upload ${url.searchParams.get("v") ?? ""}`.trim() : last.replace(/\b\w/g, (c) => c.toUpperCase()) || "Untitled",
      channel: isYt ? "Unknown channel" : host,
      durationSec: dur,
      bitrateKbps: formats[0].abrKbps,
      formats,
      coverSeed: url.toString(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Text search (RF-BUS-02, RF-08) — per-engine behaviour               */
/* ------------------------------------------------------------------ */

function tokens(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1);
}

export function matchSongs(query: string) {
  const q = tokens(query);
  if (!q.length) return [];
  return CATALOG_SONGS.map((s) => {
    const a = artistByKey(s.artist);
    const hay = new Set([...tokens(s.title), ...tokens(a.name), ...tokens(s.album)]);
    const titleT = tokens(s.title);
    let score = 0;
    for (const t of q) if (hay.has(t)) score += titleT.includes(t) ? 2 : 1;
    return { s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
}

function flagsFor(v: Variant, expectedDur: number, tolerance: number): MatchFlag[] {
  const f = new Set<MatchFlag>(v.flags);
  if (Math.abs(v.durationSec - expectedDur) > tolerance) f.add("duration-mismatch");
  return [...f];
}

function confidence(flags: MatchFlag[], kind: VariantKind) {
  let c = kind === "topic" || kind === "master" || kind === "upload" ? 0.97 : 0.86;
  for (const f of flags) {
    if (f === "duration-mismatch") c -= 0.18;
    if (f === "live" || f === "cover") c -= 0.32;
    if (f === "lyric-video") c -= 0.12;
    if (f === "music-video") c -= 0.06;
    if (f === "reencoded") c -= 0.03;
  }
  return Math.max(0.05, Math.min(0.99, c));
}

function toResult(v: Variant, engine: EngineId, query: string, tolerance: number, refProvider?: Provider): SearchResult {
  const song = songByKey(v.songKey);
  const artist = artistByKey(song.artist);
  const flags = flagsFor(v, song.dur, tolerance);
  const reenc = engine === "freyrjs";
  if (reenc) flags.push("reencoded");
  const fmt = v.formats[0];
  return {
    id: `${engine}:${v.key}`,
    engine,
    query,
    provider: v.provider,
    title: v.title,
    channel: v.channel,
    durationSec: v.durationSec,
    url: v.url,
    codec: reenc ? "aac" : fmt.codec,
    bitrateKbps: reenc ? 320 : fmt.abrKbps,
    reference: refProvider
      ? { provider: refProvider, title: song.title, artist: artist.name, album: song.album, durationSec: song.dur }
      : undefined,
    flags,
    confidence: confidence(flags, v.kind),
    coverSeed: song.key,
    scenario: v.scenario,
  };
}

const ORDER_YT: VariantKind[] = ["video", "topic", "upload", "master", "live", "lyric", "cover"];

export function searchEngine(query: string, engine: EngineId, tolerance: number): { results: SearchResult[]; note?: string; latencyMs: number } {
  const songs = matchSongs(query).slice(0, 2);
  const r = seeded(`${engine}:${query}`);
  const latencyMs =
    engine === "yt-dlp" ? 900 + r() * 900 : engine === "spotdl" ? 1900 + r() * 1300 : 2400 + r() * 1500;

  if (!songs.length) {
    if (engine !== "yt-dlp") return { results: [], note: "No streaming-catalog reference found for this query.", latencyMs };
    return { results: [], note: "No results for this query on the configured sources.", latencyMs };
  }
  const results: SearchResult[] = [];
  if (engine === "yt-dlp") {
    songs.forEach((s, i) => {
      const vs = VARIANTS.filter((v) => v.songKey === s.key).sort((a, b) => ORDER_YT.indexOf(a.kind) - ORDER_YT.indexOf(b.kind));
      (i === 0 ? vs : vs.slice(0, 2)).forEach((v) => results.push(toResult(v, engine, query, tolerance)));
    });
    return { results, latencyMs };
  }
  let note: string | undefined;
  for (const s of songs) {
    const a = artistByKey(s.artist);
    const hasRef = engine === "freyrjs" ? a.onSpotify || a.onApple || !!a.onDeezer : a.onSpotify;
    if (!hasRef) {
      note = `${a.name} has no ${engine === "freyrjs" ? "Spotify / Apple Music / Deezer" : "Spotify"} reference — ${ENGINE_INFO[engine].name} cannot resolve independent releases outside streaming catalogs.`;
      continue;
    }
    const vs = VARIANTS.filter((v) => v.songKey === s.key);
    // Matching quirks: some songs get matched to a doubtful variant.
    const h = hashString(`${engine}:${s.key}`) % 5;
    const pick =
      (h === 0 && vs.find((v) => v.kind === "live")) ||
      (h === 1 && vs.find((v) => v.kind === "lyric")) ||
      vs.find((v) => v.kind === "topic") ||
      vs[0];
    results.push(toResult(pick, engine, query, tolerance, engine === "freyrjs" && !a.onSpotify ? (a.onApple ? "apple-music" : "deezer") : "spotify"));
  }
  return { results, note, latencyMs };
}

/* ------------------------------------------------------------------ */
/* Benchmark (RF-08 / CA-08) — same samples, three engines             */
/* ------------------------------------------------------------------ */

export function simulateBench(sample: BenchSample, engine: EngineId, runSeed: string, tolerance: number): BenchResult {
  const r = seeded(`${runSeed}:${engine}:${sample.id}`);
  const { results, latencyMs } = searchEngine(sample.query, engine, tolerance);
  const responseMs = Math.round(latencyMs * (0.85 + r() * 0.3));
  const top = results[0];
  if (!top) {
    return {
      sampleId: sample.id,
      engine,
      responseMs,
      metadataAccuracy: 0,
      success: false,
      match: "none",
      note: engine === "yt-dlp" ? "No results" : "No streaming reference — independent release",
    };
  }
  const exp = sample.expected;
  const titleOk = top.title.toLowerCase().includes(exp.title.toLowerCase());
  const titleExact = (top.reference?.title ?? top.title).toLowerCase() === exp.title.toLowerCase();
  const artistOk = (top.reference?.artist ?? "").toLowerCase() === exp.artist.toLowerCase();
  const durOk = Math.abs((top.reference?.durationSec ?? top.durationSec) - exp.durationSec) <= tolerance;
  const albumOk = !!top.reference?.album;
  const metadataAccuracy =
    engine === "yt-dlp"
      ? (titleExact ? 0.35 : titleOk ? 0.2 : 0) + (top.channel.toLowerCase().startsWith(exp.artist.toLowerCase()) ? 0.25 : 0.05) + (durOk ? 0.25 : 0.08) + 0.05
      : (titleExact ? 0.35 : 0.15) + (artistOk ? 0.3 : 0) + (durOk ? 0.2 : 0.1) + (albumOk ? 0.13 : 0);
  const doubtful = top.flags.some((f) => ["duration-mismatch", "live", "cover", "lyric-video"].includes(f));
  const failed = top.scenario === "access-required" || (top.scenario === "network-flaky" && r() < 0.25);
  return {
    sampleId: sample.id,
    engine,
    responseMs,
    downloadMs: failed ? undefined : Math.round(1800 + r() * 3200 + (engine === "freyrjs" ? 2600 : 0)),
    metadataAccuracy: Math.min(1, Math.round(metadataAccuracy * 100) / 100),
    success: !failed,
    match: failed ? "none" : doubtful ? (top.flags.includes("live") || top.flags.includes("cover") ? "wrong" : "doubtful") : "exact",
    codec: failed ? undefined : top.codec,
    bitrateKbps: failed ? undefined : top.bitrateKbps,
    reencoded: top.flags.includes("reencoded"),
    matchedTitle: top.title,
    matchedChannel: top.channel,
    matchedDurationSec: top.durationSec,
    note: failed ? (top.scenario === "access-required" ? "Source requires sign-in (403)" : "Network error — retry limit") : undefined,
  };
}

/** Quick-fill list for the URL ingest form: the authorized pilot samples. */
export const PILOT_URLS: { label: string; url: string; hint: string }[] = [
  { label: "The Hollow Arcade — Paper Satellites (YT Music)", url: VARIANTS.find((v) => v.key === "paper-satellites:topic")!.url, hint: "Clean path → ready" },
  { label: "Bitferalda Studio — Session 01 (own server)", url: VARIANTS.find((v) => v.key === "session-01:master")!.url, hint: "Own content · lossless" },
  { label: "Juno Barrett — Wren (Bandcamp)", url: VARIANTS.find((v) => v.key === "wren:upload")!.url, hint: "Extension ≠ real codec" },
  { label: "Nova Lindqvist — Midnight Ferry (video)", url: VARIANTS.find((v) => v.key === "midnight-ferry:video")!.url, hint: "Incomplete file → bounded retry" },
  { label: "Oskar Mend — Low Orbit (SoundCloud)", url: VARIANTS.find((v) => v.key === "low-orbit:upload")!.url, hint: "Transient network errors" },
  { label: "Nova Lindqvist — Glasshouse (YT Music)", url: VARIANTS.find((v) => v.key === "glasshouse:topic")!.url, hint: "Already in library → duplicate" },
  { label: "Lumen Ensemble — Aurora I (press master)", url: VARIANTS.find((v) => v.key === "aurora-dawn:master")!.url, hint: "Exceeds size limit" },
  { label: "Bitferalda Studio — Live Room Jam", url: VARIANTS.find((v) => v.key === "live-room-jam:master")!.url, hint: "Exceeds duration limit" },
  { label: "Kairo Vance — Westbound (video)", url: VARIANTS.find((v) => v.key === "westbound:video")!.url, hint: "Requires sign-in" },
];
