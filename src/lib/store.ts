"use client";

/**
 * Client store (useSyncExternalStore) + persisted state + domain actions.
 * Every mutating action writes an audit event (actor + IP) — RNF Auditability.
 * Persistence: localStorage (state) + IndexedDB (audio bytes). On reload, jobs
 * left in downloading/validating are recovered to pending (RNF-FIA-01).
 */
import { useSyncExternalStore } from "react";
import { EMPTY_STATE, STATE_VERSION, CHECK_ORDER, seedState } from "./seed";
import type {
  Artist,
  AuditEvent,
  AuthStatus,
  Authorization,
  BenchSample,
  EngineId,
  ExternalReference,
  IngestJob,
  Playlist,
  ReviewItem,
  Settings,
  State,
  Track,
} from "./types";
import { uid } from "./util";
import { idbClear, idbDel } from "./idb";

const KEY = "bitferalda.backoffice.state";

let state: State = EMPTY_STATE;
let hydrated = false;
const listeners = new Set<() => void>();

export const session = { ip: "127.0.0.1" };

export function getState() {
  return state;
}

function emit() {
  for (const l of listeners) l();
}

export function setState(fn: (s: State) => State) {
  const next = fn(state);
  if (next === state) return;
  state = next;
  emit();
  schedulePersist();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useStore<T>(selector: (s: State) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(EMPTY_STATE),
  );
}

export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => hydrated,
    () => false,
  );
}

let persistTimer: ReturnType<typeof setTimeout> | undefined;
function schedulePersist() {
  if (!hydrated) return;
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked — state stays in memory */
    }
  }, 350);
}

export function initStore() {
  if (hydrated) return;
  const now = Date.now();
  let loaded: State | null = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as State;
      if (parsed.version === STATE_VERSION) loaded = parsed;
    }
  } catch {
    loaded = null;
  }
  state = loaded ? recoverAfterRestart(loaded, now) : seedState(now, session.ip);
  hydrated = true;
  emit();
  schedulePersist();
}

function recoverAfterRestart(s: State, now: number): State {
  let recovered = 0;
  const jobs = s.jobs.map((j) => {
    const awaitingReview = j.status === "validating" && j.review && !j.review.decision && j.checks.every((c) => c.status !== "pending" && c.status !== "running");
    if ((j.status === "downloading" || j.status === "validating") && !awaitingReview) {
      recovered++;
      return {
        ...j,
        status: "pending" as const,
        progress: 0,
        phaseStartedAt: undefined,
        checks: CHECK_ORDER.map((key) => ({ key, status: "pending" as const })),
        events: [
          ...j.events,
          { at: now, kind: "note" as const, message: "Recovered after restart — partial file in staging discarded; job re-queued (no job left hanging)." },
        ],
      };
    }
    return j;
  });
  if (!recovered) return s;
  return pushAudit({ ...s, jobs }, "system.recovery", `Recovered ${recovered} interrupted job(s) after restart`, "warning");
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function pushAudit(
  s: State,
  action: string,
  message: string,
  severity: AuditEvent["severity"] = "info",
  target?: string,
  meta?: AuditEvent["meta"],
): State {
  const ev: AuditEvent = {
    id: uid("aud"),
    at: Date.now(),
    actor: s.settings.operator.email,
    ip: session.ip,
    action,
    message,
    severity,
    target,
    meta,
  };
  return { ...s, audit: [ev, ...s.audit].slice(0, 2000) };
}

export function nextCounter(s: State, key: string): [number, State] {
  const n = (s.counters[key] ?? 0) + 1;
  return [n, { ...s, counters: { ...s.counters, [key]: n } }];
}

export function updateJob(s: State, id: string, fn: (j: IngestJob) => IngestJob): State {
  return { ...s, jobs: s.jobs.map((j) => (j.id === id ? fn(j) : j)) };
}

const DAY = 86_400_000;

export function authStatus(a: Authorization | undefined, now: number): AuthStatus {
  if (!a) return "under-review";
  if (a.review === "revoked") return "revoked";
  if (a.review === "under-review") return "under-review";
  if (a.validUntil != null && a.validUntil < now) return "expired";
  if (a.validUntil != null && a.validUntil - now < 30 * DAY) return "expiring";
  return "active";
}

export const isUsableStatus = (st: AuthStatus) => st === "active" || st === "expiring";

export function trackUsable(t: Track, auths: Authorization[], now: number) {
  return isUsableStatus(authStatus(auths.find((a) => a.id === t.authorizationId), now));
}

export function isAwaitingReview(j: IngestJob) {
  return j.status === "validating" && !!j.review && !j.review.decision && j.checks.every((c) => c.status !== "pending" && c.status !== "running");
}

export function canRetry(j: IngestJob) {
  return j.status === "failed" && !!j.failure?.retryable && j.retries < j.maxRetries;
}

/* ------------------------------------------------------------------ */
/* actions                                                             */
/* ------------------------------------------------------------------ */

export interface NewJobInput {
  mode: IngestJob["mode"];
  tool: IngestJob["tool"];
  toolVersion: string;
  source: IngestJob["source"];
  formatId: string;
  identity: IngestJob["identity"];
  authorizationId: string;
  playlistId?: string;
  scenario: IngestJob["scenario"];
  review?: IngestJob["review"];
  blobKey?: string;
  fileName?: string;
}

export const actions = {
  /* ---------------- jobs / queue ---------------- */
  createJob(input: NewJobInput): IngestJob {
    let created!: IngestJob;
    setState((s0) => {
      const [n, s] = nextCounter(s0, "job");
      const now = Date.now();
      const auth = s.authorizations.find((a) => a.id === input.authorizationId);
      created = {
        id: `job_${n}`,
        code: `ING-${n}`,
        mode: input.mode,
        tool: input.tool,
        toolVersion: input.toolVersion,
        status: "pending",
        paused: false,
        progress: 0,
        retries: 0,
        maxRetries: s.settings.maxRetries,
        limits: { maxSizeMB: s.settings.maxSizeMB, maxDurationMin: s.settings.maxDurationMin, toleranceSec: s.settings.durationToleranceSec },
        createdAt: now,
        source: input.source,
        formatId: input.formatId,
        identity: input.identity,
        authorizationId: input.authorizationId,
        playlistId: input.playlistId,
        scenario: input.scenario,
        checks: CHECK_ORDER.map((key) => ({ key, status: "pending" })),
        metrics: {},
        events: [{ at: now, kind: "pending", message: `Job accepted · ${auth?.code ?? "authorization"} recorded before download` }],
        review: input.review,
        blobKey: input.blobKey,
        fileName: input.fileName,
      };
      return pushAudit({ ...s, jobs: [...s.jobs, created] }, "ingest.job.created", `Queued ${created.code} · ${input.source.title} (${input.tool})`, "info", created.code, {
        url: input.source.url,
        authorization: auth?.code ?? null,
      });
    });
    return created;
  },

  pauseJob(id: string) {
    setState((s) => {
      const j = s.jobs.find((x) => x.id === id);
      if (!j || (j.status !== "pending" && j.status !== "downloading")) return s;
      const pct = Math.round(j.progress * 100);
      const s2 = updateJob(s, id, (x) => ({
        ...x,
        status: "pending",
        paused: true,
        phaseStartedAt: undefined,
        events: [...x.events, { at: Date.now(), kind: "note", message: x.status === "downloading" ? `Paused at ${pct}% — partial download kept in staging` : "Paused by operator" }],
      }));
      return pushAudit(s2, "ingest.job.paused", `Paused ${j.code}`, "info", j.code);
    });
  },

  resumeJob(id: string) {
    setState((s) => {
      const j = s.jobs.find((x) => x.id === id);
      if (!j || !j.paused) return s;
      const s2 = updateJob(s, id, (x) => ({ ...x, paused: false, events: [...x.events, { at: Date.now(), kind: "note", message: "Resumed — waiting for the worker" }] }));
      return pushAudit(s2, "ingest.job.resumed", `Resumed ${j.code}`, "info", j.code);
    });
  },

  cancelJob(id: string) {
    setState((s) => {
      const j = s.jobs.find((x) => x.id === id);
      if (!j || j.status === "ready" || j.status === "failed") return s;
      const now = Date.now();
      let s2 = updateJob(s, id, (x) => ({
        ...x,
        status: "failed",
        paused: false,
        finishedAt: now,
        failure: { code: "CANCELLED", message: "Cancelled by operator — staging folder cleaned.", tool: x.tool, version: x.toolVersion, retryable: true, at: now },
        events: [...x.events, { at: now, kind: "failed", message: "Cancelled by operator" }],
      }));
      s2 = { ...s2, reviews: s2.reviews.map((r) => (r.jobId === id && r.status === "needs-review" ? { ...r, status: "rejected", decidedAt: now, decidedBy: s.settings.operator.email } : r)) };
      return pushAudit(s2, "ingest.job.cancelled", `Cancelled ${j.code}`, "warning", j.code);
    });
  },

  retryJob(id: string, auto = false) {
    setState((s) => {
      const j = s.jobs.find((x) => x.id === id);
      if (!j || !canRetry(j)) return s;
      const now = Date.now();
      const s2 = updateJob(s, id, (x) => ({
        ...x,
        status: "pending",
        paused: false,
        retries: x.retries + 1,
        progress: 0,
        phaseStartedAt: undefined,
        failure: undefined,
        autoRetryAt: undefined,
        finishedAt: undefined,
        checks: CHECK_ORDER.map((key) => ({ key, status: "pending" })),
        events: [...x.events, { at: now, kind: "pending", message: `${auto ? "Automatic retry" : "Manual retry"} ${x.retries + 1}/${x.maxRetries}` }],
      }));
      return pushAudit(s2, auto ? "ingest.job.auto_retry" : "ingest.job.retry", `${auto ? "Auto-retry" : "Retry"} ${j.retries + 1}/${j.maxRetries} · ${j.code}`, "info", j.code);
    });
  },

  setQueuePaused(paused: boolean) {
    setState((s) => pushAudit({ ...s, queuePaused: paused }, paused ? "ingest.queue.paused" : "ingest.queue.resumed", paused ? "Queue paused — no new jobs will start" : "Queue resumed", "info"));
  },

  /* ---------------- review ---------------- */
  createReview(item: Omit<ReviewItem, "id" | "createdAt" | "status">) {
    setState((s) => {
      const r: ReviewItem = { ...item, id: uid("rev"), createdAt: Date.now(), status: "needs-review" };
      return pushAudit({ ...s, reviews: [r, ...s.reviews] }, "review.match.flagged", `Match sent to review · “${item.requested.title}”`, "warning", r.id);
    });
  },

  decideReview(id: string, decision: "accepted" | "rejected") {
    setState((s) => {
      const r = s.reviews.find((x) => x.id === id);
      if (!r || r.status !== "needs-review") return s;
      const now = Date.now();
      let s2: State = { ...s, reviews: s.reviews.map((x) => (x.id === id ? { ...x, status: decision, decidedAt: now, decidedBy: s.settings.operator.email } : x)) };
      if (r.jobId) {
        s2 = updateJob(s2, r.jobId, (j) => {
          if (!j.review) return j;
          if (decision === "accepted") {
            return { ...j, review: { ...j.review, decision, decidedAt: now }, events: [...j.events, { at: now, kind: "note", message: "Match accepted by operator" }] };
          }
          return {
            ...j,
            status: "failed",
            finishedAt: now,
            review: { ...j.review, decision, decidedAt: now },
            failure: { code: "MATCH_REJECTED", message: "Match rejected by operator — downloaded file discarded from staging; no substitute downloaded.", tool: j.tool, version: j.toolVersion, retryable: false, at: now },
            events: [...j.events, { at: now, kind: "failed", message: "Match rejected by operator" }],
          };
        });
      }
      return pushAudit(s2, decision === "accepted" ? "review.match.accepted" : "review.match.rejected", `${decision === "accepted" ? "Accepted" : "Rejected"} match for “${r.requested.title}”`, "info", id);
    });
  },

  /* ---------------- library ---------------- */
  updateTrack(id: string, patch: Partial<Pick<Track, "title" | "artistId" | "album">>) {
    setState((s) => {
      const t = s.tracks.find((x) => x.id === id);
      if (!t) return s;
      return pushAudit({ ...s, tracks: s.tracks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, "library.track.updated", `Edited metadata of ${t.code} · ${patch.title ?? t.title}`, "info", t.code);
    });
  },

  deleteTrack(id: string) {
    const t = state.tracks.find((x) => x.id === id);
    if (!t) return;
    const files = state.files.filter((f) => f.trackId === id);
    for (const f of files) if (f.blobKey) void idbDel(f.blobKey);
    if (t.coverSeed.startsWith("img:")) void idbDel(t.coverSeed.slice(4));
    setState((s) =>
      pushAudit(
        {
          ...s,
          tracks: s.tracks.filter((x) => x.id !== id),
          files: s.files.filter((f) => f.trackId !== id),
          playlists: s.playlists.map((p) => (p.trackIds.includes(id) ? { ...p, trackIds: p.trackIds.filter((x) => x !== id), updatedAt: Date.now() } : p)),
        },
        "library.track.deleted",
        `Deleted ${t.code} · ${t.title} (confirmed by operator; ${files.length} file(s))`,
        "warning",
        t.code,
      ),
    );
  },

  recordPlay(trackId: string) {
    setState((s) => ({ ...s, tracks: s.tracks.map((t) => (t.id === trackId ? { ...t, plays: t.plays + 1 } : t)) }));
  },

  /* ---------------- artists ---------------- */
  createArtist(input: Pick<Artist, "name" | "tier" | "country" | "notes">): Artist {
    const a: Artist = { ...input, id: uid("art"), createdAt: Date.now() };
    setState((s) => pushAudit({ ...s, artists: [...s.artists, a] }, "library.artist.created", `Created artist ${a.name} (${a.tier})`, "info", a.name));
    return a;
  },
  updateArtist(id: string, patch: Partial<Artist>) {
    setState((s) => {
      const a = s.artists.find((x) => x.id === id);
      if (!a) return s;
      return pushAudit({ ...s, artists: s.artists.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, "library.artist.updated", `Updated artist ${patch.name ?? a.name}`, "info", a.name);
    });
  },
  deleteArtist(id: string) {
    setState((s) => {
      const a = s.artists.find((x) => x.id === id);
      if (!a || s.tracks.some((t) => t.artistId === id)) return s;
      return pushAudit({ ...s, artists: s.artists.filter((x) => x.id !== id) }, "library.artist.deleted", `Deleted artist ${a.name}`, "warning", a.name);
    });
  },

  /* ---------------- playlists ---------------- */
  createPlaylist(input: Pick<Playlist, "name" | "description" | "color">, trackIds: string[] = []): Playlist {
    const now = Date.now();
    const p: Playlist = { ...input, id: uid("pl"), trackIds, createdAt: now, updatedAt: now };
    setState((s) => pushAudit({ ...s, playlists: [...s.playlists, p] }, "playlist.created", `Created playlist “${p.name}”`, "info", p.name));
    return p;
  },
  updatePlaylist(id: string, patch: Partial<Pick<Playlist, "name" | "description" | "color">>) {
    setState((s) => {
      const p = s.playlists.find((x) => x.id === id);
      if (!p) return s;
      return pushAudit({ ...s, playlists: s.playlists.map((x) => (x.id === id ? { ...x, ...patch, updatedAt: Date.now() } : x)) }, "playlist.updated", `Edited playlist “${patch.name ?? p.name}”`, "info", p.name);
    });
  },
  deletePlaylist(id: string) {
    setState((s) => {
      const p = s.playlists.find((x) => x.id === id);
      if (!p) return s;
      return pushAudit({ ...s, playlists: s.playlists.filter((x) => x.id !== id) }, "playlist.deleted", `Deleted playlist “${p.name}” (tracks stay in the library)`, "warning", p.name);
    });
  },
  /** Returns how many tracks were actually added (ready + usable + not already present). */
  addToPlaylist(id: string, trackIds: string[]): { added: number; skipped: number } {
    let res = { added: 0, skipped: 0 };
    setState((s) => {
      const p = s.playlists.find((x) => x.id === id);
      if (!p) return s;
      const now = Date.now();
      const ok = trackIds.filter((tid) => {
        const t = s.tracks.find((x) => x.id === tid);
        return t && trackUsable(t, s.authorizations, now) && !p.trackIds.includes(tid);
      });
      res = { added: ok.length, skipped: trackIds.length - ok.length };
      if (!ok.length) return s;
      return pushAudit(
        { ...s, playlists: s.playlists.map((x) => (x.id === id ? { ...x, trackIds: [...x.trackIds, ...ok], updatedAt: now } : x)) },
        "playlist.tracks.added",
        `Added ${ok.length} track(s) to “${p.name}”`,
        "info",
        p.name,
      );
    });
    return res;
  },
  removeFromPlaylist(id: string, index: number) {
    setState((s) => {
      const p = s.playlists.find((x) => x.id === id);
      if (!p) return s;
      const t = s.tracks.find((x) => x.id === p.trackIds[index]);
      return pushAudit(
        { ...s, playlists: s.playlists.map((x) => (x.id === id ? { ...x, trackIds: x.trackIds.filter((_, i) => i !== index), updatedAt: Date.now() } : x)) },
        "playlist.tracks.removed",
        `Removed “${t?.title ?? "track"}” from “${p.name}”`,
        "info",
        p.name,
      );
    });
  },
  movePlaylistTrack(id: string, from: number, to: number) {
    setState((s) => {
      const p = s.playlists.find((x) => x.id === id);
      if (!p || from === to || to < 0 || to >= p.trackIds.length) return s;
      const ids = [...p.trackIds];
      const [m] = ids.splice(from, 1);
      ids.splice(to, 0, m);
      return pushAudit({ ...s, playlists: s.playlists.map((x) => (x.id === id ? { ...x, trackIds: ids, updatedAt: Date.now() } : x)) }, "playlist.reordered", `Reordered “${p.name}”`, "info", p.name);
    });
  },

  /* ---------------- references ---------------- */
  saveReference(r: Omit<ExternalReference, "id" | "savedAt">) {
    setState((s) => {
      if (s.references.some((x) => x.url === r.url)) return s;
      const ref: ExternalReference = { ...r, id: uid("ref"), savedAt: Date.now() };
      return pushAudit({ ...s, references: [ref, ...s.references] }, "library.reference.saved", `Saved reference “${r.title}” (${r.provider}) — no audio`, "info", r.url);
    });
  },
  removeReference(id: string) {
    setState((s) => {
      const r = s.references.find((x) => x.id === id);
      if (!r) return s;
      return pushAudit({ ...s, references: s.references.filter((x) => x.id !== id) }, "library.reference.removed", `Removed reference “${r.title}”`, "info", r.url);
    });
  },

  /* ---------------- authorizations ---------------- */
  createAuthorization(input: Omit<Authorization, "id" | "code" | "createdAt" | "createdBy">): Authorization {
    let created!: Authorization;
    setState((s0) => {
      const [n, s] = nextCounter(s0, "auth");
      created = { ...input, id: `auth_${n}_${uid("a").slice(-4)}`, code: `AUTH-${String(n).padStart(4, "0")}`, createdAt: Date.now(), createdBy: s.settings.operator.email };
      return pushAudit({ ...s, authorizations: [...s.authorizations, created] }, "rights.authorization.created", `Recorded ${created.code} · ${created.basis} · ${created.holder}`, "info", created.code);
    });
    return created;
  },
  updateAuthorization(id: string, patch: Partial<Authorization>) {
    setState((s) => {
      const a = s.authorizations.find((x) => x.id === id);
      if (!a) return s;
      const action = patch.review === "revoked" ? "rights.authorization.revoked" : patch.review === "approved" && a.review !== "approved" ? "rights.authorization.approved" : "rights.authorization.updated";
      return pushAudit({ ...s, authorizations: s.authorizations.map((x) => (x.id === id ? { ...x, ...patch } : x)) }, action, `${action.split(".").pop()} ${a.code} · ${a.holder}`, patch.review === "revoked" ? "warning" : "info", a.code);
    });
  },

  dismissDuplicate(id: string) {
    setState((s) => pushAudit({ ...s, duplicates: s.duplicates.map((d) => (d.id === id ? { ...d, dismissed: true } : d)) }, "library.duplicate.dismissed", "Duplicate alert dismissed", "info", id));
  },

  /* ---------------- benchmark ---------------- */
  saveSample(sample: Omit<BenchSample, "id"> & { id?: string }) {
    setState((s) => {
      if (sample.id) {
        return pushAudit({ ...s, samples: s.samples.map((x) => (x.id === sample.id ? ({ ...x, ...sample } as BenchSample) : x)) }, "benchmark.sample.updated", `Updated sample “${sample.query}”`, "info");
      }
      const n: BenchSample = { ...sample, id: uid("smp") };
      return pushAudit({ ...s, samples: [...s.samples, n] }, "benchmark.sample.created", `Added sample “${sample.query}”`, "info");
    });
  },
  deleteSample(id: string) {
    setState((s) => pushAudit({ ...s, samples: s.samples.filter((x) => x.id !== id) }, "benchmark.sample.deleted", "Removed benchmark sample", "info"));
  },
  startBenchRun(engines: EngineId[], sampleIds: string[]): string {
    let id = "";
    setState((s0) => {
      const [n, s] = nextCounter(s0, "bench");
      id = uid("bench");
      const run = {
        id,
        code: `BENCH-${String(n).padStart(3, "0")}`,
        startedAt: Date.now(),
        status: "running" as const,
        engines,
        sampleIds,
        results: [],
        versions: {
          "yt-dlp": s.settings.engines["yt-dlp"].version,
          spotdl: s.settings.engines.spotdl.version,
          freyrjs: s.settings.engines.freyrjs.version,
        },
      };
      return pushAudit({ ...s, benchRuns: [...s.benchRuns, run] }, "benchmark.run.started", `Started ${run.code} · ${sampleIds.length} samples × ${engines.length} engines`, "info", run.code);
    });
    return id;
  },
  cancelBenchRun(id: string) {
    setState((s) => {
      const r = s.benchRuns.find((x) => x.id === id);
      if (!r || r.status !== "running") return s;
      return pushAudit({ ...s, benchRuns: s.benchRuns.map((x) => (x.id === id ? { ...x, status: "cancelled", finishedAt: Date.now() } : x)) }, "benchmark.run.cancelled", `Cancelled ${r.code}`, "warning", r.code);
    });
  },

  /* ---------------- settings / connections / workspace ---------------- */
  updateSettings(patch: Partial<Settings>, label: string) {
    setState((s) => pushAudit({ ...s, settings: { ...s.settings, ...patch } }, "settings.updated", `Updated ${label}`, "info", undefined, Object.fromEntries(Object.entries(patch).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean)]))));
  },
  setAppleMusicEvaluation(enabled: boolean) {
    setState((s) =>
      pushAudit(
        { ...s, connections: s.connections.map((c) => (c.provider === "apple-music" ? { ...c, enabled } : c)) },
        "connections.apple_music.evaluation",
        enabled ? "Apple Music evaluation (Test C) enabled" : "Apple Music evaluation (Test C) disabled",
        "info",
      ),
    );
  },
  logConnectionAttempt(provider: string) {
    setState((s) => pushAudit(s, "connections.connect.blocked", `Connect ${provider} attempted — blocked: developer access pending`, "warning", provider));
  },
  logEvent(action: string, message: string, severity: AuditEvent["severity"] = "info", target?: string) {
    setState((s) => pushAudit(s, action, message, severity, target));
  },
  async resetWorkspace() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    await idbClear();
    const fresh = seedState(Date.now(), session.ip);
    setState(() => pushAudit(fresh, "workspace.reset", "Demo workspace reset to seed data", "warning"));
  },
};
