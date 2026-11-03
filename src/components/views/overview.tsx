"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, ArrowRight, Link2, Ban, CircleCheck, CircleDashed, Clock, Database, FileUp, Library, ListMusic, Play, ShieldAlert, TriangleAlert } from "lucide-react";
import { actions, authStatus, isAwaitingReview, trackUsable, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { playQueue, toggle, usePlayer } from "@/lib/player";
import type { JobStatus } from "@/lib/types";
import { JOB_STATUSES } from "@/lib/types";
import { cx, fmtBytes, fmtDuration, fmtRelative } from "@/lib/util";
import { Button, PlayButton } from "@/components/ui/button";
import { AuthStatusBadge, StatusBadge, STATUS_COLOR } from "@/components/ui/badges";
import { Body, Card, Cover, EmptyState, PageHeader, ProgressBar, SectionTitle, Stat } from "@/components/ui/layout";
import { JobDrawer, JobStepper, jobNote, toolLabel } from "@/components/jobs";
import { TrackDrawer } from "@/components/tracks";

export function OverviewView() {
  const tracks = useStore((s) => s.tracks);
  const files = useStore((s) => s.files);
  const artists = useStore((s) => s.artists);
  const jobs = useStore((s) => s.jobs);
  const auths = useStore((s) => s.authorizations);
  const audit = useStore((s) => s.audit);
  const queuePaused = useStore((s) => s.queuePaused);
  const operator = useStore((s) => s.settings.operator);
  const now = useNow();
  const player = usePlayer();
  const router = useRouter();
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [openTrack, setOpenTrack] = useState<string | null>(null);

  const active = jobs.find((j) => (j.status === "downloading" || j.status === "validating") && !isAwaitingReview(j));
  const pending = jobs.filter((j) => j.status === "pending");
  const failed24 = jobs.filter((j) => j.status === "failed" && j.finishedAt && now - j.finishedAt < 86_400_000);
  const storage = files.reduce((a, f) => a + f.sizeBytes, 0);
  const est = tracks.filter((t) => artists.find((a) => a.id === t.artistId)?.tier === "established").length;
  const counts = JOB_STATUSES.map((s) => ({ s, n: jobs.filter((j) => j.status === s).length }));
  const total = Math.max(1, jobs.length);
  const recent = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 6);
  const alerts = auths.filter((a) => ["expired", "expiring", "under-review"].includes(authStatus(a, now)));
  const hour = now ? new Date(now).getHours() : 12;
  const greet = hour < 12 ? "Good morning" : hour < 19 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={`${greet}, ${operator.name.split(" ")[0]}`}
        title="Overview"
        description="Local library: bring in authorized tracks from a URL or from disk, validate them for real, keep their provenance, build playlists and play offline."
        actions={
          <>
            <Button variant="secondary" icon={<Link2 size={16} />} onClick={() => router.push("/ingest/url")}>
              From URL
            </Button>
            <Button variant="primary" icon={<FileUp size={16} />} onClick={() => router.push("/ingest")}>
              Import track
            </Button>
          </>
        }
      />
      <Body className="space-y-8">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Ready in library" value={tracks.length} hint={`${est} established · ${tracks.length - est} independent`} icon={<CircleCheck size={16} />} tone={STATUS_COLOR.ready} href="/library" />
          <Stat label="In queue" value={pending.length + (active ? 1 : 0)} hint={queuePaused ? "Queue paused" : active ? `${active.code} running` : "Worker idle"} icon={<Clock size={16} />} tone={STATUS_COLOR.downloading} href="/queue" />
          <Stat label="Failed · 24 h" value={failed24.length} hint={`${jobs.filter((j) => j.status === "failed").length} failed overall`} icon={<TriangleAlert size={16} />} tone={STATUS_COLOR.failed} href="/queue?status=failed" />
          <Stat label="Library storage" value={fmtBytes(storage)} hint={`${files.length} files · originals retained`} icon={<Database size={16} />} />
        </div>

        <Card
          title="Active job"
          description="One job at a time · isolated staging folder"
          actions={
            <Link href="/queue" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg-2 hover:text-fg">
              Queue monitor <ArrowRight size={14} />
            </Link>
          }
        >
          {active ? (
            <button type="button" onClick={() => setOpenJob(active.id)} className="block w-full rounded-xl border border-line bg-surface-1/60 p-4 text-left transition-colors hover:border-white/15">
              <div className="flex items-start gap-4">
                <Cover seed={active.source.coverSeed} size={56} rounded="rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-fg-3">{active.code}</span>
                    <StatusBadge status={active.status} note={jobNote(active)} />
                  </div>
                  <div className="mt-1 truncate text-[15px] font-bold">{active.identity.title}</div>
                  <div className="truncate text-[12.5px] text-fg-2">
                    {active.source.platform} · {toolLabel(active)} · attempt {active.retries + 1} of {active.maxRetries + 1}
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <JobStepper job={active} />
              </div>
              {active.status === "downloading" ? (
                <ProgressBar className="mt-4" value={active.progress} color={STATUS_COLOR.downloading} />
              ) : (
                <div className="mt-4 flex flex-wrap gap-2">
                  {active.checks.map((c) => (
                    <span
                      key={c.key}
                      className={cx(
                        "rounded-md border px-2 py-0.5 text-[11.5px] font-medium",
                        c.status === "pass" ? "border-st-ready/25 text-st-ready" : c.status === "running" ? "border-st-validating/30 text-st-validating" : c.status === "warn" ? "border-warn/30 text-warn" : c.status === "fail" ? "border-st-failed/30 text-st-failed" : "border-line text-fg-3",
                      )}
                    >
                      {c.key}
                    </span>
                  ))}
                </div>
              )}
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong px-6 py-8 text-center">
              <CircleDashed className="text-fg-3" />
              <div>
                <div className="text-[14px] font-semibold">{queuePaused ? "Queue paused" : pending.length ? "Starting next job…" : "Worker idle"}</div>
                <p className="mt-1 text-[12.5px] text-fg-3">{queuePaused ? `${pending.length} pending job(s) will wait until the queue is resumed.` : "Nothing downloading or validating right now."}</p>
              </div>
              {queuePaused ? (
                <Button size="sm" variant="primary" icon={<Play size={14} />} onClick={() => actions.setQueuePaused(false)}>
                  Resume queue
                </Button>
              ) : (
                <Button size="sm" variant="secondary" icon={<FileUp size={14} />} onClick={() => router.push("/ingest")}>
                  Import track
                </Button>
              )}
            </div>
          )}
          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[12px] text-fg-3">
              <span>All jobs by state</span>
              <span className="tabular-nums">{jobs.length} total</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              {counts.map(({ s, n }) => (n ? <div key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS_COLOR[s as JobStatus] }} title={`${s}: ${n}`} /> : null))}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
              {counts.map(({ s, n }) => (
                <Link key={s} href={`/queue?status=${s}`} className="inline-flex items-center gap-1.5 text-[12px] text-fg-2 hover:text-fg">
                  <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[s as JobStatus] }} />
                  <span className="capitalize">{s}</span>
                  <span className="font-semibold tabular-nums text-fg">{n}</span>
                </Link>
              ))}
            </div>
          </div>
        </Card>

        <section>
          <SectionTitle
            actions={
              <Link href="/library" className="text-[13px] font-semibold text-fg-2 hover:text-fg hover:underline">
                Show all
              </Link>
            }
          >
            Recently added
          </SectionTitle>
          {!recent.length && (
            <EmptyState
              icon={<FileUp size={22} />}
              title="The library is empty"
              description="Import an audio file to validate it and add it to the library."
              action={
                <Button variant="primary" icon={<FileUp size={16} />} onClick={() => router.push("/ingest")}>
                  Import track
                </Button>
              }
            />
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {recent.map((t) => {
              const usable = trackUsable(t, auths, now);
              const isCur = player.queue[player.index] === t.id;
              return (
                <div key={t.id} className="group rounded-xl p-2.5 transition-colors hover:bg-white/[0.05]">
                  <div className="relative">
                    <button type="button" onClick={() => setOpenTrack(t.id)} className="block w-full" aria-label={`Open ${t.title}`}>
                      <Cover seed={t.coverSeed} size={400} rounded="rounded-lg" className="aspect-square !h-auto !w-full shadow-[0_8px_24px_-8px_rgb(0_0_0/0.6)]" />
                    </button>
                    <div className={cx("absolute bottom-2 right-2 translate-y-1 opacity-0 transition-all group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100", isCur && player.playing && "translate-y-0 opacity-100")}>
                      <PlayButton
                        playing={isCur && player.playing}
                        disabled={!usable}
                        label={usable ? undefined : "Not usable — authorization not active"}
                        onClick={() => (isCur ? toggle() : playQueue(recent.map((x) => x.id), recent.indexOf(t), { kind: "library", label: "Recently added" }))}
                      />
                    </div>
                  </div>
                  <button type="button" onClick={() => setOpenTrack(t.id)} className="mt-2.5 block w-full text-left">
                    <span className="block truncate text-[13.5px] font-semibold">{t.title}</span>
                    <span className="block truncate text-[12px] text-fg-3">
                      {artists.find((a) => a.id === t.artistId)?.name}
                      {!usable && " · not usable"}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card
            title="Rights alerts"
            description="Expired or unreviewed authorizations block playback (RC-09)"
            actions={
              <Link href="/rights" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg-2 hover:text-fg">
                Rights <ArrowRight size={14} />
              </Link>
            }
          >
            {alerts.length ? (
              <ul className="divide-y divide-line">
                {alerts.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 py-2.5">
                    <ShieldAlert size={16} className="shrink-0 text-warn" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{a.holder}</div>
                      <div className="font-mono text-[11.5px] text-fg-3">
                        {a.code} · {tracks.filter((t) => t.authorizationId === a.id).length} track(s)
                      </div>
                    </div>
                    <AuthStatusBadge status={authStatus(a, now)} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-fg-3">{auths.length ? "All authorizations are active." : "No authorizations recorded yet — one is created with each import."}</p>
            )}
          </Card>
          <Card
            title="Recent activity"
            description="Every action with operator and IP"
            actions={
              <Link href="/audit" className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-fg-2 hover:text-fg">
                Audit log <ArrowRight size={14} />
              </Link>
            }
          >
            <ul className="space-y-2.5">
              {!audit.length && <li className="text-[13px] text-fg-3">No activity yet.</li>}
              {audit.slice(0, 6).map((e) => (
                <li key={e.id} className="flex gap-3">
                  <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", e.severity === "error" ? "bg-st-failed" : e.severity === "warning" ? "bg-warn" : "bg-fg-3")} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px]">{e.message}</div>
                    <div className="font-mono text-[11px] text-fg-3">
                      {e.action} · {fmtRelative(e.at, now)} · {e.ip}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <Card title="Quick actions" description="Every import records provenance and an authorization before it is stored">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              { href: "/ingest/url", icon: <Link2 size={18} />, t: "Ingest from URL", d: "yt-dlp, spotDL or FreyrJS on this PC" },
              { href: "/ingest", icon: <FileUp size={18} />, t: "Import from disk", d: "Real decode, codec, duration and SHA-256 checks" },
              { href: "/library", icon: <Library size={18} />, t: "Library", d: "Validated tracks with provenance" },
              { href: "/playlists", icon: <ListMusic size={18} />, t: "Playlists", d: "Only ready, usable tracks" },
              { href: "/queue", icon: queuePaused ? <Play size={18} /> : <Activity size={18} />, t: queuePaused ? "Resume queue" : "Queue monitor", d: "Pause, cancel or retry (bounded)" },
            ].map((a) => (
              <Link key={a.href + a.t} href={a.href} className="group flex items-start gap-3 rounded-xl border border-line bg-surface-1/50 p-4 transition-colors hover:border-white/15 hover:bg-surface-3/50">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-fg group-hover:bg-accent group-hover:text-accent-ink">{a.icon}</span>
                <span>
                  <span className="block text-[13.5px] font-semibold">{a.t}</span>
                  <span className="mt-0.5 block text-[12px] text-fg-3">{a.d}</span>
                </span>
              </Link>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
            <Ban size={13} /> Out of pilot scope: account cookies, paid content, DRM, circumvention, automatic purchases and whole-playlist downloads.
            <span className="hidden sm:inline">· Total library time {fmtDuration(tracks.reduce((a, t) => a + t.durationSec, 0))}</span>
          </div>
        </Card>
      </Body>
      <JobDrawer jobId={openJob} onClose={() => setOpenJob(null)} />
      <TrackDrawer trackId={openTrack} onClose={() => setOpenTrack(null)} />
    </>
  );
}
