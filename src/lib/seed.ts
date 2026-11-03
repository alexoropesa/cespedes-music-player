/**
 * Workspace defaults. A new workspace starts empty (created on first load and
 * on "Reset workspace"); the library is filled only by real imports.
 */
import { ENGINE_INFO } from "./catalog";
import type { Settings, State, ValidationCheck } from "./types";

export const STATE_VERSION = 4;
export const DEFAULT_SETTINGS: Settings = {
  maxSizeMB: 100,
  maxDurationMin: 15,
  maxRetries: 3,
  autoRetryTransient: true,
  stagingDir: "indexeddb://staging",
  libraryDir: "indexeddb://library",
  defaultEngine: "yt-dlp",
  engines: {
    "yt-dlp": { version: ENGINE_INFO["yt-dlp"].version, enabled: true },
    spotdl: { version: ENGINE_INFO.spotdl.version, enabled: true },
    freyrjs: { version: ENGINE_INFO.freyrjs.version, enabled: true },
    match: { version: ENGINE_INFO.match.version, enabled: true },
  },
  durationToleranceSec: 2,
  conversionPolicy: "if-unplayable",
  normalizeDerivative: false,
  operator: { name: "Operator", email: "operator@bitferalda.local" },
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
  codec: "Real codec (header)",
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

/**
 * Fresh, empty workspace — no demo artists, tracks, jobs or authorizations.
 * Everything in the library comes from files the operator imports.
 */
export function createWorkspace(now: number): State {
  return {
    ...EMPTY_STATE,
    seededAt: now,
    connections: [
      { provider: "spotify", enabled: true, status: "blocked", note: "Developer Dashboard access with a Premium owner not verified yet (TBD-04)." },
      { provider: "apple-music", enabled: false, status: "not-connected", note: "Optional Test C — activates only if the client decides to evaluate Apple Music (TBD-05)." },
    ],
    settings: DEFAULT_SETTINGS,
  };
}
