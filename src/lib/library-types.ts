/** Contract for the on-disk library (src/server/library.ts, /api/library). No Node imports. */
import type { ProbeResult } from "./worker-types";

/** A folder the operator added by path; its audio is imported in place, never copied or deleted. */
export interface LibraryFolder {
  id: string;
  path: string;
  /** Authorization record that covers every file in this folder (RF-ING-02). */
  authorizationId: string;
  addedAt: number;
  lastScanAt?: number;
  lastScanCount?: number;
}

export interface FolderScanEntry {
  path: string;
  name: string;
  sizeBytes: number;
  mtimeMs: number;
  title?: string;
  artist?: string;
  album?: string;
  durationSec?: number;
}

export interface LocalProbe {
  sizeBytes: number;
  probe: ProbeResult | null;
  decode: { ok: boolean; errors: string };
  sha256: string;
  hasCover: boolean;
  processMs: number;
}

export interface LibraryInfo {
  libraryRoot: string;
  originalsDir: string;
  folders: LibraryFolder[];
}

/** URL the player and the app use to read a file of the on-disk library. */
export const libraryFileUrl = (absPath: string) => `/api/library/file?p=${encodeURIComponent(absPath)}`;
export const libraryCoverUrl = (absPath: string) => `/api/library/cover?p=${encodeURIComponent(absPath)}`;
