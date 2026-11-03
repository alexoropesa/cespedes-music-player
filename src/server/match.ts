/**
 * Match engine: Spotify supplies the reference (title, artists, duration,
 * cover), YouTube supplies the audio. Unlike spotDL it needs no Spotify
 * credentials (the public embed page carries the track data). It picks the
 * upload itself: the right recording first (version markers, duration), then
 * the best measured audio quality among the closest matches. The download is
 * a plain yt-dlp fetch of that stream, kept as received.
 */
import { writeFile } from "node:fs/promises";
import { runTool } from "./tools";
import type { MatchCandidate, MatchFlag } from "@/lib/worker-types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const COVER_HOSTS = /(^|\.)(spotifycdn\.com|scdn\.co)$/;

export interface SpotifyTrack {
  id: string;
  url: string;
  title: string;
  artists: string[];
  album?: string;
  durationSec: number;
  coverUrl?: string;
  isrc?: string;
  /** Where the data came from: the Web API (client credentials) or the public embed page. */
  via: "api" | "embed";
}

/** YouTube's "Sign in to confirm you're not a bot": too many requests from this PC's address. */
export const BOT_CHECK =
  "YouTube is asking this PC to confirm it is not a bot — it received too many requests from this connection. It usually clears up on its own after a while; wait and try again. Nothing was downloaded.";

export class MatchError extends Error {
  constructor(
    public code: "UNSUPPORTED" | "NETWORK" | "ENGINE_ERROR" | "ACCESS_REQUIRED",
    message: string,
  ) {
    super(message);
  }
}

export function spotifyTrackId(u: URL): string | null {
  return /\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/.exec(u.pathname + "/")?.[1] ?? null;
}

/* ------------------------------------------------------------------ */
/* Spotify reference                                                   */
/* ------------------------------------------------------------------ */

const tokenCache = globalThis as unknown as { __bfSpotifyToken?: { value: string; until: number } };

async function apiToken(): Promise<string | null> {
  const id = process.env.BF_SPOTIFY_CLIENT_ID;
  const secret = process.env.BF_SPOTIFY_CLIENT_SECRET;
  if (!id || !secret) return null;
  const cached = tokenCache.__bfSpotifyToken;
  if (cached && cached.until > Date.now() + 30_000) return cached.value;
  const r = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(15_000),
  });
  if (!r.ok) return null; // bad credentials fall back to the embed page
  const j = (await r.json()) as { access_token: string; expires_in: number };
  tokenCache.__bfSpotifyToken = { value: j.access_token, until: Date.now() + j.expires_in * 1000 };
  return j.access_token;
}

async function fromApi(id: string, token: string): Promise<SpotifyTrack | null> {
  const r = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 404 || r.status === 400) throw new MatchError("UNSUPPORTED", "Spotify has no track with this id.");
  if (!r.ok) return null;
  const t = (await r.json()) as { name: string; artists: { name: string }[]; album?: { name: string; images?: { url: string; width: number }[] }; duration_ms: number; external_ids?: { isrc?: string } };
  const images = [...(t.album?.images ?? [])].sort((a, b) => b.width - a.width);
  return {
    id,
    url: `https://open.spotify.com/track/${id}`,
    title: t.name,
    artists: t.artists.map((a) => a.name),
    album: t.album?.name,
    durationSec: t.duration_ms / 1000,
    coverUrl: images[0]?.url,
    isrc: t.external_ids?.isrc,
    via: "api",
  };
}

async function fromEmbed(id: string): Promise<SpotifyTrack> {
  let html: string;
  try {
    const r = await fetch(`https://open.spotify.com/embed/track/${id}`, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(15_000) });
    if (r.status === 404) throw new MatchError("UNSUPPORTED", "Spotify has no track with this id.");
    if (!r.ok) throw new MatchError("NETWORK", `Spotify answered HTTP ${r.status}.`);
    html = await r.text();
  } catch (e) {
    if (e instanceof MatchError) throw e;
    throw new MatchError("NETWORK", "Spotify did not answer — check the connection and try again.");
  }
  const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
  let e: { name?: string; title?: string; artists?: { name: string }[]; duration?: number; visualIdentity?: { image?: { url: string; maxWidth: number }[] } } | undefined;
  try {
    e = m ? JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity : undefined;
  } catch {
    e = undefined;
  }
  if (!e?.artists?.length || !e.duration) throw new MatchError("ENGINE_ERROR", "Spotify's embed page changed and no longer exposes the track data. Set BF_SPOTIFY_CLIENT_ID and BF_SPOTIFY_CLIENT_SECRET to read it from the Web API instead.");
  const images = [...(e.visualIdentity?.image ?? [])].sort((a, b) => b.maxWidth - a.maxWidth);
  return {
    id,
    url: `https://open.spotify.com/track/${id}`,
    title: e.name ?? e.title ?? "",
    artists: e.artists.map((a) => a.name),
    durationSec: e.duration / 1000,
    coverUrl: images[0]?.url,
    via: "embed",
  };
}

/** Web API when the client's own credentials are set (adds album + ISRC), else the public embed page. */
export async function fetchSpotifyTrack(id: string): Promise<SpotifyTrack> {
  const token = await apiToken().catch(() => null);
  if (token) {
    const t = await fromApi(id, token).catch((e: unknown) => {
      if (e instanceof MatchError) throw e;
      return null;
    });
    if (t) return t;
  }
  return fromEmbed(id);
}

/** Saves the Spotify cover next to the staged audio (Spotify image CDN only). */
export async function saveCover(coverUrl: string, dest: string): Promise<boolean> {
  try {
    const u = new URL(coverUrl);
    if (u.protocol !== "https:" || !COVER_HOSTS.test(u.hostname)) return false;
    const r = await fetch(u, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok || !(r.headers.get("content-type") ?? "").startsWith("image/")) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 5 * 1024 * 1024) return false;
    await writeFile(dest, buf);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* YouTube candidates                                                  */
/* ------------------------------------------------------------------ */

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

/** The part of a Spotify title that a YouTube upload is expected to repeat. */
function coreTitle(t: string) {
  return t
    .replace(/\s*[([](?:feat|ft|with)\.?\s[^)\]]*[)\]]/gi, "")
    .replace(/\s+-\s+.*(?:remaster|version|edit|mix|mono|stereo|live|deluxe).*$/i, "")
    .trim();
}

/**
 * Version markers (English, Spanish, Portuguese), matched on normalised text:
 * lowercase, no accents, punctuation as spaces. Penalised only when the
 * reference itself doesn't carry them. `channel` also checks the uploader,
 * for channels that only publish one kind of non-original audio
 * (e.g. "Pistas De Reggaeton Famosas", "Sing King Karaoke").
 */
const MARKERS: { flag: MatchFlag; re: RegExp; channel?: RegExp; penalty: number }[] = [
  { flag: "live", re: /\blive\b|\ben vivo\b|\bao vivo\b|\ben directo\b|\bconcert\b|\bconcierto\b/, penalty: 40 },
  // "(Cover Audio)" / "Cover Art" in Spanish uploads means the album artwork, not a cover version.
  { flag: "cover", re: /(?<!\balbum )\bcovers?\b(?! (audio|art|artwork|video|oficial|official)\b)|\btributo\b|\bparod(y|ia)\b/, penalty: 40 },
  { flag: "remix", re: /\bremix(es)?\b|\brmx\b|\bbootleg\b|\bmashup\b|\bflip\b|\bacoustic\b|\bacustic[oa]\b|\bunplugged\b/, penalty: 40 },
  { flag: "altered", re: /\bsped ?up\b|\bslowed\b|\breverb\b|\bnightcore\b|\b8d\b|\bbass ?boost(ed)?\b|\bacelerad[oa]\b|\bralentizad[oa]\b/, penalty: 45 },
  { flag: "karaoke", re: /\bkaraoke\b|\bsing ?along\b|\bkarafun\b/, channel: /\bkaraoke\b|\bkarafun\b/, penalty: 45 },
  {
    flag: "instrumental",
    re: /\binstrumental(es)?\b|\binst\b|\bpistas?\b|\bsin voz\b|\bsem voz\b|\btype beats?\b|\bbeats?\b|\bbase (instrumental|de)\b|\bbacking tracks?\b|\bminus one\b|\boff vocal\b|\bplayback\b/,
    channel: /\binstrumental(es)?\b|\bpistas?\b|\btype beats?\b|\bbacking tracks?\b/,
    penalty: 45,
  },
  { flag: "acapella", re: /\ba ?capp?ella\b|\bvocals? only\b|\bisolated vocals?\b|\bsolo voz\b|\bvoz sola\b|\bso voz\b/, channel: /\ba ?capp?ellas?\b/, penalty: 45 },
  { flag: "extended", re: /\bextended\b|\bextendid[oa]\b|\bfull album\b|\balbum completo\b|\b\d+ hours?\b|\b\d+ horas?\b|\bloop\b/, penalty: 30 },
  { flag: "lyric-video", re: /\blyrics?\b|\bletras?\b|\blegendad[oa]\b/, penalty: 5 },
  { flag: "low-quality", re: /\blow quality\b|\bbaja calidad\b|\bbaixa qualidade\b|\blq\b/, penalty: 30 },
];

interface FlatEntry {
  id?: string;
  title?: string;
  channel?: string;
  uploader?: string;
  duration?: number | null;
  live_status?: string | null;
}

export function scoreCandidate(ref: SpotifyTrack, e: Required<Pick<FlatEntry, "id" | "title">> & FlatEntry): MatchCandidate {
  const title = e.title;
  const channel = e.channel ?? e.uploader ?? "";
  const duration = Math.round(Number(e.duration ?? 0));
  const delta = Math.abs(duration - ref.durationSec);
  const hay = norm(`${title} ${channel}`);
  const refNorm = norm(`${ref.title} ${ref.album ?? ""}`);
  const flags: MatchFlag[] = [];
  let score = 0;

  // duration: the strongest signal — the validator later enforces it with the configured tolerance
  score += delta <= 1 ? 45 : delta <= 2 ? 40 : delta <= 5 ? 25 : delta <= 10 ? 10 : 0;
  if (delta > 5) flags.push("duration-mismatch");

  // title: share of the reference title's words present in the upload
  const want = tokens(coreTitle(ref.title));
  const have = new Set(tokens(title));
  score += want.length ? Math.round((30 * want.filter((w) => have.has(w)).length) / want.length) : 0;

  // artist: named in the title/channel, and whether the channel is the artist's own
  const primary = norm(ref.artists[0] ?? "");
  if (primary && ` ${hay} `.includes(` ${primary} `)) score += 10;
  // "Alexis y Fido - Topic", "AlexisyFidoOfficial", "RickAstleyVEVO" → the artist's own channel
  const bare = (x: string) => norm(x).replace(/ /g, "");
  const ch = bare(channel).replace(/(topic|vevo|official|oficial|music|musica|tv)+$/, "");
  const official = !!ch && ref.artists.some((a) => bare(a) === ch);
  if (official) score += 15;

  // "ft. X" / "feat. X" / "with X" crediting someone Spotify doesn't: another version (e.g. a remix).
  const credited = /\b(?:ft|feat|featuring|with)\b\.?\s+([^()[\]|]+)/i.exec(title)?.[1];
  if (credited) {
    const known = new Set([...ref.artists.flatMap(tokens), ...tokens(ref.title), "and", "x"]);
    if (tokens(credited).some((w) => !known.has(w))) {
      flags.push("other-artist");
      score -= 40;
    }
  }

  const titleNorm = norm(title);
  const channelNorm = norm(channel);
  for (const m of MARKERS) {
    if ((m.re.test(titleNorm) || !!m.channel?.test(channelNorm)) && !m.re.test(refNorm)) {
      flags.push(m.flag);
      score -= m.penalty;
    }
  }

  return {
    id: e.id,
    url: `https://www.youtube.com/watch?v=${e.id}`,
    title,
    channel,
    durationSec: duration,
    deltaSec: Math.round(delta * 10) / 10,
    score: Math.max(0, Math.min(100, score)),
    official,
    flags,
  };
}

/* ------------------------------------------------------------------ */
/* audio quality                                                       */
/* ------------------------------------------------------------------ */

export interface AudioQuality {
  /** Highest band (kHz) still carrying real content — a 128 kbps MP3 rip stops near 16, a master reaches ≥ 19.5. */
  cutoffKHz: number;
  /** Treble level relative to the whole signal, dB (16.5 kHz + 19.5 kHz bands summed): higher is better. */
  hfDb: number;
  full: boolean;
}

const BANDS_KHZ = [11, 13, 15, 16.5, 18, 19.5];
/** A band "carries content" when it is at most this many dB below the whole signal. */
const BAND_FLOOR_DB = -48;

/**
 * Measures how much treble survives in an audio sample. Uploads re-encoded
 * from old MP3s are low-passed (cut at ~16 kHz or lower) whatever bitrate
 * YouTube reports, so this — not the stream bitrate — tells a master from a rip.
 * One FFmpeg pass: the signal is split and each copy high-passed (48 dB/oct).
 */
export async function measureQuality(file: string, skipSec: number): Promise<AudioQuality | null> {
  const hp = (khz: number) => Array(4).fill(`highpass=f=${khz * 1000}`).join(",");
  const graph = [`[0:a]asplit=${BANDS_KHZ.length + 1}${[0, ...BANDS_KHZ].map((_, i) => `[s${i}]`).join("")}`, `[s0]volumedetect[o0]`, ...BANDS_KHZ.map((k, i) => `[s${i + 1}]${hp(k)},volumedetect[o${i + 1}]`)].join(";");
  const maps = [0, ...BANDS_KHZ].flatMap((_, i) => ["-map", `[o${i}]`]);
  const r = await runTool("ffmpeg", ["-hide_banner", "-nostats", "-ss", String(skipSec), "-i", file, "-filter_complex", graph, ...maps, "-f", "null", "-"], { timeoutMs: 30_000 });
  // "[Parsed_volumedetect_N @ …] mean_volume: -12.3 dB" — N follows the graph order: whole signal, then each band.
  const levels = [...r.stderr.matchAll(/Parsed_volumedetect_(\d+)[^\]]*\] mean_volume: (-?[\d.]+|-inf) dB/g)]
    .map((m) => ({ n: Number(m[1]), db: m[2] === "-inf" ? -120 : Number(m[2]) }))
    .sort((a, b) => a.n - b.n)
    .map((x) => x.db);
  if (levels.length !== BANDS_KHZ.length + 1 || levels[0] <= -90) return null; // unreadable or silent sample
  const rel = levels.slice(1).map((db) => db - levels[0]);
  let cutoffKHz = 0;
  for (let i = 0; i < BANDS_KHZ.length && rel[i] > BAND_FLOOR_DB; i++) cutoffKHz = BANDS_KHZ[i];
  const at = (khz: number) => rel[BANDS_KHZ.indexOf(khz)];
  return { cutoffKHz, hfDb: Math.round((at(16.5) + at(19.5)) * 10) / 10, full: at(16.5) > -40 };
}

/** Fetches the first bytes of an audio stream URL that yt-dlp resolved (YouTube's media CDN only). */
export async function sampleStream(url: string, headers: Record<string, string>, dest: string, bytes = 1_200_000): Promise<boolean> {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || !/(^|\.)googlevideo\.com$/.test(u.hostname)) return false;
    const r = await fetch(u, { headers: { ...headers, Range: `bytes=0-${bytes - 1}` }, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return false;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 64 * 1024) return false;
    await writeFile(dest, buf);
    return true;
  } catch {
    return false;
  }
}

async function ytSearch(query: string, n: number): Promise<FlatEntry[]> {
  const r = await runTool("yt-dlp", ["-J", "--flat-playlist", "--no-warnings", "--", `ytsearch${n}:${query}`], { timeoutMs: 45_000 });
  try {
    return ((JSON.parse(r.stdout) as { entries?: FlatEntry[] }).entries ?? []).filter(Boolean);
  } catch {
    if (r.timedOut) throw new MatchError("NETWORK", "YouTube search did not answer within 45 s.");
    const text = `${r.stderr}\n${r.stdout}`;
    if (/not a bot|sign in to confirm/i.test(text)) throw new MatchError("ACCESS_REQUIRED", BOT_CHECK);
    throw new MatchError(/network|timed? ?out|getaddrinfo|connection/i.test(text) ? "NETWORK" : "ENGINE_ERROR", text.trim().split(/\r?\n/).at(-1)?.replace(/^ERROR:\s*/, "").slice(0, 300) || "YouTube search failed.");
  }
}

/** Two YouTube searches in parallel, merged, scored and ranked (best first). */
export async function findCandidates(ref: SpotifyTrack, limit = 6): Promise<MatchCandidate[]> {
  const artist = ref.artists[0] ?? "";
  const title = coreTitle(ref.title);
  const results = await Promise.allSettled([ytSearch(`${artist} - ${title}`, 10), ytSearch(`${artist} ${title} audio`, 6)]);
  const ok = results.filter((r): r is PromiseFulfilledResult<FlatEntry[]> => r.status === "fulfilled");
  if (!ok.length) throw (results[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  const out: MatchCandidate[] = [];
  for (const e of ok.flatMap((r) => r.value)) {
    if (!e.id || !/^[A-Za-z0-9_-]{11}$/.test(e.id) || !e.title || seen.has(e.id)) continue;
    if (!e.duration || e.live_status === "is_live" || e.live_status === "is_upcoming") continue;
    seen.add(e.id);
    out.push(scoreCandidate(ref, { ...e, id: e.id, title: e.title }));
  }
  // Higher score first; on ties, the closer duration.
  return out.sort((a, b) => b.score - a.score || a.deltaSec - b.deltaSec).slice(0, limit);
}
