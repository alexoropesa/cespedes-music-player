/**
 * Demo workspace seed — built on first load (and on "Reset demo workspace")
 * relative to the current time so relative timestamps stay meaningful.
 */
import { CATALOG_ARTISTS, ENGINE_INFO, PROVIDER_LABEL, VARIANTS, artistByKey, simulateBench, songByKey } from "./catalog";
import type {
  AudioFile,
  Authorization,
  AuditEvent,
  BenchSample,
  EngineId,
  IngestJob,
  IngestTool,
  JobEvent,
  Playlist,
  ReviewItem,
  Settings,
  State,
  Track,
  ValidationCheck,
} from "./types";
import { fakeSha256, seeded, slug } from "./util";

export const STATE_VERSION = 3;
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const DEFAULT_SETTINGS: Settings = {
  maxSizeMB: 100,
  maxDurationMin: 15,
  maxRetries: 3,
  autoRetryTransient: true,
  stagingDir: "/tmp/staging",
  libraryDir: "./library",
  defaultEngine: "yt-dlp",
  engines: {
    "yt-dlp": { version: ENGINE_INFO["yt-dlp"].version, enabled: true },
    spotdl: { version: ENGINE_INFO.spotdl.version, enabled: true },
    freyrjs: { version: ENGINE_INFO.freyrjs.version, enabled: true },
  },
  durationToleranceSec: 2,
  conversionPolicy: "if-unplayable",
  normalizeDerivative: false,
  operator: { name: "Alex Oropesa", email: "operator@bitferalda.local" },
};

export const EMPTY_STATE: State = {
  version: STATE_VERSION,
  seededAt: 0,
  artists: [],
  tracks: [],
  files: [],
  authorizations: [],
  jobs: [],
  playlists: [],
  references: [],
  reviews: [],
  samples: [],
  benchRuns: [],
  audit: [],
  duplicates: [],
  connections: [],
  settings: DEFAULT_SETTINGS,
  queuePaused: false,
  counters: {},
};

export const CHECK_ORDER: ValidationCheck["key"][] = ["complete", "codec", "duration", "hash", "duplicate"];
export const CHECK_LABEL: Record<ValidationCheck["key"], string> = {
  complete: "Complete file",
  codec: "Real codec (ffprobe)",
  duration: "Duration",
  hash: "SHA-256 hash",
  duplicate: "Duplicate check",
};

export function codecLabel(codec: string) {
  switch (codec) {
    case "opus":
      return "Opus";
    case "aac":
      return "AAC-LC";
    case "mp3":
      return "MP3";
    case "flac":
      return "FLAC";
    case "vorbis":
      return "Vorbis";
    case "alac":
      return "ALAC";
    case "pcm_s16le":
      return "PCM 16-bit";
    case "pcm_s24le":
      return "PCM 24-bit";
    default:
      return codec.toUpperCase();
  }
}

export const isLossless = (codec: string) => codec === "flac" || codec === "alac" || codec.startsWith("pcm");

export function seedState(now: number, ip: string): State {
  const operator = DEFAULT_SETTINGS.operator.email;
  const artists = CATALOG_ARTISTS.map((a, i) => ({
    id: `art_${a.key}`,
    name: a.name,
    tier: a.tier,
    country: a.country,
    notes: a.key === "studio" ? "Client's own studio recordings." : undefined,
    createdAt: now - (40 - i) * DAY,
  }));

  const auth = (
    n: number,
    p: Omit<Authorization, "id" | "code" | "createdAt" | "createdBy">,
    createdDaysAgo: number,
  ): Authorization => ({
    id: `auth_${n}`,
    code: `AUTH-${String(n).padStart(4, "0")}`,
    createdAt: now - createdDaysAgo * DAY,
    createdBy: operator,
    ...p,
  });

  const authorizations: Authorization[] = [
    auth(1, { basis: "own-content", holder: "Bitferalda Studio (client)", scope: ["copy", "retain", "derivatives"], territory: "Worldwide", validFrom: now - 60 * DAY, validUntil: null, evidence: "Master ownership register #BS-2026-014", notes: "Client-owned studio sessions.", review: "approved" }, 38),
    auth(2, { basis: "rights-holder", holder: "Paloma Cruz (artist, self-released)", scope: ["copy", "retain"], territory: "ES, MX", validFrom: now - 20 * DAY, validUntil: now + 240 * DAY, evidence: "Written permission by email · 2026-10-12", review: "approved" }, 21),
    auth(3, { basis: "license", holder: "Northern Static Records", scope: ["copy", "retain"], territory: "ES", validFrom: now - 75 * DAY, validUntil: now + 9 * DAY, evidence: "Personal-listening evaluation license NSR-EV-118", notes: "Renewal requested.", review: "approved" }, 30),
    auth(4, { basis: "purchase", holder: "Juno Barrett via Bandcamp", scope: ["copy", "retain", "derivatives"], territory: "Worldwide", validFrom: now - 33 * DAY, validUntil: null, evidence: "Bandcamp receipt BC-88213 (FLAC download)", review: "approved" }, 33),
    auth(5, { basis: "rights-holder", holder: "Puerto Norte Música (label)", scope: ["copy", "retain"], territory: "ES", validFrom: now - 120 * DAY, validUntil: now - 18 * DAY, evidence: "Permission letter PNM-2026-07 (expired)", notes: "Expired — files flagged as not usable until reviewed (RC-09).", review: "approved" }, 36),
    auth(6, { basis: "license", holder: "Static Orchard — CC BY-NC 4.0", scope: ["copy", "retain", "derivatives"], territory: "Worldwide", validFrom: now - 200 * DAY, validUntil: null, evidence: "License statement on the artist's Bandcamp page", review: "approved" }, 27),
    auth(7, { basis: "rights-holder", holder: "Afterhours Collective (label)", scope: ["copy", "retain"], territory: "ES", validFrom: now - 30 * DAY, validUntil: now + 150 * DAY, evidence: "Signed permission letter AH-PL-0291 (PDF)", review: "approved" }, 29),
    auth(8, { basis: "license", holder: "Lumen Ensemble", scope: ["copy", "retain"], territory: "ES", validFrom: now - 2 * DAY, validUntil: now + 365 * DAY, evidence: "Draft license — pending signature", notes: "Do not ingest until signed.", review: "under-review" }, 2),
    auth(9, { basis: "rights-holder", holder: "Oskar Mend (artist)", scope: ["copy", "retain", "derivatives"], territory: "Worldwide", validFrom: now - 14 * DAY, validUntil: now + 420 * DAY, evidence: "Permission via artist contact form · ticket OM-77", review: "approved" }, 14),
    auth(10, { basis: "rights-holder", holder: "Velvet Tides (band)", scope: ["copy", "retain"], territory: "ES, AR", validFrom: now - 6 * DAY, validUntil: now + 90 * DAY, evidence: "Email permission from band manager · 2026-10-27", review: "approved" }, 6),
  ];

  const tracks: Track[] = [];
  const files: AudioFile[] = [];
  const jobs: IngestJob[] = [];
  let trackN = 0;
  let jobN = 1000;

  const lib = DEFAULT_SETTINGS.libraryDir;

  function addTrack(opts: {
    variantKey: string;
    authId: string;
    tool: IngestTool;
    formatIdx?: number;
    codec?: string;
    container?: string;
    kbps?: number;
    asr?: number;
    ch?: number;
    daysAgo: number;
    plays: number;
    sizeOverride?: number;
  }) {
    const v = VARIANTS.find((x) => x.key === opts.variantKey)!;
    const song = songByKey(v.songKey);
    const artist = artistByKey(song.artist);
    trackN++;
    jobN++;
    const fmt = v.formats[opts.formatIdx ?? 0];
    const codec = opts.codec ?? fmt.codec;
    const container = opts.container ?? fmt.container;
    const kbps = opts.kbps ?? fmt.abrKbps;
    const ext = container === "mp4" ? "m4a" : container === "ogg" ? "opus" : container;
    const id = `trk_${String(trackN).padStart(3, "0")}`;
    const fileId = `file_${String(trackN).padStart(3, "0")}`;
    const jobId = `job_${jobN}`;
    const addedAt = now - opts.daysAgo * DAY - (trackN % 7) * HOUR;
    const sizeBytes = opts.sizeOverride ?? Math.round((kbps * 1000 * song.dur) / 8);
    const sha = fakeSha256(`${v.url}:${fmt.id}`);
    const toolVersion = opts.tool === "local-import" ? "browser-validator 1.0" : ENGINE_INFO[opts.tool].version;
    const path = `${lib}/originals/${slug(artist.name)}/${slug(song.title)}.${ext}`;
    files.push({
      id: fileId,
      trackId: id,
      kind: "original",
      codec,
      container,
      bitrateKbps: kbps,
      sampleRateHz: opts.asr ?? fmt.asrHz,
      channels: opts.ch ?? 2,
      sizeBytes,
      durationSec: song.dur + (seeded(id)() - 0.5) * 0.4,
      sha256: sha,
      path,
      createdAt: addedAt,
      audio: "synthetic",
      declaredExt: ext,
    });
    tracks.push({
      id,
      code: `TRK-${String(trackN).padStart(4, "0")}`,
      title: song.title,
      artistId: `art_${artist.key}`,
      album: song.album,
      durationSec: song.dur,
      addedAt,
      originalFileId: fileId,
      derivativeIds: [],
      authorizationId: opts.authId,
      provenance: {
        sourceUrl: v.url,
        sourcePlatform: PROVIDER_LABEL[v.provider],
        sourceId: v.url.split(/[=/]/).pop(),
        channel: v.channel,
        requested: opts.tool === "spotdl" || opts.tool === "freyrjs" ? { title: song.title, artist: artist.name, durationSec: song.dur } : undefined,
        tool: opts.tool,
        toolVersion,
        retrievedAt: addedAt - 2 * MIN,
        operator,
        ip,
        jobId,
      },
      plays: opts.plays,
      coverSeed: song.key,
    });
    const startedAt = addedAt - 3 * MIN;
    const dlMs = 2400 + (trackN * 613) % 4000;
    const events: JobEvent[] = [
      { at: startedAt - 20_000, kind: "pending", message: "Job accepted · authorization " + authorizations.find((a) => a.id === opts.authId)!.code + " recorded" },
      { at: startedAt, kind: "downloading", message: `Downloading into ${DEFAULT_SETTINGS.stagingDir}/${jobId}` },
      { at: startedAt + dlMs, kind: "validating", message: "Download complete · running validation" },
      { at: addedAt, kind: "ready", message: "Validated · original stored in library" },
    ];
    jobs.push({
      id: jobId,
      code: `ING-${jobN}`,
      mode: opts.tool === "local-import" ? "local-file" : "simulated",
      tool: opts.tool,
      toolVersion,
      status: "ready",
      paused: false,
      progress: 1,
      retries: 0,
      maxRetries: 3,
      limits: { maxSizeMB: 100, maxDurationMin: 15, toleranceSec: 2 },
      createdAt: startedAt - 20_000,
      startedAt,
      finishedAt: addedAt,
      source: {
        url: v.url,
        platform: PROVIDER_LABEL[v.provider],
        sourceId: v.url.split(/[=/]/).pop() ?? "",
        title: v.title,
        channel: v.channel,
        durationSec: v.durationSec,
        bitrateKbps: fmt.abrKbps,
        album: song.album,
        formats: v.formats,
        coverSeed: song.key,
      },
      formatId: fmt.id,
      identity: { title: song.title, artistId: `art_${artist.key}`, album: song.album },
      authorizationId: opts.authId,
      scenario: "ok",
      checks: [
        { key: "complete", status: "pass", detail: "Decoded end-to-end without errors" },
        { key: "codec", status: "pass", detail: `${codec} · ${container}` },
        { key: "duration", status: "pass", detail: "Within tolerance" },
        { key: "hash", status: "pass", detail: sha },
        { key: "duplicate", status: "pass", detail: "No identical hash in library" },
      ],
      metrics: { downloadMs: dlMs, processMs: 900 + (trackN * 211) % 1400, cpuPeakPct: 18 + (trackN * 7) % 40, memPeakMB: 80 + (trackN * 13) % 90, diskMB: +(sizeBytes / 1048576).toFixed(1) },
      events,
      trackId: id,
    });
    return id;
  }

  const t = {
    luz: addTrack({ variantKey: "luz-de-agosto:topic", authId: "auth_5", tool: "yt-dlp", daysAgo: 34, plays: 41 }),
    corazon: addTrack({ variantKey: "corazon-satelite:topic", authId: "auth_5", tool: "yt-dlp", daysAgo: 34, plays: 18 }),
    glass: addTrack({ variantKey: "glasshouse:topic", authId: "auth_3", tool: "spotdl", daysAgo: 28, plays: 57 }),
    ferry: addTrack({ variantKey: "midnight-ferry:topic", authId: "auth_3", tool: "spotdl", formatIdx: 1, daysAgo: 27, plays: 23 }),
    neon: addTrack({ variantKey: "neon-cathedral:topic", authId: "auth_7", tool: "yt-dlp", daysAgo: 22, plays: 36 }),
    gravity: addTrack({ variantKey: "gravity-talks:topic", authId: "auth_7", tool: "freyrjs", codec: "aac", container: "mp4", kbps: 320, asr: 44100, daysAgo: 21, plays: 12 }),
    cuarto: addTrack({ variantKey: "cuarto-azul:topic", authId: "auth_2", tool: "yt-dlp", daysAgo: 19, plays: 64 }),
    tarde: addTrack({ variantKey: "tarde-lenta:topic", authId: "auth_2", tool: "yt-dlp", formatIdx: 1, daysAgo: 19, plays: 29 }),
    field: addTrack({ variantKey: "fieldnotes:upload", authId: "auth_6", tool: "yt-dlp", daysAgo: 16, plays: 15 }),
    harbour: addTrack({ variantKey: "harbour-lights:topic", authId: "auth_4", tool: "local-import", codec: "flac", container: "flac", kbps: 1012, asr: 44100, daysAgo: 12, plays: 33 }),
    wren: addTrack({ variantKey: "wren:topic", authId: "auth_4", tool: "local-import", codec: "flac", container: "flac", kbps: 968, asr: 44100, daysAgo: 12, plays: 9 }),
    s1: addTrack({ variantKey: "session-01:master", authId: "auth_1", tool: "local-import", formatIdx: 1, daysAgo: 9, plays: 21 }),
    s2: addTrack({ variantKey: "session-02:master", authId: "auth_1", tool: "yt-dlp", daysAgo: 7, plays: 17 }),
    pulse: addTrack({ variantKey: "pulse-theory:upload", authId: "auth_9", tool: "yt-dlp", formatIdx: 1, daysAgo: 4, plays: 8 }),
  };
  // Local imports keep the purchase/own-file provenance instead of a public URL
  for (const id of [t.harbour, t.wren]) {
    const tr = tracks.find((x) => x.id === id)!;
    tr.provenance = { ...tr.provenance, sourceUrl: `file://imports/${slug(tr.title)}.flac`, sourcePlatform: "Bandcamp purchase", channel: "Bandcamp purchase (FLAC download)" };
  }
  {
    const tr = tracks.find((x) => x.id === t.s1)!;
    tr.provenance = { ...tr.provenance, sourceUrl: "file://imports/session-01-warmup-groove.wav", sourcePlatform: "Local file (studio export)", channel: "Studio export (own content)" };
  }
  // An optional derivative linked to its original (loudness-normalized copy)
  {
    const tr = tracks.find((x) => x.id === t.s2)!;
    const orig = files.find((f) => f.id === tr.originalFileId)!;
    const d: AudioFile = {
      ...orig,
      id: "file_s2_norm",
      kind: "derivative",
      derivedFrom: orig.id,
      derivativeReason: "Optional loudness normalization (−14 LUFS). Original untouched; normalization ≠ fidelity.",
      codec: "flac",
      sha256: fakeSha256("s2-norm"),
      path: orig.path.replace("/originals/", "/derivatives/").replace(".flac", ".norm-14lufs.flac"),
      createdAt: orig.createdAt + 6 * HOUR,
    };
    files.push(d);
    tr.derivativeIds = [d.id];
  }

  /* ------- non-ready jobs: failures, review, pending (live demo) ------- */
  function baseJob(n: number, variantKey: string, authId: string, tool: EngineId, p: Partial<IngestJob>): IngestJob {
    const v = VARIANTS.find((x) => x.key === variantKey)!;
    const song = songByKey(v.songKey);
    return {
      id: `job_${n}`,
      code: `ING-${n}`,
      mode: "simulated",
      tool,
      toolVersion: ENGINE_INFO[tool].version,
      status: "pending",
      paused: false,
      progress: 0,
      retries: 0,
      maxRetries: 3,
      limits: { maxSizeMB: 100, maxDurationMin: 15, toleranceSec: 2 },
      createdAt: now - 5 * MIN,
      source: {
        url: v.url,
        platform: PROVIDER_LABEL[v.provider],
        sourceId: v.url.split(/[=/]/).pop() ?? "",
        title: v.title,
        channel: v.channel,
        durationSec: v.durationSec,
        bitrateKbps: v.formats[0].abrKbps,
        album: song.album,
        formats: v.formats,
        coverSeed: song.key,
      },
      formatId: v.formats[0].id,
      identity: { title: song.title, artistId: `art_${song.artist}`, album: song.album },
      authorizationId: authId,
      scenario: v.scenario,
      checks: CHECK_ORDER.map((key) => ({ key, status: "pending" })),
      metrics: {},
      events: [{ at: now - 5 * MIN, kind: "pending", message: "Job accepted · authorization recorded before download" }],
      ...p,
    };
  }

  jobs.push(
    baseJob(1015, "westbound:video", "auth_7", "yt-dlp", {
      status: "failed",
      createdAt: now - 3 * DAY,
      startedAt: now - 3 * DAY + 20_000,
      finishedAt: now - 3 * DAY + 22_000,
      failure: { code: "ACCESS_REQUIRED", message: "Source requires sign-in or membership (HTTP 403). Limitation recorded — no alternative version substituted.", tool: "yt-dlp", version: ENGINE_INFO["yt-dlp"].version, retryable: false, at: now - 3 * DAY + 22_000 },
      events: [
        { at: now - 3 * DAY, kind: "pending", message: "Job accepted · AUTH-0007 recorded" },
        { at: now - 3 * DAY + 20_000, kind: "downloading", message: "Requesting media formats" },
        { at: now - 3 * DAY + 22_000, kind: "failed", message: "HTTP 403 — members-only content. Cookies/accounts are out of pilot scope." },
      ],
    }),
    baseJob(1016, "aurora-dawn:master", "auth_7", "yt-dlp", {
      status: "failed",
      createdAt: now - 2 * DAY,
      startedAt: now - 2 * DAY + 10_000,
      finishedAt: now - 2 * DAY + 52_000,
      progress: 0.42,
      formatId: "wav",
      failure: { code: "SIZE_LIMIT", message: "Size limit exceeded — download aborted at 100 MB (max 100 MB, source ≈ 226 MB). Partial file removed from staging.", tool: "yt-dlp", version: ENGINE_INFO["yt-dlp"].version, retryable: false, at: now - 2 * DAY + 52_000 },
      events: [
        { at: now - 2 * DAY, kind: "pending", message: "Job accepted" },
        { at: now - 2 * DAY + 10_000, kind: "downloading", message: "Downloading WAV 24-bit/96 kHz" },
        { at: now - 2 * DAY + 52_000, kind: "failed", message: "Aborted at 100 MB limit · staging cleaned" },
      ],
    }),
    baseJob(1017, "cuarto-azul:topic", "auth_2", "yt-dlp", {
      status: "failed",
      createdAt: now - 1 * DAY,
      startedAt: now - DAY + 8000,
      finishedAt: now - DAY + 16_000,
      progress: 1,
      failure: { code: "DUPLICATE", message: `Identical SHA-256 to "Cuarto Azul" (TRK-0007) already in library — no second copy added.`, tool: "yt-dlp", version: ENGINE_INFO["yt-dlp"].version, retryable: false, at: now - DAY + 16_000 },
      checks: [
        { key: "complete", status: "pass", detail: "Decoded end-to-end without errors" },
        { key: "codec", status: "pass", detail: "opus · webm" },
        { key: "duration", status: "pass", detail: "Within tolerance" },
        { key: "hash", status: "pass", detail: fakeSha256(`${VARIANTS.find((v) => v.key === "cuarto-azul:topic")!.url}:251`) },
        { key: "duplicate", status: "fail", detail: "Same hash as TRK-0007 · Cuarto Azul" },
      ],
      events: [
        { at: now - DAY, kind: "pending", message: "Job accepted" },
        { at: now - DAY + 8000, kind: "downloading", message: "Downloading" },
        { at: now - DAY + 12_000, kind: "validating", message: "Validating" },
        { at: now - DAY + 16_000, kind: "failed", message: "Duplicate detected by hash" },
      ],
    }),
    baseJob(1018, "low-orbit:upload", "auth_9", "yt-dlp", {
      status: "failed",
      createdAt: now - 9 * HOUR,
      startedAt: now - 9 * HOUR + 5000,
      finishedAt: now - 8 * HOUR,
      retries: 3,
      progress: 0.37,
      failure: { code: "NETWORK", message: "Connection reset by peer at 37% — retry limit reached (3/3). Partial file discarded.", tool: "yt-dlp", version: ENGINE_INFO["yt-dlp"].version, retryable: true, at: now - 8 * HOUR },
      events: [
        { at: now - 9 * HOUR, kind: "pending", message: "Job accepted" },
        { at: now - 9 * HOUR + 5000, kind: "downloading", message: "Downloading" },
        { at: now - 9 * HOUR + 20_000, kind: "error", message: "Connection reset at 41% · automatic retry 1/3" },
        { at: now - 9 * HOUR + 60_000, kind: "error", message: "Connection reset at 12% · automatic retry 2/3" },
        { at: now - 9 * HOUR + 120_000, kind: "error", message: "Connection reset at 58% · automatic retry 3/3" },
        { at: now - 8 * HOUR, kind: "failed", message: "Retry limit reached · no unlimited retries" },
      ],
    }),
  );

  // Doubtful match waiting for operator review (validating · awaiting review)
  const liveV = VARIANTS.find((v) => v.key === "paper-satellites:live")!;
  const reviewJob = baseJob(1019, "paper-satellites:live", "auth_7", "spotdl", {
    status: "validating",
    createdAt: now - 40 * MIN,
    startedAt: now - 38 * MIN,
    progress: 1,
    checks: [
      { key: "complete", status: "pass", detail: "Decoded end-to-end without errors" },
      { key: "codec", status: "pass", detail: "Opus · 48 kHz · stereo · 141 kbps (WebM)" },
      { key: "duration", status: "warn", detail: `${Math.floor(liveV.durationSec / 60)}:${String(liveV.durationSec % 60).padStart(2, "0")} vs requested 3:39 — matched a different version` },
      { key: "hash", status: "pass", detail: fakeSha256(`${liveV.url}:251`) },
      { key: "duplicate", status: "pass", detail: "No identical hash in library" },
    ],
    review: {
      reasons: ["Live version", `Duration +${liveV.durationSec - 219}s vs reference`],
      requested: { title: "Paper Satellites", artist: "The Hollow Arcade", durationSec: 219 },
    },
    metrics: { downloadMs: 3810, processMs: 1210, cpuPeakPct: 31, memPeakMB: 112, diskMB: 4.5 },
    events: [
      { at: now - 40 * MIN, kind: "pending", message: "Job accepted · spotDL reference spotify:track:paper-satellites" },
      { at: now - 38 * MIN, kind: "downloading", message: "Matched source on YouTube · downloading" },
      { at: now - 37 * MIN, kind: "validating", message: "Validating" },
      { at: now - 36 * MIN, kind: "note", message: "Doubtful match — waiting for operator review (not auto-accepted)" },
    ],
  });
  jobs.push(reviewJob);

  // Pending jobs: the worker picks these up right after load (one at a time).
  jobs.push(
    baseJob(1020, "lavanda:topic", "auth_10", "yt-dlp", { createdAt: now - 3 * MIN, events: [{ at: now - 3 * MIN, kind: "pending", message: "Job accepted · AUTH-0010 recorded before download" }], playlistId: "pl_indie" }),
    baseJob(1021, "espejismo:topic", "auth_10", "yt-dlp", { createdAt: now - 2 * MIN, events: [{ at: now - 2 * MIN, kind: "pending", message: "Job accepted · AUTH-0010 recorded before download" }] }),
    baseJob(1022, "cassette-rain:upload", "auth_6", "yt-dlp", { createdAt: now - 1 * MIN, events: [{ at: now - MIN, kind: "pending", message: "Job accepted · AUTH-0006 recorded before download" }] }),
  );

  const reviews: ReviewItem[] = [
    {
      id: "rev_1019",
      createdAt: now - 36 * MIN,
      requested: { title: "Paper Satellites", artist: "The Hollow Arcade", durationSec: 219 },
      candidate: {
        id: "spotdl:paper-satellites:live",
        engine: "spotdl",
        query: "Paper Satellites The Hollow Arcade",
        provider: "youtube",
        title: liveV.title,
        channel: liveV.channel,
        durationSec: liveV.durationSec,
        url: liveV.url,
        codec: "opus",
        bitrateKbps: 141,
        reference: { provider: "spotify", title: "Paper Satellites", artist: "The Hollow Arcade", album: "Afterhours", durationSec: 219 },
        flags: ["live", "duration-mismatch"],
        confidence: 0.32,
        coverSeed: "paper-satellites",
        scenario: "ok",
      },
      jobId: "job_1019",
      status: "needs-review",
      reasons: ["Live version", `Duration +${liveV.durationSec - 219}s vs reference`],
    },
    {
      id: "rev_old_1",
      createdAt: now - 4 * DAY,
      requested: { title: "Gravity Talks", artist: "Kairo Vance", durationSec: 186 },
      candidate: { id: "freyrjs:gravity-talks:topic", engine: "freyrjs", query: "Gravity Talks Kairo Vance", provider: "youtube-music", title: "Gravity Talks", channel: "Kairo Vance - Topic", durationSec: 186, url: VARIANTS.find((v) => v.key === "gravity-talks:topic")!.url, codec: "aac", bitrateKbps: 320, reference: { provider: "spotify", title: "Gravity Talks", artist: "Kairo Vance", album: "Concrete Bloom", durationSec: 186 }, flags: ["reencoded"], confidence: 0.94, coverSeed: "gravity-talks", scenario: "ok" },
      status: "accepted",
      decidedAt: now - 4 * DAY + 2 * HOUR,
      decidedBy: operator,
      reasons: ["Re-encoded by engine (AAC 320) — recorded as real codec, not as quality gain"],
    },
    {
      id: "rev_old_2",
      createdAt: now - 6 * DAY,
      requested: { title: "Neon Cathedral", artist: "The Hollow Arcade", durationSec: 251 },
      candidate: { id: "yt-dlp:neon-cathedral:cover", engine: "yt-dlp", query: "Neon Cathedral", provider: "youtube", title: "Neon Cathedral - acoustic cover", channel: "Sofia Reyes Covers", durationSec: 237, url: "https://www.youtube.com/watch?v=coverNeon01", codec: "opus", bitrateKbps: 141, flags: ["cover", "duration-mismatch"], confidence: 0.2, coverSeed: "neon-cathedral", scenario: "ok" },
      status: "rejected",
      decidedAt: now - 6 * DAY + HOUR,
      decidedBy: operator,
      reasons: ["Cover by a different performer", "Duration −14s"],
    },
  ];

  const playlists: Playlist[] = [
    { id: "pl_late", name: "Late Night Rotation", description: "Slow-burn picks for the evening listening block.", color: "iris", trackIds: [t.glass, t.neon, t.ferry, t.cuarto, t.harbour], createdAt: now - 20 * DAY, updatedAt: now - 2 * DAY },
    { id: "pl_indie", name: "Independent Picks", description: "Self-released and small-label artists with recorded permission.", color: "teal", trackIds: [t.cuarto, t.tarde, t.field, t.wren, t.pulse], createdAt: now - 15 * DAY, updatedAt: now - DAY },
    { id: "pl_studio", name: "Studio Sessions", description: "Client-owned recordings (own content).", color: "amber", trackIds: [t.s1, t.s2], createdAt: now - 8 * DAY, updatedAt: now - 6 * DAY },
  ];

  const samples: BenchSample[] = [
    { id: "smp_1", query: "Luz de Agosto Marea Alta", expected: { title: "Luz de Agosto", artist: "Marea Alta", durationSec: 214 }, tier: "established" },
    { id: "smp_2", query: "Glasshouse Nova Lindqvist", expected: { title: "Glasshouse", artist: "Nova Lindqvist", durationSec: 203 }, tier: "established" },
    { id: "smp_3", query: "Paper Satellites The Hollow Arcade", expected: { title: "Paper Satellites", artist: "The Hollow Arcade", durationSec: 219 }, tier: "established" },
    { id: "smp_4", query: "Westbound Kairo Vance", expected: { title: "Westbound", artist: "Kairo Vance", durationSec: 172 }, tier: "established" },
    { id: "smp_5", query: "Cuarto Azul Paloma Cruz", expected: { title: "Cuarto Azul", artist: "Paloma Cruz", durationSec: 178 }, tier: "independent" },
    { id: "smp_6", query: "Fieldnotes Static Orchard", expected: { title: "Fieldnotes", artist: "Static Orchard", durationSec: 143 }, tier: "independent" },
    { id: "smp_7", query: "Harbour Lights Juno Barrett", expected: { title: "Harbour Lights", artist: "Juno Barrett", durationSec: 224 }, tier: "independent" },
    { id: "smp_8", query: "Espejismo Velvet Tides", expected: { title: "Espejismo", artist: "Velvet Tides", durationSec: 262 }, tier: "independent" },
  ];

  const engines: EngineId[] = ["yt-dlp", "spotdl", "freyrjs"];
  const versions = { "yt-dlp": ENGINE_INFO["yt-dlp"].version, spotdl: ENGINE_INFO.spotdl.version, freyrjs: ENGINE_INFO.freyrjs.version };
  const benchRuns = [
    {
      id: "bench_1",
      code: "BENCH-001",
      startedAt: now - 5 * DAY,
      finishedAt: now - 5 * DAY + 6 * MIN,
      status: "completed" as const,
      engines,
      sampleIds: samples.map((s) => s.id),
      results: samples.flatMap((s) => engines.map((e) => simulateBench(s, e, "bench_1", 2))),
      versions,
    },
    {
      id: "bench_2",
      code: "BENCH-002",
      startedAt: now - 1 * DAY,
      finishedAt: now - DAY + 7 * MIN,
      status: "completed" as const,
      engines,
      sampleIds: samples.map((s) => s.id),
      results: samples.flatMap((s) => engines.map((e) => simulateBench(s, e, "bench_2", 2))),
      versions,
    },
  ];

  const audit: AuditEvent[] = [];
  const ev = (at: number, action: string, message: string, severity: AuditEvent["severity"] = "info", target?: string) =>
    audit.push({ id: `aud_${audit.length + 1}`, at, actor: operator, ip, action, message, severity, target });
  for (const a of authorizations) ev(a.createdAt, "rights.authorization.created", `Recorded ${a.code} · ${a.holder}`, "info", a.code);
  for (const j of jobs) {
    ev(j.createdAt, "ingest.job.created", `Queued ${j.code} · ${j.source.title}`, "info", j.code);
    if (j.status === "ready") ev(j.finishedAt!, "ingest.job.ready", `${j.code} ready · original stored`, "info", j.code);
    if (j.status === "failed") ev(j.finishedAt!, "ingest.job.failed", `${j.code} failed · ${j.failure!.code} — ${j.failure!.message}`, "error", j.code);
  }
  ev(now - 18 * DAY, "rights.authorization.expired", "AUTH-0005 expired · 2 files flagged as not usable", "warning", "AUTH-0005");
  ev(now - 6 * DAY + HOUR, "review.match.rejected", "Rejected cover match for “Neon Cathedral”", "info", "rev_old_2");
  ev(now - 5 * DAY + 6 * MIN, "benchmark.run.completed", "BENCH-001 completed · 8 samples × 3 engines", "info", "BENCH-001");
  ev(now - DAY + 7 * MIN, "benchmark.run.completed", "BENCH-002 completed · 8 samples × 3 engines", "info", "BENCH-002");
  ev(now - 2 * HOUR, "auth.session.started", "Operator signed in to the back office", "info");
  audit.sort((a, b) => b.at - a.at);

  return {
    version: STATE_VERSION,
    seededAt: now,
    artists,
    tracks,
    files,
    authorizations,
    jobs,
    playlists,
    references: [
      { id: "ref_1", provider: "spotify", title: "Midnight Ferry", artistName: "Nova Lindqvist", durationSec: 228, url: "https://open.spotify.com/track/midnightferryRef01", savedAt: now - 9 * DAY, note: "Reference only — playback through the official SDK in Test B.", origin: "url" },
      { id: "ref_2", provider: "youtube", title: "Neon Cathedral (Live at the Roundhouse)", channel: "TheHollowArcadeVEVO", artistName: "The Hollow Arcade", durationSec: 286, url: VARIANTS.find((v) => v.key === "neon-cathedral:live")!.url, savedAt: now - 6 * DAY, note: "Live version kept as a reference, not ingested.", origin: "search" },
      { id: "ref_3", provider: "apple-music", title: "Aurora Suite: II. Ember", artistName: "Lumen Ensemble", durationSec: 367, url: "https://music.apple.com/album/aurora-suite/ember01", savedAt: now - 2 * DAY, note: "Pending license (AUTH-0008 under review).", origin: "url" },
    ],
    reviews,
    samples,
    benchRuns,
    audit,
    duplicates: [
      { id: "dup_1", at: now - DAY + 16_000, jobId: "job_1017", existingTrackId: t.cuarto, sha256: fakeSha256(`${VARIANTS.find((v) => v.key === "cuarto-azul:topic")!.url}:251`), sourceUrl: VARIANTS.find((v) => v.key === "cuarto-azul:topic")!.url, title: "Cuarto Azul", dismissed: false },
    ],
    connections: [
      { provider: "spotify", enabled: true, status: "blocked", note: "Developer Dashboard access with a Premium owner not verified yet (TBD-04)." },
      { provider: "apple-music", enabled: false, status: "not-connected", note: "Optional Test C — activates only if the client decides to evaluate Apple Music (TBD-05)." },
    ],
    settings: DEFAULT_SETTINGS,
    queuePaused: false,
    counters: { job: 1022, track: trackN, auth: 10, bench: 2, playlist: 3 },
  };
}
