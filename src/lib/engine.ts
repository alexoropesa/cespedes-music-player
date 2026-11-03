"use client";

/**
 * Ingestion worker. ONE job at a time (RF-ING-05), states
 * pending → downloading → validating → ready | failed (RF-ING-01).
 * Limits (size / duration) and bounded retries (RF-ING-06/07).
 * Simulated jobs follow the simulation adapter; local-file jobs run the real
 * in-browser validation pipeline over bytes stored in IndexedDB staging.
 */
import { CHECK_ORDER, codecLabel } from "./seed";
import { ENGINE_INFO, PROVIDER_LABEL, simulateBench } from "./catalog";
import { decodeFully, EXT_COMPATIBLE, extOf, sha256Hex, sniffAudio } from "./audio-inspect";
import { idbDel, idbGet } from "./idb";
import { actions, getState, isAwaitingReview, nextCounter, pushAudit, session, setState, updateJob } from "./store";
import type { AudioFile, FailureCode, IngestJob, State, Track, ValidationCheck } from "./types";
import { fakeSha256, fmtDuration, seeded, slug } from "./util";
import { toast } from "./toast";

const CHECK_MS = 650;

function providerFromLabel(label: string) {
  const hit = (Object.keys(PROVIDER_LABEL) as (keyof typeof PROVIDER_LABEL)[]).find((k) => PROVIDER_LABEL[k] === label || k === label);
  return hit ?? "web";
}
const TRANSIENT: FailureCode[] = ["NETWORK", "INCOMPLETE", "INTERRUPTED"];

function sizeOf(j: IngestJob) {
  return j.source.formats.find((f) => f.id === j.formatId)?.sizeBytes ?? 4_000_000;
}
function formatOf(j: IngestJob) {
  return j.source.formats.find((f) => f.id === j.formatId) ?? j.source.formats[0];
}

function downloadDurationMs(j: IngestJob) {
  const r = seeded(`${j.id}:${j.retries}`);
  return 3200 + r() * 2600;
}

function setChecks(j: IngestJob, key: ValidationCheck["key"], patch: Partial<ValidationCheck>): IngestJob {
  return { ...j, checks: j.checks.map((c) => (c.key === key ? { ...c, ...patch } : c)) };
}

/* ------------------------------------------------------------------ */
/* transitions                                                         */
/* ------------------------------------------------------------------ */

function fail(s: State, j: IngestJob, code: FailureCode, message: string, now: number, retryable?: boolean): State {
  const isTransient = TRANSIENT.includes(code);
  const canRetry = (retryable ?? isTransient) && j.retries < j.maxRetries;
  const autoRetryAt = canRetry && isTransient && s.settings.autoRetryTransient ? now + 2000 * Math.pow(2, j.retries) : undefined;
  let s2 = updateJob(s, j.id, (x) => ({
    ...x,
    status: "failed",
    finishedAt: now,
    phaseStartedAt: undefined,
    autoRetryAt,
    failure: { code, message, tool: x.tool, version: x.toolVersion, retryable: retryable ?? isTransient, at: now },
    events: [
      ...x.events,
      { at: now, kind: "failed", message: `${code} — ${message}` },
      ...(autoRetryAt ? [{ at: now, kind: "note" as const, message: `Automatic retry ${x.retries + 1}/${x.maxRetries} scheduled (backoff ${Math.round((autoRetryAt - now) / 1000)} s)` }] : []),
    ],
  }));
  s2 = pushAudit(s2, "ingest.job.failed", `${j.code} failed · ${code} — ${message}`, "error", j.code, { tool: j.tool, version: j.toolVersion, source: j.source.url });
  if (j.mode === "local-file" && !(retryable ?? isTransient)) {
    if (j.blobKey) void idbDel(j.blobKey);
    if (j.source.coverSeed.startsWith("img:")) void idbDel(j.source.coverSeed.slice(4));
  }
  queueMicrotask(() => toast({ tone: "error", title: `${j.code} failed`, description: message }));
  return s2;
}

function finalizeReady(s0: State, j: IngestJob, file: Omit<AudioFile, "id" | "trackId" | "kind" | "createdAt" | "path">, now: number): State {
  const [n, s] = nextCounter(s0, "track");
  const trackId = `trk_${n}_${j.id.slice(-4)}`;
  const fileId = `file_${n}_${j.id.slice(-4)}`;
  const artist = s.artists.find((a) => a.id === j.identity.artistId);
  const ext = file.declaredExt ?? (file.container === "mp4" ? "m4a" : file.container);
  const path = `${s.settings.libraryDir}/originals/${slug(artist?.name ?? "unknown")}/${slug(j.identity.title)}.${ext}`;
  const af: AudioFile = { ...file, id: fileId, trackId, kind: "original", createdAt: now, path };
  const track: Track = {
    id: trackId,
    code: `TRK-${String(n).padStart(4, "0")}`,
    title: j.identity.title,
    artistId: j.identity.artistId,
    album: j.identity.album,
    durationSec: Math.round(file.durationSec),
    addedAt: now,
    originalFileId: fileId,
    derivativeIds: [],
    authorizationId: j.authorizationId,
    provenance: {
      sourceUrl: j.source.url,
      sourcePlatform: j.source.platform,
      sourceId: j.source.sourceId,
      channel: j.source.channel,
      requested: j.review?.requested,
      tool: j.tool,
      toolVersion: j.toolVersion,
      retrievedAt: j.startedAt ?? now,
      operator: s.settings.operator.email,
      ip: session.ip,
      jobId: j.id,
    },
    plays: 0,
    coverSeed: j.source.coverSeed,
  };
  let s2: State = {
    ...s,
    tracks: [...s.tracks, track],
    files: [...s.files, af],
  };
  s2 = updateJob(s2, j.id, (x) => ({
    ...x,
    status: "ready",
    progress: 1,
    finishedAt: now,
    trackId,
    metrics: { ...x.metrics, processMs: now - (x.phaseStartedAt ?? now) + (x.metrics.processMs ?? 0), diskMB: +(file.sizeBytes / 1048576).toFixed(1) },
    events: [...x.events, { at: now, kind: "ready", message: j.mode === "local-file" ? "Validated · original stored in the library (IndexedDB)" : `Validated · original stored at ${path}` }],
  }));
  s2 = pushAudit(s2, "ingest.job.ready", `${j.code} ready · ${track.code} “${track.title}” added to library`, "info", j.code, { sha256: file.sha256 });
  if (j.playlistId) {
    const pl = s2.playlists.find((p) => p.id === j.playlistId);
    if (pl && !pl.trackIds.includes(trackId)) {
      s2 = { ...s2, playlists: s2.playlists.map((p) => (p.id === pl.id ? { ...p, trackIds: [...p.trackIds, trackId], updatedAt: now } : p)) };
      s2 = pushAudit(s2, "playlist.tracks.added", `Added “${track.title}” to “${pl.name}” on ready`, "info", pl.name);
    }
  }
  queueMicrotask(() => toast({ tone: "success", title: `${track.title} is ready`, description: `${j.code} · validated and added to the library${j.playlistId ? " and playlist" : ""}.` }));
  return s2;
}

/* ------------------------------------------------------------------ */
/* simulated pipeline                                                  */
/* ------------------------------------------------------------------ */

function advanceSimulated(s: State, j: IngestJob, now: number): State {
  const started = j.phaseStartedAt ?? now;
  const elapsed = now - started;
  if (j.status === "downloading") {
    const total = sizeOf(j);
    const limit = j.limits.maxSizeMB * 1024 * 1024;
    const dur = j.scenario === "oversize" ? 5200 * (total / limit) : downloadDurationMs(j);
    const progress = Math.min(1, elapsed / dur);
    if (j.scenario === "access-required" && elapsed > 700) {
      return fail(s, j, "ACCESS_REQUIRED", "Source requires sign-in or membership (HTTP 403). Limitation recorded — no alternative version substituted.", now, false);
    }
    if (j.scenario === "network-flaky" && j.retries < 1 && progress > 0.45) {
      return fail(s, j, "NETWORK", "Connection reset by peer at 45% — partial file discarded from staging.", now);
    }
    if (progress * total > limit) {
      return fail(s, j, "SIZE_LIMIT", `Size limit exceeded — download aborted at ${j.limits.maxSizeMB} MB (source ≈ ${Math.round(total / 1048576)} MB). Partial file removed.`, now, false);
    }
    if (progress >= 1) {
      return updateJob(s, j.id, (x) => ({
        ...x,
        status: "validating",
        progress: 1,
        phaseStartedAt: now,
        metrics: { ...x.metrics, downloadMs: Math.round(elapsed) },
        checks: CHECK_ORDER.map((key, i) => ({ key, status: i === 0 ? "running" : "pending" })),
        events: [...x.events, { at: now, kind: "validating", message: "Download complete · validating in sandbox (ffprobe, decode, hash)" }],
      }));
    }
    return updateJob(s, j.id, (x) => ({ ...x, progress }));
  }

  if (j.status === "validating") {
    const fmt = formatOf(j);
    const allDone = j.checks.every((c) => c.status === "pass" || c.status === "warn");
    const idx = allDone ? CHECK_ORDER.length : Math.floor(elapsed / CHECK_MS);
    let job = j;
    const actualDur = j.scenario === "duration-off" ? 30 : j.source.durationSec + (seeded(j.id)() - 0.5) * 0.4;
    const realCodec = j.scenario === "ext-mismatch" ? "aac" : fmt.codec;
    const realContainer = j.scenario === "ext-mismatch" ? "mp4" : fmt.container;
    const sha = j.simHash ?? fakeSha256(`${j.source.url}:${fmt.id}`);
    for (let k = 0; k < CHECK_ORDER.length; k++) {
      const key = CHECK_ORDER[k];
      const c = job.checks[k];
      if (k < idx && (c.status === "running" || c.status === "pending")) {
        // resolve check
        if (key === "complete") {
          if (j.scenario === "truncated" && j.retries < 1) {
            job = setChecks(job, key, { status: "fail", detail: `Decoder error at ${fmtDuration(j.source.durationSec * 0.7)} of ${fmtDuration(j.source.durationSec)} — stream ends early` });
            return fail(updateJob(s, j.id, () => job), job, "INCOMPLETE", "Incomplete file — decoder stopped before the end of the stream. Partial file not published.", now);
          }
          job = setChecks(job, key, { status: "pass", detail: "Decoded end-to-end without errors" });
        } else if (key === "codec") {
          job =
            j.scenario === "ext-mismatch"
              ? setChecks(job, key, { status: "warn", detail: `Declared .${fmt.ext} but ffprobe reports ${codecLabel(realCodec)} in MP4 — real codec recorded` })
              : setChecks(job, key, { status: "pass", detail: `${codecLabel(realCodec)} · ${(fmt.asrHz / 1000).toFixed(1)} kHz · stereo · ${fmt.abrKbps} kbps (${realContainer.toUpperCase()})` });
        } else if (key === "duration") {
          const delta = Math.abs(actualDur - j.source.durationSec);
          if (delta > j.limits.toleranceSec) {
            job = setChecks(job, key, { status: "fail", detail: `${fmtDuration(actualDur)} received vs ${fmtDuration(j.source.durationSec)} at source (Δ ${Math.round(delta)} s > ±${j.limits.toleranceSec} s)` });
            return fail(updateJob(s, j.id, () => job), job, "DURATION_MISMATCH", `Received a ${fmtDuration(actualDur)} preview instead of the full ${fmtDuration(j.source.durationSec)} — limitation recorded, no substitute downloaded.`, now, false);
          }
          job = setChecks(job, key, { status: "pass", detail: `${fmtDuration(actualDur, true)} vs source ${fmtDuration(j.source.durationSec)} (Δ ${delta.toFixed(1)} s ≤ ±${j.limits.toleranceSec} s)` });
        } else if (key === "hash") {
          job = setChecks(job, key, { status: "pass", detail: sha });
        } else if (key === "duplicate") {
          const dupFile = s.files.find((f) => f.sha256 === sha);
          if (dupFile) {
            const t = s.tracks.find((x) => x.id === dupFile.trackId);
            job = setChecks(job, key, { status: "fail", detail: `Same hash as ${t?.code ?? "existing file"} · ${t?.title ?? ""}` });
            let s2 = updateJob(s, j.id, () => job);
            s2 = {
              ...s2,
              duplicates: [
                { id: `dup_${j.id}_${j.retries}`, at: now, jobId: j.id, existingTrackId: dupFile.trackId, sha256: sha, sourceUrl: j.source.url, title: j.identity.title, dismissed: false },
                ...s2.duplicates,
              ],
            };
            return fail(s2, job, "DUPLICATE", `Identical SHA-256 to “${t?.title ?? "existing track"}” (${t?.code ?? "—"}) already in library — no second copy added.`, now, false);
          }
          job = setChecks(job, key, { status: "pass", detail: `No identical hash among ${s.files.length} library files` });
        }
      } else if (k === idx && c.status === "pending") {
        job = setChecks(job, key, { status: "running" });
      }
    }
    if (idx >= CHECK_ORDER.length) {
      // all checks passed — review gate for doubtful matches
      if (job.review && !job.review.decision) {
        let s2 = updateJob(s, j.id, (x) => ({
          ...job,
          metrics: { ...x.metrics, processMs: Math.round(elapsed), cpuPeakPct: 14 + Math.round(seeded(j.id)() * 40), memPeakMB: 70 + Math.round(seeded(j.id + "m")() * 90) },
          events: [...job.events, { at: now, kind: "note", message: "Doubtful match — waiting for operator review (never auto-accepted)" }],
        }));
        if (!s2.reviews.some((r) => r.jobId === j.id && r.status === "needs-review") && j.review) {
          const rv = j.review;
          s2 = {
            ...s2,
            reviews: [
              {
                id: `rev_${j.id}`,
                createdAt: now,
                requested: rv.requested,
                candidate: {
                  id: `${j.tool}:${j.id}`,
                  engine: j.tool === "local-import" ? "yt-dlp" : j.tool,
                  query: rv.requested.title,
                  provider: providerFromLabel(j.source.platform),
                  title: j.source.title,
                  channel: j.source.channel,
                  durationSec: j.source.durationSec,
                  url: j.source.url,
                  codec: realCodec,
                  bitrateKbps: fmt.abrKbps,
                  flags: [],
                  confidence: 0.4,
                  coverSeed: j.source.coverSeed,
                  scenario: j.scenario,
                },
                jobId: j.id,
                status: "needs-review",
                reasons: rv.reasons,
              },
              ...s2.reviews,
            ],
          };
          s2 = pushAudit(s2, "review.match.flagged", `${j.code} waiting for match review · ${rv.reasons.join(", ")}`, "warning", j.code);
          queueMicrotask(() => toast({ tone: "warning", title: "Match needs review", description: `${j.code} · ${rv.reasons.join(" · ")}` }));
        }
        return s2;
      }
      const s2 = updateJob(s, j.id, () => ({ ...job, metrics: { ...job.metrics, cpuPeakPct: 14 + Math.round(seeded(j.id)() * 40), memPeakMB: 70 + Math.round(seeded(j.id + "m")() * 90) } }));
      return finalizeReady(
        s2,
        { ...job, phaseStartedAt: started },
        {
          codec: realCodec,
          container: realContainer,
          bitrateKbps: j.tool === "freyrjs" ? 320 : fmt.abrKbps,
          sampleRateHz: fmt.asrHz,
          channels: 2,
          sizeBytes: sizeOf(j),
          durationSec: actualDur,
          sha256: sha,
          audio: "synthetic",
          declaredExt: fmt.ext,
        },
        now,
      );
    }
    return job === j ? s : updateJob(s, j.id, () => job);
  }
  return s;
}

/* ------------------------------------------------------------------ */
/* local-file pipeline (real validation over real bytes)               */
/* ------------------------------------------------------------------ */

const running = new Set<string>();
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reads a staged blob chunk by chunk, reporting the real fraction read (throttled). */
async function readWithProgress(blob: Blob, onProgress: (p: number) => void): Promise<ArrayBuffer> {
  const out = new Uint8Array(blob.size);
  const reader = blob.stream().getReader();
  let read = 0;
  let last = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out.set(value, read);
    read += value.byteLength;
    const p = blob.size ? read / blob.size : 1;
    if (p - last >= 0.05 || p === 1) {
      last = p;
      onProgress(p);
    }
  }
  return out.buffer;
}

function stillActive(id: string) {
  const j = getState().jobs.find((x) => x.id === id);
  return !!j && (j.status === "downloading" || j.status === "validating") && !j.paused;
}

async function runLocal(jobId: string) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const job0 = getState().jobs.find((x) => x.id === jobId)!;
    const t0 = performance.now();
    const blob = job0.blobKey ? await idbGet(job0.blobKey) : undefined;
    if (!blob) {
      setState((s) => fail(s, s.jobs.find((x) => x.id === jobId)!, "INTERRUPTED", "Staged file not found (staging was cleared). Re-import the file.", Date.now(), false));
      return;
    }
    // "downloading" = reading the staged bytes; progress is the real share read so far
    const buf = await readWithProgress(blob, (p) => setState((s) => updateJob(s, jobId, (x) => ({ ...x, progress: p }))));
    if (!stillActive(jobId)) return;
    const limitBytes = job0.limits.maxSizeMB * 1024 * 1024;
    if (buf.byteLength > limitBytes) {
      setState((s) => fail(s, s.jobs.find((x) => x.id === jobId)!, "SIZE_LIMIT", `File is ${(buf.byteLength / 1048576).toFixed(1)} MB — exceeds the ${job0.limits.maxSizeMB} MB limit.`, Date.now(), false));
      return;
    }
    const tProc = performance.now();
    setState((s) =>
      updateJob(s, jobId, (x) => ({
        ...x,
        status: "validating",
        progress: 1,
        phaseStartedAt: Date.now(),
        metrics: { ...x.metrics, downloadMs: Math.round(tProc - t0) },
        checks: CHECK_ORDER.map((key, i) => ({ key, status: i === 0 ? "running" : "pending" })),
        events: [...x.events, { at: Date.now(), kind: "validating", message: `Read ${(buf.byteLength / 1048576).toFixed(1)} MB from staging · validating real bytes` }],
      })),
    );
    const step = async (key: ValidationCheck["key"], patch: Partial<ValidationCheck>) => {
      await wait(0); // yield so each check renders as it resolves
      setState((s) =>
        updateJob(s, jobId, (x) => {
          const i = CHECK_ORDER.indexOf(key);
          return {
            ...x,
            checks: x.checks.map((c, k) => (k === i ? { ...c, ...patch } : k === i + 1 && patch.status !== "fail" ? { ...c, status: "running" } : c)),
          };
        }),
      );
    };
    // 1. complete — decode end-to-end
    let decoded: { durationSec: number; channels: number };
    try {
      decoded = await decodeFully(buf);
    } catch (e) {
      await step("complete", { status: "fail", detail: `Decoder could not read the stream end-to-end (${(e as Error).message || "decode error"})` });
      setState((s) => fail(s, s.jobs.find((x) => x.id === jobId)!, "DECODE_ERROR", "File is incomplete or not decodable — not published to the library.", Date.now(), false));
      return;
    }
    if (!stillActive(jobId)) return;
    await step("complete", { status: "pass", detail: `Decoded end-to-end (${fmtDuration(decoded.durationSec, true)}, ${decoded.channels} ch)` });
    // 2. real codec
    const sn = sniffAudio(buf);
    const ext = extOf(job0.fileName ?? "");
    const extOk = !!sn && (EXT_COMPATIBLE[sn.ext]?.includes(ext) ?? ext === sn.ext);
    const codecText = sn
      ? `${codecLabel(sn.codec)} · ${sn.sampleRateHz ? `${(sn.sampleRateHz / 1000).toFixed(1)} kHz` : "rate n/a"} · ${sn.channels ?? decoded.channels} ch (${sn.container.toUpperCase()})`
      : "Unrecognized container — decoded by the browser but codec unknown";
    await step("codec", sn && extOk ? { status: "pass", detail: codecText } : { status: "warn", detail: sn ? `Extension .${ext || "?"} but actual stream is ${codecText} — real codec recorded` : codecText });
    // 3. duration + limit
    const maxSec = job0.limits.maxDurationMin * 60;
    if (decoded.durationSec > maxSec) {
      await step("duration", { status: "fail", detail: `${fmtDuration(decoded.durationSec)} exceeds the ${job0.limits.maxDurationMin}:00 limit` });
      setState((s) => fail(s, s.jobs.find((x) => x.id === jobId)!, "DURATION_LIMIT", `Duration ${fmtDuration(decoded.durationSec)} exceeds the ${job0.limits.maxDurationMin} min limit.`, Date.now(), false));
      return;
    }
    await step("duration", { status: "pass", detail: `${fmtDuration(decoded.durationSec, true)} (limit ${job0.limits.maxDurationMin}:00)` });
    // 4. hash
    const sha = await sha256Hex(buf);
    await step("hash", { status: "pass", detail: sha });
    // 5. duplicate
    const st = getState();
    const dup = st.files.find((f) => f.sha256 === sha);
    if (dup) {
      const t = st.tracks.find((x) => x.id === dup.trackId);
      await step("duplicate", { status: "fail", detail: `Same hash as ${t?.code ?? "existing file"} · ${t?.title ?? ""}` });
      setState((s) => {
        const s1: State = {
          ...s,
          duplicates: [{ id: `dup_${jobId}`, at: Date.now(), jobId, existingTrackId: dup.trackId, sha256: sha, sourceUrl: job0.source.url, title: job0.identity.title, dismissed: false }, ...s.duplicates],
        };
        return fail(s1, s1.jobs.find((x) => x.id === jobId)!, "DUPLICATE", `Identical SHA-256 to “${t?.title ?? "existing track"}” already in library — no second copy added.`, Date.now(), false);
      });
      return;
    }
    await step("duplicate", { status: "pass", detail: `No identical hash among ${st.files.length} library files` });
    if (!stillActive(jobId)) return;
    const procMs = Math.round(performance.now() - tProc);
    setState((s) => {
      const j = s.jobs.find((x) => x.id === jobId)!;
      const withMetrics = updateJob(s, jobId, (x) => ({ ...x, metrics: { ...x.metrics, processMs: procMs } }));
      return finalizeReady(
        withMetrics,
        { ...j, phaseStartedAt: Date.now() },
        {
          codec: sn?.codec ?? "unknown",
          container: sn?.container ?? (ext || "unknown"),
          bitrateKbps: Math.round((buf.byteLength * 8) / decoded.durationSec / 1000),
          sampleRateHz: sn?.sampleRateHz ?? null,
          channels: sn?.channels ?? decoded.channels,
          sizeBytes: buf.byteLength,
          durationSec: decoded.durationSec,
          sha256: sha,
          audio: "blob",
          blobKey: job0.blobKey,
          declaredExt: ext || sn?.ext,
        },
        Date.now(),
      );
    });
  } catch (e) {
    setState((s) => {
      const j = s.jobs.find((x) => x.id === jobId);
      return j ? fail(s, j, "DECODE_ERROR", (e as Error).message || "Unexpected validation error", Date.now(), false) : s;
    });
  } finally {
    running.delete(jobId);
  }
}

/* ------------------------------------------------------------------ */
/* tick                                                                */
/* ------------------------------------------------------------------ */

export function engineTick() {
  const now = Date.now();
  const s = getState();
  if (!s.seededAt) return;

  // 1) automatic (bounded) retries for transient failures
  for (const j of s.jobs) {
    if (j.status === "failed" && j.autoRetryAt && j.autoRetryAt <= now) actions.retryJob(j.id, true);
  }

  // 2) active job (awaiting-review jobs don't hold the worker)
  const st = getState();
  const active = st.jobs.find((j) => (j.status === "downloading" || j.status === "validating") && !isAwaitingReview(j));
  if (active) {
    if (active.mode === "simulated") setState((x) => advanceSimulated(x, x.jobs.find((y) => y.id === active.id)!, now));
    else void runLocal(active.id);
  } else if (!st.queuePaused) {
    {
      const next = st.jobs.filter((j) => j.status === "pending" && !j.paused).sort((a, b) => a.createdAt - b.createdAt)[0];
      if (next) {
        const dur = downloadDurationMs(next);
        setState((x) =>
          pushAudit(
            updateJob(x, next.id, (j) => ({
              ...j,
              status: "downloading",
              startedAt: j.startedAt ?? now,
              phaseStartedAt: now - (j.progress > 0 && j.progress < 1 ? j.progress * dur : 0),
              events: [...j.events, { at: now, kind: "downloading", message: j.mode === "local-file" ? "Reading staged file from IndexedDB (1 concurrent job)" : `Downloading into ${x.settings.stagingDir}/${j.id} (isolated · 1 concurrent job)` }],
            })),
            "ingest.job.started",
            `${next.code} started · ${next.tool} ${next.toolVersion}`,
            "info",
            next.code,
          ),
        );
      }
    }
  }

  // 3) benchmark runs — samples processed in sequence, engines in parallel
  for (const run of getState().benchRuns) {
    if (run.status !== "running") continue;
    const elapsed = now - run.startedAt;
    const doneSamples = Math.min(run.sampleIds.length, Math.floor(elapsed / 1300));
    const have = run.results.length / Math.max(1, run.engines.length);
    if (doneSamples > have) {
      setState((x) => {
        const r = x.benchRuns.find((b) => b.id === run.id)!;
        const newResults = run.sampleIds.slice(have, doneSamples).flatMap((sid) => {
          const sample = x.samples.find((sm) => sm.id === sid);
          return sample ? r.engines.map((e) => simulateBench(sample, e, r.id, x.settings.durationToleranceSec)) : [];
        });
        const complete = doneSamples >= run.sampleIds.length;
        let x2: State = {
          ...x,
          benchRuns: x.benchRuns.map((b) => (b.id === run.id ? { ...b, results: [...b.results, ...newResults], status: complete ? "completed" : "running", finishedAt: complete ? now : undefined } : b)),
        };
        if (complete) {
          x2 = pushAudit(x2, "benchmark.run.completed", `${r.code} completed · ${r.sampleIds.length} samples × ${r.engines.length} engines`, "info", r.code);
          queueMicrotask(() => toast({ tone: "success", title: `${r.code} completed`, description: "Results are ready to compare." }));
        }
        return x2;
      });
    }
  }
}

export { ENGINE_INFO };
