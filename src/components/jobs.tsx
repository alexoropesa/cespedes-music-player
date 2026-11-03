"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, Check, CircleDashed, Copy, Ellipsis, ExternalLink, LoaderCircle, Pause, Play, RotateCcw, SearchCheck, TriangleAlert, X } from "lucide-react";
import { actions, authStatus, canRetry, isAwaitingReview, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { CHECK_LABEL, codecLabel } from "@/lib/seed";
import { ENGINE_INFO } from "@/lib/catalog";
import type { Artist, Authorization, IngestJob, JobStatus, Playlist, ValidationCheck } from "@/lib/types";
import { cx, fmtBytes, fmtDateTime, fmtDuration, fmtMs, fmtRelative, fmtTime } from "@/lib/util";
import { Button, IconButton } from "./ui/button";
import { AuthStatusBadge, CodecBadge, StatusBadge, STATUS_COLOR } from "./ui/badges";
import { ConfirmDialog, Drawer, Menu } from "./ui/overlay";
import { KV, Notice, ProgressBar } from "./ui/layout";
import { BASIS_LABEL, copyText } from "./tracks";
import { toast } from "@/lib/toast";

export function toolLabel(j: Pick<IngestJob, "tool" | "toolVersion">) {
  return j.tool === "local-import" ? "Local import" : `${ENGINE_INFO[j.tool].name} ${j.toolVersion}`;
}

export function jobNote(j: IngestJob) {
  if (j.status === "pending" && j.paused) return "Paused";
  if (j.status === "pending" && j.retries > 0) return `Retry ${j.retries}/${j.maxRetries}`;
  if (isAwaitingReview(j)) return "Awaiting review";
  if (j.status === "failed" && j.autoRetryAt) return "Auto-retry scheduled";
  return undefined;
}

const STEPS: JobStatus[] = ["pending", "downloading", "validating", "ready"];

export function JobStepper({ job, compact }: { job: IngestJob; compact?: boolean }) {
  const failedAt: JobStatus | null =
    job.status === "failed" ? (job.checks.some((c) => c.status === "fail" || c.status === "pass") ? "validating" : job.progress > 0 || job.startedAt ? "downloading" : "pending") : null;
  const curIdx = job.status === "failed" ? STEPS.indexOf(failedAt!) : STEPS.indexOf(job.status);
  return (
    <ol className={cx("flex items-center", compact ? "gap-1.5" : "gap-2")} aria-label="Job lifecycle">
      {STEPS.map((s, i) => {
        const isFail = job.status === "failed" && i === curIdx;
        const done = i < curIdx || job.status === "ready";
        const current = i === curIdx && !isFail && job.status !== "ready";
        const color = isFail ? STATUS_COLOR.failed : done || current ? STATUS_COLOR[s] : undefined;
        const label = isFail ? "Failed" : s === "ready" ? "Ready" : s[0].toUpperCase() + s.slice(1);
        return (
          <li key={s} className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cx("flex shrink-0 items-center justify-center rounded-full border text-[10px] font-bold", compact ? "size-5" : "size-6", !color && "border-line-strong text-fg-3")}
              style={color ? { borderColor: color, color, background: `color-mix(in oklab, ${color} 14%, transparent)` } : undefined}
            >
              {isFail ? <X size={12} strokeWidth={3} /> : done ? <Check size={12} strokeWidth={3} /> : current ? <span className="size-1.5 animate-pulse rounded-full" style={{ background: color }} /> : i + 1}
            </span>
            {!compact && <span className={cx("truncate text-[12px] font-semibold", color ? "text-fg" : "text-fg-3")}>{label}</span>}
            {i < STEPS.length - 1 && <span className="h-px min-w-3 flex-1" style={{ background: done ? STATUS_COLOR[STEPS[i + 1]] : "var(--color-line-strong)", opacity: done ? 0.6 : 1 }} />}
          </li>
        );
      })}
    </ol>
  );
}

export function CheckIcon({ status }: { status: ValidationCheck["status"] }) {
  if (status === "pass") return <Check size={14} strokeWidth={3} className="text-st-ready" />;
  if (status === "warn") return <TriangleAlert size={14} className="text-warn" />;
  if (status === "fail") return <X size={14} strokeWidth={3} className="text-st-failed" />;
  if (status === "running") return <LoaderCircle size={14} className="animate-spin text-st-validating" />;
  return <CircleDashed size={14} className="text-fg-3" />;
}

export function ChecksList({ job }: { job: IngestJob }) {
  return (
    <ul className="divide-y divide-line rounded-xl border border-line bg-surface-1/50">
      {job.checks.map((c) => (
        <li key={c.key} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
            <CheckIcon status={c.status} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold">{CHECK_LABEL[c.key]}</div>
            <div className={cx("mt-0.5 break-all text-[12.5px]", c.key === "hash" ? "font-mono text-[11.5px] text-fg-2" : "text-fg-2")}>
              {c.detail ?? (c.status === "running" ? "Running…" : "Waiting")}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function useJobActions(job: IngestJob) {
  const router = useRouter();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const awaiting = isAwaitingReview(job);
  const items = [
    job.paused
      ? { label: "Resume", icon: <Play size={15} />, onSelect: () => actions.resumeJob(job.id) }
      : {
          label: "Pause",
          icon: <Pause size={15} />,
          disabled: !(job.status === "pending" || job.status === "downloading"),
          hint: job.status === "validating" ? "Validation is atomic" : "Only pending or downloading jobs",
          onSelect: () => actions.pauseJob(job.id),
        },
    {
      label: job.retries >= job.maxRetries ? "Retry limit reached" : `Retry (${job.retries}/${job.maxRetries})`,
      icon: <RotateCcw size={15} />,
      disabled: !canRetry(job),
      hint: job.status !== "failed" ? "Only failed jobs" : !job.failure?.retryable ? "Retrying won't change this outcome" : "No retries left",
      onSelect: () => actions.retryJob(job.id),
    },
    ...(awaiting ? [{ label: "Review match", icon: <SearchCheck size={15} />, onSelect: () => router.push("/ingest/review") }] : []),
    ...(job.trackId ? [{ label: "Open in library", icon: <ExternalLink size={15} />, onSelect: () => router.push(`/library?track=${job.trackId}`) }] : []),
    { label: "Copy source URL", icon: <Copy size={15} />, onSelect: () => copyText(job.source.url, "Source URL copied") },
    { separator: true, label: "s" },
    {
      label: "Cancel job",
      icon: <Ban size={15} />,
      danger: true,
      disabled: job.status === "ready" || job.status === "failed",
      hint: job.status === "ready" || job.status === "failed" ? "Already finished" : undefined,
      onSelect: () => setConfirmCancel(true),
    },
  ];
  const confirm = (
    <ConfirmDialog
      open={confirmCancel}
      onClose={() => setConfirmCancel(false)}
      title={`Cancel ${job.code}?`}
      description="The job ends as failed (Cancelled by operator) and its staging folder is cleaned. You can retry it later while retries remain."
      confirmLabel="Cancel job"
      onConfirm={() => {
        actions.cancelJob(job.id);
        toast({ title: `${job.code} cancelled` });
      }}
    />
  );
  return { items, confirm };
}

export function JobRowMenu({ job }: { job: IngestJob }) {
  const { items, confirm } = useJobActions(job);
  return (
    <>
      <Menu
        items={items}
        trigger={(p) => (
          <IconButton label={`Actions for ${job.code}`} {...p}>
            <Ellipsis size={18} />
          </IconButton>
        )}
      />
      {confirm}
    </>
  );
}

const TABS = ["Overview", "Validation", "Metrics", "Log"] as const;

export function JobDrawer({ jobId, onClose }: { jobId: string | null; onClose: () => void }) {
  const jobs = useStore((s) => s.jobs);
  const artists = useStore((s) => s.artists);
  const auths = useStore((s) => s.authorizations);
  const playlists = useStore((s) => s.playlists);
  const now = useNow();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const job = jobs.find((j) => j.id === jobId);
  const close = () => {
    setTab("Overview");
    onClose();
  };
  if (!job) return <Drawer open={false} onClose={close} title="" />;
  return <JobDrawerInner job={job} close={close} tab={tab} setTab={setTab} artists={artists} auths={auths} playlists={playlists} now={now} />;
}

function JobDrawerInner({
  job,
  close,
  tab,
  setTab,
  artists,
  auths,
  playlists,
  now,
}: {
  job: IngestJob;
  close: () => void;
  tab: (typeof TABS)[number];
  setTab: (t: (typeof TABS)[number]) => void;
  artists: Artist[];
  auths: Authorization[];
  playlists: Playlist[];
  now: number;
}) {
  const { items, confirm } = useJobActions(job);
  const router = useRouter();
  const measuredSec = useStore((s) => s.files.find((f) => f.kind === "original" && f.trackId === job.trackId)?.durationSec);
  const artist = artists.find((a) => a.id === job.identity.artistId);
  const auth = auths.find((a) => a.id === job.authorizationId);
  const fmt = job.source.formats.find((f) => f.id === job.formatId);
  const playlist = playlists.find((p) => p.id === job.playlistId);
  const awaiting = isAwaitingReview(job);
  const primary = items.filter((i) => !("separator" in i && i.separator));

  return (
    <>
      <Drawer
        open
        onClose={close}
        width="lg"
        title={
          <span className="flex items-center gap-2">
            <span className="font-mono text-[14px] text-fg-2">{job.code}</span> {job.identity.title}
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={job.status} note={jobNote(job)} />
            <span>{toolLabel(job)}</span>
            <span className="text-fg-3">· created {fmtRelative(job.createdAt, now)}</span>
          </span>
        }
        header={
          <div className="border-b border-line px-5 pb-0 pt-4">
            <JobStepper job={job} />
            {job.status === "downloading" && (
              <div className="mt-4">
                <div className="mb-1.5 flex justify-between text-[12px] text-fg-2">
                  <span>{job.paused ? "Paused" : job.mode === "local-file" ? "Copying into staging" : "Downloading into staging"}</span>
                  <span className="font-mono tabular-nums">
                    {fmtBytes((fmt?.sizeBytes ?? 0) * job.progress)} / {fmtBytes(fmt?.sizeBytes)} · {Math.round(job.progress * 100)}%
                  </span>
                </div>
                <ProgressBar value={job.progress} color={STATUS_COLOR.downloading} />
              </div>
            )}
            {awaiting && (
              <Notice tone="warning" className="mt-4" title="Doubtful match — waiting for your decision" action={<Button size="sm" variant="primary" onClick={() => router.push("/ingest/review")}>Review</Button>}>
                {job.review?.reasons.join(" · ")}. It is never accepted automatically.
              </Notice>
            )}
            {job.status === "failed" && job.failure && (
              <Notice tone="danger" className="mt-4" title={`${job.failure.code.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}`}>
                {job.failure.message}
                <div className="mt-1 font-mono text-[11.5px] text-fg-3">
                  {job.failure.tool} {job.failure.version} · {fmtDateTime(job.failure.at)} · {job.failure.retryable ? `retryable (${job.retries}/${job.maxRetries} used)` : "not retryable"}
                  {job.autoRetryAt && ` · auto-retry ${fmtRelative(job.autoRetryAt, now)}`}
                </div>
              </Notice>
            )}
            <div className="mt-3 flex gap-1 overflow-x-auto" role="tablist">
              {TABS.map((t) => (
                <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={cx("relative h-9 shrink-0 px-3 text-[13px] font-semibold", tab === t ? "text-fg" : "text-fg-3 hover:text-fg-2")}>
                  {t}
                  {tab === t && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-fg" />}
                </button>
              ))}
            </div>
          </div>
        }
        footer={
          <>
            {primary.slice(0, 2).map((it) => (
              <Button key={it.label} size="sm" variant="secondary" icon={it.icon} disabled={it.disabled} title={it.disabled ? it.hint : undefined} onClick={it.onSelect}>
                {it.label}
              </Button>
            ))}
            <div className="flex-1" />
            {job.trackId && (
              <Button size="sm" variant="primary" onClick={() => router.push(`/library?track=${job.trackId}`)}>
                Open track
              </Button>
            )}
            <Button size="sm" variant="danger" icon={<Ban size={14} />} disabled={job.status === "ready" || job.status === "failed"} onClick={() => items.find((i) => i.label === "Cancel job")?.onSelect?.()}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="space-y-4 p-5">
          {tab === "Overview" && (
            <>
              <section>
                <h4 className="mb-2 text-[12px] font-semibold text-fg-3">Source</h4>
                <KV
                  items={[
                    { k: "URL", v: job.source.url, mono: true },
                    { k: "Platform", v: job.source.platform },
                    { k: "Source title", v: job.source.title },
                    { k: "Channel / uploader", v: <span>{job.source.channel} <span className="text-fg-3">· not a confirmed artist</span></span> },
                    { k: job.mode === "local-file" ? "Measured duration" : "Source duration", v: job.mode === "local-file" ? (measuredSec != null ? fmtDuration(measuredSec, true) : "—") : fmtDuration(job.source.durationSec) },
                    { k: "Format", v: fmt ? <span className="inline-flex items-center gap-2"><CodecBadge codec={fmt.codec} kbps={fmt.abrKbps} /> {fmt.container.toUpperCase()} · {(fmt.asrHz / 1000).toFixed(1)} kHz · ≈ {fmtBytes(fmt.sizeBytes)}</span> : "—" },
                  ]}
                />
              </section>
              <section>
                <h4 className="mb-2 text-[12px] font-semibold text-fg-3">Identity & destination</h4>
                <KV
                  items={[
                    { k: "Title", v: job.identity.title },
                    { k: "Artist", v: artist ? `${artist.name} · ${artist.tier === "established" ? "Established" : "Independent"}` : "—" },
                    { k: "Album", v: job.identity.album ?? "—" },
                    { k: "Requested reference", v: job.review ? `${job.review.requested.title} — ${job.review.requested.artist} (${fmtDuration(job.review.requested.durationSec)})` : "Direct source" },
                    { k: "Destination", v: `Library${playlist ? ` + playlist “${playlist.name}”` : ""}` },
                  ]}
                />
              </section>
              <section>
                <h4 className="mb-2 text-[12px] font-semibold text-fg-3">Authorization (recorded before download)</h4>
                <KV
                  items={[
                    { k: "Record", v: auth ? <span className="inline-flex items-center gap-2"><Link href="/rights" className="font-mono hover:text-accent">{auth.code}</Link> <AuthStatusBadge status={authStatus(auth, now)} /></span> : "—" },
                    { k: "Basis", v: auth ? BASIS_LABEL[auth.basis] : "—" },
                    { k: "Holder", v: auth?.holder ?? "—" },
                    { k: "Evidence", v: auth?.evidence ?? "—" },
                  ]}
                />
              </section>
              <section>
                <h4 className="mb-2 text-[12px] font-semibold text-fg-3">Sandbox & limits (snapshot at creation)</h4>
                <KV
                  items={[
                    { k: "Staging", v: `IndexedDB · ${job.blobKey ?? job.id}`, mono: true },
                    { k: "Concurrency", v: "1 job at a time" },
                    { k: "Max size", v: `${job.limits.maxSizeMB} MB` },
                    { k: "Max duration", v: `${job.limits.maxDurationMin} min` },
                    { k: "Retries", v: `${job.retries} of ${job.maxRetries} used` },
                  ]}
                />
              </section>
            </>
          )}
          {tab === "Validation" && (
            <>
              <ChecksList job={job} />
              <p className="text-[12px] leading-relaxed text-fg-3">
                Only a complete, validated file leaves staging. The original is always retained; codec is read from the file header, never from the extension. {fmt && fmt.abrKbps > 0 && `Requested format: ${codecLabel(fmt.codec)} ${fmt.abrKbps} kbps.`}
              </p>
            </>
          )}
          {tab === "Metrics" && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Staging time", fmtMs(job.metrics.downloadMs)],
                ["Validation time", fmtMs(job.metrics.processMs)],
                ["Disk used", job.metrics.diskMB != null ? `${job.metrics.diskMB} MB` : "—"],
                ["Attempts", `${job.retries + 1}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-line bg-surface-1/50 p-3.5">
                  <div className="text-[12px] text-fg-3">{k}</div>
                  <div className="mt-1.5 font-mono text-[18px] font-semibold tabular-nums">{v}</div>
                </div>
              ))}
              <p className="col-span-2 text-[12px] text-fg-3">Measured on this device for every job (RNF-REN-01). Thresholds are agreed with the client after the pilot.</p>
            </div>
          )}
          {tab === "Log" && (
            <ol className="space-y-0 rounded-xl border border-line bg-surface-1/60 p-3 font-mono text-[12px]">
              {job.events.map((e, i) => (
                <li key={i} className="flex gap-3 py-1">
                  <span className="shrink-0 text-fg-3">{fmtTime(e.at)}</span>
                  <span
                    className="w-[84px] shrink-0 font-semibold"
                    style={{ color: e.kind === "note" ? "var(--color-fg-2)" : e.kind === "error" ? STATUS_COLOR.failed : STATUS_COLOR[e.kind as JobStatus] }}
                  >
                    {e.kind}
                  </span>
                  <span className="min-w-0 break-words text-fg-2">{e.message}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </Drawer>
      {confirm}
    </>
  );
}

