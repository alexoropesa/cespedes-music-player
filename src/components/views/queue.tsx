"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Inbox, Search, ShieldCheck, Lock, Timer, HardDrive, Cpu, RotateCcw, FolderLock } from "lucide-react";
import { isAwaitingReview, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { ENGINE_INFO } from "@/lib/catalog";
import type { IngestJob, JobStatus } from "@/lib/types";
import { JOB_STATUSES } from "@/lib/types";
import { cx, fmtBytes, fmtDuration, fmtMs, fmtRelative } from "@/lib/util";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge, STATUS_COLOR, Pill } from "@/components/ui/badges";
import { Input, Select } from "@/components/ui/form";
import { Body, Card, Cover, EmptyState, KV, Notice, ProgressBar, Stat, TD, TH, TR, Table } from "@/components/ui/layout";
import { CheckIcon, JobDrawer, JobRowMenu, JobStepper, jobNote, toolLabel } from "@/components/jobs";

type StatusFilter = "all" | JobStatus;

export function QueueView() {
  const jobs = useStore((s) => s.jobs);
  const artists = useStore((s) => s.artists);
  const paused = useStore((s) => s.queuePaused);
  const now = useNow();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState("");
  const [tool, setTool] = useState("all");
  const status = (params.get("status") as StatusFilter) || "all";
  const openJob = params.get("job");

  const setParam = (k: string, v: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (v) sp.set(k, v);
    else sp.delete(k);
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const active = jobs.find((j) => (j.status === "downloading" || j.status === "validating") && !isAwaitingReview(j));
  const ql = q.trim().toLowerCase();
  const rows = jobs
    .filter((j) => status === "all" || j.status === status)
    .filter((j) => tool === "all" || j.tool === tool)
    .filter((j) => !ql || `${j.code} ${j.identity.title} ${j.source.url} ${j.source.channel}`.toLowerCase().includes(ql))
    .sort((a, b) => {
      const rank = (j: IngestJob) => (j.status === "downloading" || (j.status === "validating" && !isAwaitingReview(j)) ? 0 : j.status === "pending" ? 1 : isAwaitingReview(j) ? 2 : 3);
      return rank(a) - rank(b) || (rank(a) === 1 ? a.createdAt - b.createdAt : (b.finishedAt ?? b.createdAt) - (a.finishedAt ?? a.createdAt));
    });

  return (
    <Body>
      {paused && <Notice tone="warning" className="mb-5" title="Queue paused">No new jobs will start. The current job (if any) finishes normally.</Notice>}

      {active && (
        <button type="button" onClick={() => setParam("job", active.id)} className="mb-6 block w-full rounded-[14px] border border-line bg-surface-2/70 p-5 text-left transition-colors hover:border-white/15">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-3">Active job</span>
              <StatusBadge status={active.status} note={jobNote(active)} />
            </div>
            <span className="font-mono text-[12px] text-fg-3">
              /tmp/staging/{active.id} · attempt {active.retries + 1}/{active.maxRetries + 1}
            </span>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-center">
            <div className="flex min-w-0 items-center gap-4">
              <Cover seed={active.source.coverSeed} size={52} rounded="rounded-lg" />
              <div className="min-w-0">
                <div className="truncate text-[15px] font-bold">
                  <span className="mr-2 font-mono text-[12.5px] text-fg-3">{active.code}</span>
                  {active.identity.title}
                </div>
                <div className="truncate text-[12.5px] text-fg-2">
                  {active.source.platform} · {toolLabel(active)}
                </div>
              </div>
            </div>
            <div>
              <JobStepper job={active} />
              {active.status === "downloading" ? (
                <ProgressBar className="mt-3" value={active.progress} color={STATUS_COLOR.downloading} />
              ) : (
                <div className="mt-3 flex flex-wrap gap-3 text-[12px] text-fg-2">
                  {active.checks.map((c) => (
                    <span key={c.key} className="inline-flex items-center gap-1.5">
                      <CheckIcon status={c.status} /> {c.key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </button>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Filter by state" className="flex flex-wrap gap-1.5">
          {(["all", ...JOB_STATUSES] as StatusFilter[]).map((s) => {
            const n = s === "all" ? jobs.length : jobs.filter((j) => j.status === s).length;
            return (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={status === s}
                onClick={() => setParam("status", s === "all" ? null : s)}
                className={cx(
                  "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[12.5px] font-semibold transition-colors",
                  status === s ? "border-white/25 bg-white/[0.1] text-fg" : "border-line text-fg-2 hover:border-white/15 hover:text-fg",
                )}
              >
                {s !== "all" && <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[s] }} />}
                <span className="capitalize">{s}</span>
                <span className="tabular-nums text-fg-3">{n}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <Select value={tool} onChange={(e) => setTool(e.target.value)} className="w-40" aria-label="Engine filter">
            <option value="all">All engines</option>
            <option value="yt-dlp">yt-dlp</option>
            <option value="spotdl">spotDL</option>
            <option value="freyrjs">FreyrJS</option>
            <option value="local-import">Local import</option>
          </Select>
          <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job, title or URL" className="flex-1 sm:w-64" aria-label="Search jobs" />
        </div>
      </div>

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <TH>Job</TH>
              <TH>Track · source</TH>
              <TH>State</TH>
              <TH className="w-[200px]">Progress</TH>
              <TH>Engine</TH>
              <TH align="center">Retries</TH>
              <TH align="right">Updated</TH>
              <TH className="w-12" />
            </tr>
          </thead>
          <tbody>
            {rows.map((j) => {
              const artist = artists.find((a) => a.id === j.identity.artistId);
              const fmt = j.source.formats.find((f) => f.id === j.formatId);
              return (
                <TR key={j.id} onClick={() => setParam("job", j.id)} selected={openJob === j.id}>
                  <TD className="whitespace-nowrap">
                    <div className="font-mono text-[12.5px] font-semibold">{j.code}</div>
                    <div className="text-[11.5px] text-fg-3">{fmtRelative(j.createdAt, now)}</div>
                  </TD>
                  <TD className="max-w-[320px]">
                    <div className="flex items-center gap-3">
                      <Cover seed={j.source.coverSeed} size={36} />
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{j.identity.title}</div>
                        <div className="truncate text-[12px] text-fg-3">
                          {artist?.name} · {j.source.platform}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD>
                    <StatusBadge status={j.status} note={jobNote(j)} />
                    {j.status === "failed" && j.failure && <div className="mt-1 max-w-[220px] truncate text-[11.5px] text-st-failed/80" title={j.failure.message}>{j.failure.code}</div>}
                  </TD>
                  <TD>
                    {j.status === "downloading" ? (
                      <div>
                        <ProgressBar value={j.progress} color={STATUS_COLOR.downloading} />
                        <div className="mt-1 font-mono text-[11px] text-fg-3">
                          {fmtBytes((fmt?.sizeBytes ?? 0) * j.progress)} / {fmtBytes(fmt?.sizeBytes)}
                        </div>
                      </div>
                    ) : j.status === "validating" ? (
                      <div className="flex gap-1.5">
                        {j.checks.map((c) => (
                          <span key={c.key} title={`${c.key}: ${c.status}`}>
                            <CheckIcon status={c.status} />
                          </span>
                        ))}
                      </div>
                    ) : j.status === "pending" ? (
                      <span className="text-[12px] text-fg-3">{j.paused ? `Paused at ${Math.round(j.progress * 100)}%` : "Waiting for worker"}</span>
                    ) : j.status === "ready" ? (
                      <span className="font-mono text-[12px] text-fg-2">{fmtMs((j.metrics.downloadMs ?? 0) + (j.metrics.processMs ?? 0))} total</span>
                    ) : (
                      <span className="text-[12px] text-fg-3">{Math.round(j.progress * 100)}% before failure</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-[12.5px] text-fg-2">{j.tool === "local-import" ? "Local import" : ENGINE_INFO[j.tool].name}</TD>
                  <TD align="center" className="font-mono text-[12.5px] tabular-nums text-fg-2">
                    {j.retries}/{j.maxRetries}
                  </TD>
                  <TD align="right" className="whitespace-nowrap text-[12px] text-fg-3">
                    {fmtRelative(j.finishedAt ?? j.startedAt ?? j.createdAt, now)}
                  </TD>
                  <TD>
                    <div onClick={(e) => e.stopPropagation()}>
                      <JobRowMenu job={j} />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<Inbox size={22} />} title="No jobs match" description="Change the state filter or search, or import a track." action={<ButtonLink href="/ingest" variant="primary">Import track</ButtonLink>} />
      )}
      <JobDrawer jobId={openJob} onClose={() => setParam("job", null)} />
    </Body>
  );
}

/* ------------------------------------------------------------------ */

export function WorkerView() {
  const jobs = useStore((s) => s.jobs);
  const tracks = useStore((s) => s.tracks);
  const settings = useStore((s) => s.settings);
  const paused = useStore((s) => s.queuePaused);
  const now = useNow();
  const active = jobs.find((j) => (j.status === "downloading" || j.status === "validating") && !isAwaitingReview(j));
  const measured = jobs.filter((j) => j.metrics.downloadMs != null).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  const avg = (k: keyof IngestJob["metrics"]) => {
    const v = measured.map((j) => j.metrics[k]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const failures = jobs.filter((j) => j.status === "failed" && j.failure);
  const byTool = Object.entries(
    failures.reduce<Record<string, { tool: string; code: string; n: number; last: number }>>((acc, j) => {
      const k = `${j.failure!.tool}·${j.failure!.code}`;
      acc[k] = acc[k] ? { ...acc[k], n: acc[k].n + 1, last: Math.max(acc[k].last, j.failure!.at) } : { tool: `${j.failure!.tool} ${j.failure!.version}`, code: j.failure!.code, n: 1, last: j.failure!.at };
      return acc;
    }, {}),
  ).sort((a, b) => b[1].n - a[1].n);

  return (
    <Body className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Worker" value={paused ? "Paused" : active ? "Running" : "Idle"} hint={active ? `${active.code} · ${active.status}` : "Concurrency 1"} icon={<Cpu size={16} />} />
        <Stat label="Avg staging" value={fmtMs(avg("downloadMs"))} hint={`${measured.length} measured jobs`} icon={<Timer size={16} />} />
        <Stat label="Avg validation" value={fmtMs(avg("processMs"))} hint="Decode, codec, hash, duplicates" icon={<Timer size={16} />} />
        <Stat label="Avg disk / job" value={avg("diskMB") != null ? `${avg("diskMB")!.toFixed(1)} MB` : "—"} hint="Original bytes stored" icon={<HardDrive size={16} />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Isolated sandbox" description="Where downloads happen before anything reaches the library">
          <KV
            items={[
              { k: "Staging", v: "IndexedDB · one staged blob per job", mono: true },
              { k: "Library", v: "IndexedDB · original bytes as received", mono: true },
              { k: "Concurrency", v: <span className="inline-flex items-center gap-2">1 job at a time <Pill icon={<Lock size={10} />}>Pilot rule</Pill></span> },
              { k: "Writes", v: "Only the job's staged blob until it validates" },
              { k: "Execution", v: "Imported files are never executed — only decoded as audio" },
              { k: "Accounts", v: "No cookies, personal sessions or paid content" },
              { k: "Publish rule", v: "Only complete, validated files leave staging" },
            ]}
          />
        </Card>
        <Card title="Reliability guarantees" description="Lessons from the previous system, turned into rules">
          <ul className="space-y-3 text-[13px]">
            {[
              [<FolderLock key="a" size={16} />, "Persistent job state", "After a restart no job is left in downloading or validating — it is re-queued and the partial file discarded."],
              [<ShieldCheck key="b" size={16} />, "Explicit acceptance", "Creating a job returns its ID and state, or an error — never an ambiguous result."],
              [<RotateCcw key="c" size={16} />, "Bounded retries", `Up to ${settings.maxRetries} retries; transient errors ${settings.autoRetryTransient ? "retry automatically with backoff" : "need a manual retry"}. Never unlimited.`],
              [<HardDrive key="d" size={16} />, "Originals retained", "Originals are never deleted after creating derivatives; the published file is the real validated one."],
            ].map(([icon, t, d]) => (
              <li key={t as string} className="flex gap-3">
                <span className="mt-0.5 text-fg-2">{icon}</span>
                <span>
                  <span className="block font-semibold">{t}</span>
                  <span className="text-fg-3">{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card title="Failures by tool and cause" description="Detects breakage when a provider changes (RNF-MAN-02)" padded={false}>
        {byTool.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] text-fg-3">
                  <th className="px-5 py-2 font-semibold">Tool · version</th>
                  <th className="px-5 py-2 font-semibold">Cause</th>
                  <th className="px-5 py-2 text-right font-semibold">Count</th>
                  <th className="px-5 py-2 text-right font-semibold">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {byTool.map(([k, v]) => (
                  <tr key={k} className="border-t border-line">
                    <td className="px-5 py-2.5 font-mono text-[12px]">{v.tool}</td>
                    <td className="px-5 py-2.5">
                      <Pill tone="danger">{v.code}</Pill>
                    </td>
                    <td className="px-5 py-2.5 text-right font-mono tabular-nums">{v.n}</td>
                    <td className="px-5 py-2.5 text-right text-fg-3">{fmtRelative(v.last, now)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-5 pb-5 text-[13px] text-fg-3">No failures recorded.</p>
        )}
      </Card>

      <Card title="Per-job measurements" description="Staging time, validation time and disk used, measured on this device (RNF-REN-01)" padded={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] text-fg-3">
                <th className="px-5 py-2 font-semibold">Job</th>
                <th className="px-5 py-2 font-semibold">Track</th>
                <th className="px-5 py-2 text-right font-semibold">Staging</th>
                <th className="px-5 py-2 text-right font-semibold">Validation</th>
                <th className="px-5 py-2 text-right font-semibold">Disk</th>
              </tr>
            </thead>
            <tbody>
              {measured.slice(0, 12).map((j) => (
                <tr key={j.id} className="border-t border-line">
                  <td className="px-5 py-2.5 font-mono text-[12px]">{j.code}</td>
                  <td className="max-w-[240px] truncate px-5 py-2.5">{j.identity.title}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtMs(j.metrics.downloadMs)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{fmtMs(j.metrics.processMs)}</td>
                  <td className="px-5 py-2.5 text-right font-mono tabular-nums">{j.metrics.diskMB != null ? `${j.metrics.diskMB} MB` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-line px-5 py-3 text-[12px] text-fg-3">Performance thresholds are agreed with the client from these measurements (TBD-11). Total library time: {fmtDuration(tracks.reduce((a, t) => a + t.durationSec, 0))}.</div>
      </Card>
    </Body>
  );
}
