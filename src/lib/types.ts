/**
 * Domain model — mirrors SRS v0.1, Appendix A (conceptual data model).
 * Track · AudioFile · Provenance · Authorization · IngestJob · Playlist ·
 * ExternalReference, plus the pilot-specific benchmark and audit entities.
 */

export type JobStatus = "pending" | "downloading" | "validating" | "ready" | "failed";
export const JOB_STATUSES: JobStatus[] = ["pending", "downloading", "validating", "ready", "failed"];

export type EngineId = "yt-dlp" | "spotdl" | "freyrjs";
export const ENGINES: EngineId[] = ["yt-dlp", "spotdl", "freyrjs"];
export type IngestTool = EngineId | "local-import";

export type ArtistTier = "established" | "independent";

export type AuthBasis = "own-content" | "rights-holder" | "purchase" | "license";
export type AuthScope = "copy" | "retain" | "derivatives";
export type AuthReview = "approved" | "under-review" | "revoked";
/** Computed from review state + validity window. */
export type AuthStatus = "active" | "expiring" | "expired" | "under-review" | "revoked";

export interface Artist {
  id: string;
  name: string;
  tier: ArtistTier;
  country?: string;
  notes?: string;
  createdAt: number;
}

export interface Authorization {
  id: string;
  code: string;
  basis: AuthBasis;
  holder: string;
  scope: AuthScope[];
  territory: string;
  validFrom: number;
  validUntil: number | null;
  evidence: string;
  notes?: string;
  review: AuthReview;
  createdAt: number;
  createdBy: string;
}

export interface AudioFile {
  id: string;
  trackId: string;
  kind: "original" | "derivative";
  derivedFrom?: string;
  derivativeReason?: string;
  codec: string;
  container: string;
  bitrateKbps: number;
  sampleRateHz: number | null;
  channels: number | null;
  sizeBytes: number;
  durationSec: number;
  sha256: string;
  path: string;
  createdAt: number;
  /** "blob" = real bytes in IndexedDB (imported from disk) · "disk" = file on this PC, read through the local server · "synthetic" = legacy demo */
  audio: "synthetic" | "blob" | "disk";
  /** disk files: "managed" = library/originals (downloads) · "external" = in a scan folder, referenced in place and never deleted */
  location?: "managed" | "external";
  blobKey?: string;
  declaredExt?: string;
}

export interface Provenance {
  sourceUrl: string;
  sourcePlatform: string;
  sourceId?: string;
  channel?: string;
  requested?: { title: string; artist?: string; durationSec?: number };
  tool: IngestTool;
  toolVersion: string;
  retrievedAt: number;
  operator: string;
  ip: string;
  jobId?: string;
}

export interface Track {
  id: string;
  code: string;
  title: string;
  artistId: string;
  album?: string;
  durationSec: number;
  addedAt: number;
  originalFileId: string;
  derivativeIds: string[];
  authorizationId: string;
  provenance: Provenance;
  plays: number;
  coverSeed: string;
}

export type CheckKey = "complete" | "codec" | "duration" | "hash" | "duplicate";
export interface ValidationCheck {
  key: CheckKey;
  status: "pending" | "running" | "pass" | "warn" | "fail";
  detail?: string;
}

export interface JobEvent {
  at: number;
  kind: JobStatus | "note" | "error";
  message: string;
}

export interface SourceFormat {
  id: string;
  ext: string;
  codec: string;
  container: string;
  abrKbps: number;
  asrHz: number;
  sizeBytes: number;
}

export interface SourceMetadata {
  url: string;
  platform: string;
  sourceId: string;
  title: string;
  channel: string;
  durationSec: number;
  bitrateKbps: number;
  album?: string;
  artistGuess?: string;
  formats: SourceFormat[];
  coverSeed: string;
}

export type FailureCode =
  | "ACCESS_REQUIRED"
  | "NETWORK"
  | "SIZE_LIMIT"
  | "DURATION_LIMIT"
  | "INCOMPLETE"
  | "DURATION_MISMATCH"
  | "DUPLICATE"
  | "DECODE_ERROR"
  | "MATCH_REJECTED"
  | "CANCELLED"
  | "INTERRUPTED"
  | "UNSUPPORTED"
  | "ENGINE_ERROR";

export interface JobFailure {
  code: FailureCode;
  message: string;
  tool: string;
  version: string;
  retryable: boolean;
  at: number;
}

/** Deterministic simulation outcome for a source (simulation adapter only). */
export type Scenario =
  | "ok"
  | "access-required"
  | "network-flaky"
  | "oversize"
  | "truncated"
  | "ext-mismatch"
  | "duration-off"
  | "duplicate";

export interface IngestJob {
  id: string;
  code: string;
  /** simulated = legacy demo adapter · local-file = imported from disk · worker = downloaded by the local worker */
  mode: "simulated" | "local-file" | "worker" | "folder";
  tool: IngestTool;
  toolVersion: string;
  status: JobStatus;
  paused: boolean;
  progress: number;
  phaseStartedAt?: number;
  retries: number;
  maxRetries: number;
  limits: { maxSizeMB: number; maxDurationMin: number; toleranceSec: number };
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  source: SourceMetadata;
  formatId: string;
  identity: { title: string; artistId: string; album?: string };
  authorizationId: string;
  playlistId?: string;
  scenario: Scenario;
  failure?: JobFailure;
  autoRetryAt?: number;
  checks: ValidationCheck[];
  metrics: { downloadMs?: number; processMs?: number; cpuPeakPct?: number; memPeakMB?: number; diskMB?: number };
  events: JobEvent[];
  review?: {
    reasons: string[];
    requested: { title: string; artist: string; durationSec: number };
    decision?: "accepted" | "rejected";
    decidedAt?: number;
  };
  trackId?: string;
  /** local-file mode */
  blobKey?: string;
  /** folder mode: absolute path of the file in a registered folder */
  localPath?: string;
  fileName?: string;
  /** simulation: forced hash (duplicate scenario) */
  simHash?: string;
}

export interface Playlist {
  id: string;
  name: string;
  description: string;
  color: string;
  trackIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type Provider = "youtube" | "youtube-music" | "spotify" | "apple-music" | "deezer" | "soundcloud" | "bandcamp" | "web";

export interface ExternalReference {
  id: string;
  provider: Provider;
  title: string;
  channel?: string;
  artistName?: string;
  durationSec?: number;
  url: string;
  savedAt: number;
  note?: string;
  origin: "url" | "search";
}

export type MatchFlag =
  | "duration-mismatch"
  | "live"
  | "cover"
  | "remix"
  | "lyric-video"
  | "music-video"
  | "reencoded"
  | "no-reference";

export interface SearchResult {
  id: string;
  engine: EngineId;
  query: string;
  provider: Provider;
  title: string;
  channel: string;
  durationSec: number;
  url: string;
  codec: string;
  bitrateKbps: number;
  reference?: { provider: Provider; title: string; artist: string; album?: string; durationSec: number };
  flags: MatchFlag[];
  confidence: number;
  coverSeed: string;
  scenario: Scenario;
}

export interface ReviewItem {
  id: string;
  createdAt: number;
  requested: { title: string; artist: string; durationSec: number };
  candidate: SearchResult;
  jobId?: string;
  status: "needs-review" | "accepted" | "rejected";
  decidedAt?: number;
  decidedBy?: string;
  reasons: string[];
}

export interface BenchSample {
  id: string;
  query: string;
  expected: { title: string; artist: string; durationSec: number };
  tier: ArtistTier;
  url?: string;
  authorizationId?: string;
}

export type MatchOutcome = "exact" | "doubtful" | "wrong" | "none";

export interface BenchResult {
  sampleId: string;
  engine: EngineId;
  responseMs: number;
  downloadMs?: number;
  metadataAccuracy: number;
  success: boolean;
  match: MatchOutcome;
  codec?: string;
  bitrateKbps?: number;
  reencoded?: boolean;
  matchedTitle?: string;
  matchedChannel?: string;
  matchedDurationSec?: number;
  note?: string;
}

export interface BenchRun {
  id: string;
  code: string;
  startedAt: number;
  finishedAt?: number;
  status: "running" | "completed" | "cancelled";
  engines: EngineId[];
  sampleIds: string[];
  results: BenchResult[];
  versions: Record<EngineId, string>;
}

export type Severity = "info" | "warning" | "error";

export interface AuditEvent {
  id: string;
  at: number;
  actor: string;
  ip: string;
  action: string;
  message: string;
  target?: string;
  severity: Severity;
  meta?: Record<string, string | number | boolean | null>;
}

export interface DuplicateEvent {
  id: string;
  at: number;
  jobId: string;
  existingTrackId: string;
  sha256: string;
  sourceUrl: string;
  title: string;
  dismissed: boolean;
}

export interface ProviderConnection {
  provider: "spotify" | "apple-music";
  enabled: boolean;
  status: "not-connected" | "blocked";
  note: string;
}

export interface Settings {
  maxSizeMB: number;
  maxDurationMin: number;
  maxRetries: number;
  autoRetryTransient: boolean;
  stagingDir: string;
  libraryDir: string;
  defaultEngine: EngineId;
  engines: Record<EngineId, { version: string; enabled: boolean }>;
  durationToleranceSec: number;
  conversionPolicy: "never" | "if-unplayable";
  normalizeDerivative: boolean;
  operator: { name: string; email: string };
}

export interface State {
  version: number;
  seededAt: number;
  artists: Artist[];
  tracks: Track[];
  files: AudioFile[];
  authorizations: Authorization[];
  jobs: IngestJob[];
  playlists: Playlist[];
  references: ExternalReference[];
  reviews: ReviewItem[];
  samples: BenchSample[];
  benchRuns: BenchRun[];
  audit: AuditEvent[];
  duplicates: DuplicateEvent[];
  connections: ProviderConnection[];
  settings: Settings;
  queuePaused: boolean;
  counters: Record<string, number>;
}
