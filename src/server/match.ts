/**
 * Match engine: a Spotify or Apple Music link supplies the reference (title,
 * artists, duration, cover), YouTube supplies the audio. It needs no
 * credentials: Spotify's public embed page and Apple's iTunes Lookup API
 * carry the track data. It picks the
 * upload itself: the right recording first (version markers, duration), then
 * the best measured audio quality among the closest matches. The download is
 * a plain yt-dlp fetch of that stream, kept as received.
 */
import { writeFile } from "node:fs/promises";
import { runTool } from "./tools";
import type { CollectionInfo, CollectionTrack, MatchCandidate, MatchFlag } from "@/lib/worker-types";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const COVER_HOSTS = /(^|\.)(spotifycdn\.com|scdn\.co|mzstatic\.com)$/;

export type RefProvider = "spotify" | "apple-music";
export const PROVIDER_NAME: Record<RefProvider, string> = { spotify: "Spotify", "apple-music": "Apple Music" };

/** The catalog track a Match job reproduces. */
export interface RefTrack {
  provider: RefProvider;
  id: string;
  url: string;
  title: string;
  artists: string[];
  album?: string;
  durationSec: number;
  coverUrl?: string;
  isrc?: string;
  /** Where the data came from: Spotify's Web API (client credentials) or public embed page, or Apple's iTunes Lookup API. */
  via: "api" | "embed" | "itunes";
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

function spotifyTrackId(u: URL): string | null {
  return /\/track\/([A-Za-z0-9]{22})(?:[/?#]|$)/.exec(u.pathname + "/")?.[1] ?? null;
}

/**
 * Apple Music song id and storefront: music.apple.com/<cc>/song/<slug>/<id>,
 * or an album link with the song in ?i=<id>.
 */
function appleTrackId(u: URL): { id: string; country: string } | null {
  const id = u.searchParams.get("i") ?? /\/song\/(?:[^/]+\/)?(\d+)(?:[/?#]|$)/.exec(u.pathname + "/")?.[1];
  if (!id || !/^\d{1,15}$/.test(id)) return null;
  const country = /^\/([a-z]{2})\//i.exec(u.pathname)?.[1]?.toLowerCase() ?? "us";
  return { id, country };
}

/** Which catalog track a link points to, if Match can take it. */
export function referenceOf(u: URL): { provider: RefProvider; id: string; country?: string } | null {
  const h = u.hostname.replace(/^www\./, "");
  if (h === "open.spotify.com") {
    const id = spotifyTrackId(u);
    return id ? { provider: "spotify", id } : null;
  }
  if (h === "music.apple.com") {
    const a = appleTrackId(u);
    return a ? { provider: "apple-music", ...a } : null;
  }
  return null;
}

export async function fetchReference(ref: { provider: RefProvider; id: string; country?: string }): Promise<RefTrack> {
  return ref.provider === "spotify" ? fetchSpotifyTrack(ref.id) : fetchAppleTrack(ref.id, ref.country ?? "us");
}

/* ------------------------------------------------------------------ */
/* Apple Music reference (iTunes Lookup API, public)                   */
/* ------------------------------------------------------------------ */

async function fetchAppleTrack(id: string, country: string): Promise<RefTrack> {
  let j: { resultCount: number; results: { kind?: string; trackName?: string; artistName?: string; collectionName?: string; trackTimeMillis?: number; artworkUrl100?: string; trackViewUrl?: string }[] };
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${id}&country=${country}&entity=song`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new MatchError("NETWORK", `Apple answered HTTP ${r.status}.`);
    j = await r.json();
  } catch (e) {
    if (e instanceof MatchError) throw e;
    throw new MatchError("NETWORK", "Apple Music did not answer — check the connection and try again.");
  }
  const t = j.results.find((x) => x.kind === "song");
  if (!t?.trackName || !t.artistName || !t.trackTimeMillis) throw new MatchError("UNSUPPORTED", `Apple Music has no song with id ${id} in the “${country.toUpperCase()}” store.`);
  // "Simon & Garfunkel" stays whole for the search; its parts also count as credited artists.
  const parts = t.artistName.split(/\s*(?:,|&| and | y )\s*/i).map((x) => x.trim()).filter(Boolean);
  return {
    provider: "apple-music",
    id,
    url: `https://music.apple.com/${country}/song/${id}`,
    title: t.trackName,
    artists: [...new Set([t.artistName, ...parts])],
    album: t.collectionName,
    durationSec: t.trackTimeMillis / 1000,
    // The artwork URL encodes its size; ask for 1000×1000.
    coverUrl: t.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/1000x1000bb.$1"),
    via: "itunes",
  };
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

async function fromApi(id: string, token: string): Promise<RefTrack | null> {
  const r = await fetch(`https://api.spotify.com/v1/tracks/${id}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 404 || r.status === 400) throw new MatchError("UNSUPPORTED", "Spotify has no track with this id.");
  if (!r.ok) return null;
  const t = (await r.json()) as { name: string; artists: { name: string }[]; album?: { name: string; images?: { url: string; width: number }[] }; duration_ms: number; external_ids?: { isrc?: string } };
  const images = [...(t.album?.images ?? [])].sort((a, b) => b.width - a.width);
  return {
    provider: "spotify",
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

async function fromEmbed(id: string): Promise<RefTrack> {
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
    provider: "spotify",
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
async function fetchSpotifyTrack(id: string): Promise<RefTrack> {
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

/* ------------------------------------------------------------------ */
/* collections: Spotify and Apple Music playlists and albums           */
/* ------------------------------------------------------------------ */

/** Hard cap on the songs read from one list, so one link can't queue thousands of downloads. */
const MAX_COLLECTION = 500;

export type CollectionTarget = { provider: RefProvider; kind: "playlist" | "album"; id: string; country?: string };

/** A playlist or album link Match can expand into songs, or an explanation of why not. */
export function collectionOf(u: URL): CollectionTarget | { error: string } | null {
  const h = u.hostname.replace(/^www\./, "");
  if (h === "open.spotify.com") {
    const m = /\/(playlist|album)\/([A-Za-z0-9]{22})(?:[/?#]|$)/.exec(u.pathname + "/");
    if (m) return { provider: "spotify", kind: m[1] as "playlist" | "album", id: m[2] };
    if (/\/(artist|show|episode)\//.test(u.pathname)) return { error: "Artist pages and podcasts can't be ingested. Use a playlist, an album or a single song." };
    return null;
  }
  if (h === "music.apple.com") {
    if (u.searchParams.has("i")) return null; // a song inside an album link
    const m = /^\/([a-z]{2})\/album\/(?:[^/]+\/)?(\d+)(?:[/?#]|$)/i.exec(u.pathname + "/");
    if (m) return { provider: "apple-music", kind: "album", id: m[2], country: m[1].toLowerCase() };
    const pl = /^\/([a-z]{2})\/playlist\/(?:[^/]+\/)?(pl\.[A-Za-z0-9.-]+)(?:[/?#]|$)/i.exec(u.pathname + "/");
    if (pl) return { provider: "apple-music", kind: "playlist", id: pl[2], country: pl[1].toLowerCase() };
    if (/\/playlist\//.test(u.pathname)) return { error: "Only public Apple Music playlists (music.apple.com/<country>/playlist/<name>/pl.…) can be read; personal library playlists are private." };
    return null;
  }
  return null;
}

type SpotifyApiTrack = { id: string | null; name: string; type?: string; artists: { name: string }[]; album?: { name: string }; duration_ms: number } | null;

async function spotifyApi<T>(path: string, token: string): Promise<T | null> {
  const r = await fetch(`https://api.spotify.com/v1/${path}`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  return r.ok ? ((await r.json()) as T) : null;
}

/** Spotify Web API (client credentials): every song, paged. Null when the API won't serve this list. */
async function spotifyCollectionApi(t: CollectionTarget, token: string): Promise<CollectionInfo | null> {
  const toTrack = (x: SpotifyApiTrack, album?: string): CollectionTrack | null =>
    x?.id && x.type !== "episode" ? { url: `https://open.spotify.com/track/${x.id}`, title: x.name, artists: x.artists.map((a) => a.name), album: x.album?.name ?? album, durationSec: x.duration_ms / 1000 } : null;
  const tracks: CollectionTrack[] = [];
  if (t.kind === "playlist") {
    const head = await spotifyApi<{ name: string; owner?: { display_name?: string }; images?: { url: string; width: number | null }[] }>(`playlists/${t.id}?fields=name,owner(display_name),images`, token);
    if (!head) return null; // e.g. Spotify-owned editorial playlists are closed to new apps
    let next: string | null = `playlists/${t.id}/tracks?limit=100&fields=items(track(id,name,type,artists(name),album(name),duration_ms)),next`;
    while (next && tracks.length < MAX_COLLECTION) {
      const page: { items: { track: SpotifyApiTrack }[]; next: string | null } | null = await spotifyApi(next.replace("https://api.spotify.com/v1/", ""), token);
      if (!page) break;
      for (const it of page.items) {
        const tr = toTrack(it.track);
        if (tr) tracks.push(tr);
      }
      next = page.next;
    }
    return { provider: "spotify", kind: "playlist", url: `https://open.spotify.com/playlist/${t.id}`, name: head.name, owner: head.owner?.display_name, coverUrl: head.images?.[0]?.url, tracks: tracks.slice(0, MAX_COLLECTION), mayBeTruncated: false };
  }
  const album = await spotifyApi<{ name: string; artists: { name: string }[]; images?: { url: string }[]; tracks: { items: SpotifyApiTrack[]; next: string | null } }>(`albums/${t.id}`, token);
  if (!album) return null;
  let page: { items: SpotifyApiTrack[]; next: string | null } | null = album.tracks;
  while (page && tracks.length < MAX_COLLECTION) {
    for (const it of page.items) {
      const tr = toTrack(it, album.name);
      if (tr) tracks.push(tr);
    }
    page = page.next ? await spotifyApi(page.next.replace("https://api.spotify.com/v1/", ""), token) : null;
  }
  return { provider: "spotify", kind: "album", url: `https://open.spotify.com/album/${t.id}`, name: album.name, owner: album.artists.map((a) => a.name).join(", "), coverUrl: album.images?.[0]?.url, tracks, mayBeTruncated: false };
}

/** Spotify's public embed page: no credentials, but it lists at most 100 songs. */
async function spotifyCollectionEmbed(t: CollectionTarget): Promise<CollectionInfo> {
  let html: string;
  try {
    const r = await fetch(`https://open.spotify.com/embed/${t.kind}/${t.id}`, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 404) throw new MatchError("UNSUPPORTED", `Spotify has no public ${t.kind} with this id (private playlists can't be read).`);
    if (!r.ok) throw new MatchError("NETWORK", `Spotify answered HTTP ${r.status}.`);
    html = await r.text();
  } catch (e) {
    if (e instanceof MatchError) throw e;
    throw new MatchError("NETWORK", "Spotify did not answer — check the connection and try again.");
  }
  type Entity = {
    name?: string;
    subtitle?: string;
    coverArt?: { sources?: { url: string }[] };
    visualIdentity?: { image?: { url: string; maxWidth: number }[] };
    trackList?: { uri: string; title: string; subtitle?: string; duration: number; entityType?: string }[];
  };
  let e: Entity | undefined;
  try {
    const m = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    e = m ? JSON.parse(m[1])?.props?.pageProps?.state?.data?.entity : undefined;
  } catch {
    e = undefined;
  }
  if (!e?.trackList) throw new MatchError("ENGINE_ERROR", "Spotify's embed page changed and no longer lists the songs. Set BF_SPOTIFY_CLIENT_ID and BF_SPOTIFY_CLIENT_SECRET to read it from the Web API instead.");
  const tracks = e.trackList
    .filter((x) => (x.entityType ?? "track") === "track" && /^spotify:track:[A-Za-z0-9]{22}$/.test(x.uri) && x.duration > 0)
    .map((x) => ({
      url: `https://open.spotify.com/track/${x.uri.split(":")[2]}`,
      title: x.title,
      artists: (x.subtitle ?? "").split(/,\s*/).filter(Boolean),
      album: t.kind === "album" ? e.name : undefined,
      durationSec: x.duration / 1000,
    }));
  const images = [...(e.visualIdentity?.image ?? [])].sort((a, b) => b.maxWidth - a.maxWidth);
  return {
    provider: "spotify",
    kind: t.kind,
    url: `https://open.spotify.com/${t.kind}/${t.id}`,
    name: e.name ?? "",
    owner: e.subtitle,
    coverUrl: images[0]?.url ?? e.coverArt?.sources?.[0]?.url,
    tracks,
    mayBeTruncated: tracks.length >= 100,
  };
}

type ITunesSong = { wrapperType: string; kind?: string; trackId?: number; trackName?: string; artistName?: string; collectionName?: string; trackTimeMillis?: number; artworkUrl100?: string; discNumber?: number; trackNumber?: number };

/** iTunes Lookup for many song ids (chunked), keeping only playable songs. */
async function lookupSongs(ids: string[], country: string): Promise<Map<string, ITunesSong>> {
  const out = new Map<string, ITunesSong>();
  for (let i = 0; i < ids.length; i += 150) {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${ids.slice(i, i + 150).join(",")}&country=${country}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new MatchError("NETWORK", `Apple answered HTTP ${r.status}.`);
    for (const x of ((await r.json()) as { results: ITunesSong[] }).results) if (x.kind === "song" && x.trackId) out.set(String(x.trackId), x);
  }
  return out;
}

/**
 * Public Apple Music playlist: Apple's catalog API doesn't serve playlists, so
 * the song ids come from the playlist page's schema.org data (what search
 * engines read), and the songs themselves from the iTunes Lookup API.
 */
async function applePlaylist(t: CollectionTarget): Promise<CollectionInfo> {
  const country = t.country ?? "us";
  const url = `https://music.apple.com/${country}/playlist/${t.id}`;
  let html: string;
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en" }, signal: AbortSignal.timeout(20_000) });
    if (r.status === 404) throw new MatchError("UNSUPPORTED", `Apple Music has no public playlist ${t.id} in the “${country.toUpperCase()}” store.`);
    if (!r.ok) throw new MatchError("NETWORK", `Apple answered HTTP ${r.status}.`);
    html = await r.text();
  } catch (e) {
    if (e instanceof MatchError) throw e;
    throw new MatchError("NETWORK", "Apple Music did not answer — check the connection and try again.");
  }
  let ld: { name?: string; author?: { name?: string }; numTracks?: number; track?: { url?: string }[] } | undefined;
  try {
    const m = /<script[^>]*id="?schema:music-playlist"?[^>]*>([\s\S]*?)<\/script>/.exec(html);
    ld = m ? JSON.parse(m[1]) : undefined;
  } catch {
    ld = undefined;
  }
  if (!ld?.track) throw new MatchError("ENGINE_ERROR", "Apple Music's playlist page changed and no longer lists its songs.");
  const ids = ld.track.map((x) => (x.url ? /\/song\/(?:[^/]+\/)?(\d+)/.exec(x.url)?.[1] ?? new URL(x.url).searchParams.get("i") : null)).filter((x): x is string => !!x);
  const songs = await lookupSongs(ids.slice(0, MAX_COLLECTION), country);
  const cover = /<meta property="og:image" content="([^"]+)"/.exec(html)?.[1];
  return {
    provider: "apple-music",
    kind: "playlist",
    url,
    name: ld.name ?? "",
    owner: ld.author?.name,
    coverUrl: cover?.replace(/&amp;/g, "&"),
    tracks: ids
      .map((id) => songs.get(id))
      .filter((x): x is ITunesSong => !!x?.trackName && !!x.artistName && !!x.trackTimeMillis)
      .map((x) => ({ url: `https://music.apple.com/${country}/song/${x.trackId}`, title: x.trackName!, artists: [x.artistName!], album: x.collectionName, durationSec: x.trackTimeMillis! / 1000 })),
    // The page lists a limited number of songs; numTracks says how many the playlist really has.
    mayBeTruncated: (ld.numTracks ?? ids.length) > ids.length,
  };
}

/** Apple Music album through the iTunes Lookup API (public). */
async function appleAlbum(t: CollectionTarget): Promise<CollectionInfo> {
  const country = t.country ?? "us";
  let j: { results: ITunesSong[] };
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${t.id}&entity=song&limit=200&country=${country}`, { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new MatchError("NETWORK", `Apple answered HTTP ${r.status}.`);
    j = await r.json();
  } catch (e) {
    if (e instanceof MatchError) throw e;
    throw new MatchError("NETWORK", "Apple Music did not answer — check the connection and try again.");
  }
  const head = j.results.find((x) => x.wrapperType === "collection");
  if (!head) throw new MatchError("UNSUPPORTED", `Apple Music has no album with id ${t.id} in the “${country.toUpperCase()}” store.`);
  const songs = j.results
    .filter((x) => x.wrapperType === "track" && x.kind === "song" && x.trackId && x.trackName && x.artistName && x.trackTimeMillis)
    .sort((a, b) => (a.discNumber ?? 1) - (b.discNumber ?? 1) || (a.trackNumber ?? 0) - (b.trackNumber ?? 0));
  return {
    provider: "apple-music",
    kind: "album",
    url: `https://music.apple.com/${country}/album/${t.id}`,
    name: head.collectionName ?? "",
    owner: head.artistName,
    coverUrl: head.artworkUrl100?.replace(/\/\d+x\d+bb\.(jpg|png)$/, "/1000x1000bb.$1"),
    tracks: songs.map((x) => ({ url: `https://music.apple.com/${country}/song/${x.trackId}`, title: x.trackName!, artists: [x.artistName!], album: head.collectionName, durationSec: x.trackTimeMillis! / 1000 })),
    mayBeTruncated: false,
  };
}

/** Expands a playlist or album link into its songs (Web API when the client's Spotify credentials are set). */
export async function fetchCollection(t: CollectionTarget): Promise<CollectionInfo> {
  if (t.provider === "apple-music") return t.kind === "playlist" ? applePlaylist(t) : appleAlbum(t);
  const token = await apiToken().catch(() => null);
  const viaApi = token ? await spotifyCollectionApi(t, token).catch(() => null) : null;
  const c = viaApi ?? (await spotifyCollectionEmbed(t));
  return { ...c, tracks: c.tracks.slice(0, MAX_COLLECTION) };
}

/** Saves the reference cover next to the staged audio (Spotify / Apple image CDNs only). */
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

export function scoreCandidate(ref: RefTrack, e: Required<Pick<FlatEntry, "id" | "title">> & FlatEntry): MatchCandidate {
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
export async function findCandidates(ref: RefTrack, limit = 6): Promise<MatchCandidate[]> {
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
