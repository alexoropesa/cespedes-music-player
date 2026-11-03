/**
 * Contract between the browser app and the local ingestion worker
 * (src/server/worker.ts, exposed under /api/worker). No Node imports here.
 */
import type { EngineId, SourceMetadata } from "./types";

export type InspectErrorCode = "INVALID_URL" | "WRONG_ENGINE" | "PLAYLIST" | "ACCESS_REQUIRED" | "UNSUPPORTED" | "NETWORK" | "ENGINE_MISSING" | "ENGINE_ERROR";

export interface InspectMeta extends SourceMetadata {
  /** Remote thumbnail / cover URL reported by the engine (shown in the preview only). */
  thumbnailUrl?: string;
  license?: string;
  /** Catalog reference (spotDL / FreyrJS / Match): what was requested, before matching audio elsewhere. */
  reference?: { provider: "spotify" | "apple-music" | "deezer"; title: string; artist: string; album?: string; durationSec: number; isrc?: string };
  /** True when duration and formats are only known after the download (FreyrJS without a Spotify reference). */
  metadataAfterDownload?: boolean;
  /**
   * Match engine: the YouTube upload chosen automatically — best match to the
   * reference, then the highest audio bitrate among near-equal matches. Its
   * best audio stream is `formats[0]`, listed under the video id.
   */
  matched?: MatchCandidate;
}

export type MatchFlag = "live" | "cover" | "remix" | "other-artist" | "altered" | "karaoke" | "instrumental" | "acapella" | "extended" | "lyric-video" | "low-quality" | "duration-mismatch";

export interface MatchCandidate {
  /** YouTube video id (11 chars). */
  id: string;
  url: string;
  title: string;
  channel: string;
  durationSec: number;
  /** Seconds away from the reference duration. */
  deltaSec: number;
  /** 0–100: duration, title and artist agreement minus version penalties. */
  score: number;
  /** Uploaded by the artist's own channel or its auto-generated "- Topic" channel. */
  official: boolean;
  flags: MatchFlag[];
  /** Measured on a ~60 s sample of the stream (Match picks by this before the score). */
  quality?: {
    /** Highest band (kHz) still carrying content: ~16 for an MP3 rip, ≥ 19.5 for a master. */
    cutoffKHz: number;
    /** Treble level relative to the whole signal, dB: higher is better. */
    hfDb: number;
    /** Full bandwidth (not low-passed). */
    full: boolean;
  };
}

export type InspectResponse =
  | { ok: true; engine: EngineId; toolVersion: string; meta: InspectMeta; warnings: string[] }
  | { ok: false; engine: EngineId; code: InspectErrorCode; message: string; suggest?: EngineId[] };

export interface ToolStatus {
  id: string;
  name: string;
  version: string | null;
}

export interface HealthResponse {
  engines: Record<EngineId, ToolStatus>;
  ffmpeg: ToolStatus;
  ffprobe: ToolStatus;
  atomicparsley: ToolStatus;
  stagingDir: string;
}

export interface ProbeResult {
  codec: string;
  container: string;
  bitrateKbps: number;
  sampleRateHz: number | null;
  channels: number | null;
  durationSec: number;
}

export type WorkerFailureCode = "ACCESS_REQUIRED" | "NETWORK" | "SIZE_LIMIT" | "DECODE_ERROR" | "ENGINE_ERROR" | "CANCELLED" | "UNSUPPORTED";

export interface WorkerJobState {
  key: string;
  engine: EngineId;
  toolVersion: string;
  url: string;
  status: "downloading" | "validating" | "done" | "failed";
  /** 0–1 when the engine reports sizes; null while unknown (spotDL / FreyrJS). */
  progress: number | null;
  downloadedBytes: number;
  startedAt: number;
  downloadMs?: number;
  processMs?: number;
  file?: { name: string; ext: string; sizeBytes: number; probe: ProbeResult; decode: { ok: boolean; errors: string }; sha256: string };
  hasCover?: boolean;
  failure?: { code: WorkerFailureCode; message: string; retryable: boolean };
  log: string[];
}

export interface CreateWorkerJob {
  key: string;
  engine: EngineId;
  url: string;
  /** yt-dlp: format id. Match: the chosen candidate's YouTube video id. */
  formatId?: string;
  maxSizeMB: number;
}
