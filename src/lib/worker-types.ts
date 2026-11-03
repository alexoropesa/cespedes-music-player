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
  /** Catalog reference (spotDL / FreyrJS): what was requested, before matching audio elsewhere. */
  reference?: { provider: "spotify" | "apple-music" | "deezer"; title: string; artist: string; album?: string; durationSec: number };
  /** True when duration and formats are only known after the download (FreyrJS without a Spotify reference). */
  metadataAfterDownload?: boolean;
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
  formatId?: string;
  maxSizeMB: number;
}
