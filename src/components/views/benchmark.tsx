"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ban, Check, CircleSlash, Download, FlaskConical, Pencil, Play, Plus, Trash, TriangleAlert, X } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { toast } from "@/lib/toast";
import { ENGINE_INFO } from "@/lib/catalog";
import { codecLabel } from "@/lib/seed";
import type { BenchResult, BenchRun, BenchSample, EngineId, MatchOutcome } from "@/lib/types";
import { ENGINES } from "@/lib/types";
import { cx, downloadText, fmtDate, fmtDateTime, fmtDuration, fmtMs, fmtPct, fmtRelative } from "@/lib/util";
import { Button, ButtonLink, IconButton } from "@/components/ui/button";
import { Pill, TierBadge } from "@/components/ui/badges";
import { Checkbox, Field, Input, Segmented, Select } from "@/components/ui/form";
import { Body, Card, EmptyState, KV, Notice, ProgressBar, TD, TH, TR, Table } from "@/components/ui/layout";
import { ConfirmDialog, Drawer, Modal } from "@/components/ui/overlay";
import { benchSummary } from "./overview";

export const ENGINE_COLOR: Record<EngineId, string> = { "yt-dlp": "#e4e4e7", spotdl: "#b19cff", freyrjs: "#2dd4bf" };

const OUTCOME: Record<MatchOutcome, { label: string; cls: string; icon: React.ReactNode }> = {
  exact: { label: "Exact", cls: "text-st-ready", icon: <Check size={13} strokeWidth={3} /> },
  doubtful: { label: "Doubtful", cls: "text-warn", icon: <TriangleAlert size={13} /> },
  wrong: { label: "Wrong version", cls: "text-st-failed", icon: <X size={13} strokeWidth={3} /> },
  none: { label: "No result", cls: "text-fg-3", icon: <CircleSlash size={13} /> },
};

function RunBenchmarkModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const samples = useStore((s) => s.samples);
  const settings = useStore((s) => s.settings);
  const [engines, setEngines] = useState<EngineId[]>(ENGINES);
  const [picked, setPicked] = useState<string[] | null>(null);
  const sel = picked ?? samples.map((s) => s.id);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Run benchmark"
      description="Each sample is searched by text in parallel across the selected engines, then matched and downloaded in the sandbox."
      icon={<FlaskConical size={18} />}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Play size={14} />}
            disabled={!engines.length || !sel.length}
            onClick={() => {
              actions.startBenchRun(engines, sel);
              toast({ title: "Benchmark started", description: `${sel.length} samples × ${engines.length} engines` });
              onClose();
            }}
          >
            Start run
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div>
          <div className="mb-2 text-[12.5px] font-semibold">Engines (pinned versions)</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {ENGINES.map((e) => (
              <div key={e} className="rounded-xl border border-line bg-surface-1/50 p-3">
                <Checkbox checked={engines.includes(e)} disabled={!settings.engines[e].enabled} onChange={(on) => setEngines(on ? [...engines, e] : engines.filter((x) => x !== e))} label={ENGINE_INFO[e].name} description={`v${settings.engines[e].version}`} />
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[12.5px] font-semibold">Samples ({sel.length}/{samples.length})</span>
            <button type="button" className="text-[12px] font-semibold text-fg-2 hover:text-fg" onClick={() => setPicked(sel.length === samples.length ? [] : samples.map((s) => s.id))}>
              {sel.length === samples.length ? "Clear" : "Select all"}
            </button>
          </div>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line">
            {samples.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <Checkbox checked={sel.includes(s.id)} onChange={(on) => setPicked(on ? [...sel, s.id] : sel.filter((x) => x !== s.id))} label={s.query} description={`${s.expected.title} — ${s.expected.artist} · ${fmtDuration(s.expected.durationSec)}`} />
                <TierBadge tier={s.tier} />
              </li>
            ))}
          </ul>
        </div>
        <Notice>Use only authorized samples (own content or with permission). The same set is used for every engine so results are comparable.</Notice>
      </div>
    </Modal>
  );
}

export function BenchmarkView() {
  const runs = useStore((s) => s.benchRuns);
  const samples = useStore((s) => s.samples);
  const now = useNow();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [runModal, setRunModal] = useState(false);
  const [cell, setCell] = useState<{ r: BenchResult; s: BenchSample } | null>(null);
  const [tierView, setTierView] = useState<"all" | "established" | "independent">("all");

  const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
  const running = sorted.find((r) => r.status === "running");
  const runId = params.get("run");
  const run = sorted.find((r) => r.id === runId) ?? sorted.find((r) => r.status === "completed");
  const tierOf = (sid: string) => samples.find((s) => s.id === sid)?.tier;
  const results = run ? run.results.filter((r) => tierView === "all" || tierOf(r.sampleId) === tierView) : [];
  const sums = Object.fromEntries((run?.engines ?? ENGINES).map((e) => [e, benchSummary(results, e)])) as Record<EngineId, ReturnType<typeof benchSummary>>;
  const engs = run?.engines ?? ENGINES;
  const best = (k: "successRate" | "accuracy" | "avgResponse", low = false) => {
    const vals = engs.map((e) => sums[e][k]);
    const target = low ? Math.min(...vals.filter((v) => v > 0)) : Math.max(...vals);
    const winners = engs.filter((e) => sums[e][k] === target);
    return winners.length < engs.length ? winners : [];
  };
  const dl = (e: EngineId) => {
    const v = results.filter((x) => x.engine === e && x.downloadMs != null).map((x) => x.downloadMs!);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
  };

  return (
    <Body className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Select value={run?.id ?? ""} onChange={(e) => router.replace(`${pathname}?run=${e.target.value}`, { scroll: false })} className="w-64" aria-label="Benchmark run">
          {sorted.map((r) => (
            <option key={r.id} value={r.id} disabled={r.status !== "completed"}>
              {r.code} · {fmtDate(r.startedAt)}{r.status !== "completed" ? ` · ${r.status}` : ""}
            </option>
          ))}
        </Select>
        <Segmented
          size="sm"
          label="Repertoire"
          value={tierView}
          onChange={setTierView}
          options={[
            { value: "all", label: "All samples" },
            { value: "established", label: "Established" },
            { value: "independent", label: "Independent" },
          ]}
        />
        <div className="ml-auto flex gap-2">
          <Button variant="primary" icon={<Play size={14} />} onClick={() => setRunModal(true)} disabled={!!running}>
            Run benchmark
          </Button>
        </div>
      </div>

      {running && (
        <Card>
          <div className="flex flex-wrap items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[14px] font-bold">{running.code} running</div>
              <div className="text-[12.5px] text-fg-3">
                {running.results.length / running.engines.length} of {running.sampleIds.length} samples · started {fmtRelative(running.startedAt, now)}
              </div>
              <ProgressBar className="mt-3" value={running.results.length / (running.sampleIds.length * running.engines.length)} />
            </div>
            <Button size="sm" variant="danger" icon={<Ban size={14} />} onClick={() => actions.cancelBenchRun(running.id)}>
              Cancel run
            </Button>
          </div>
        </Card>
      )}

      <Notice tone="warning" title="Not redundant sources">
        All three engines end up fetching audio from YouTube / YouTube Music. Two tools that depend on the same source don&apos;t count as redundancy (RNF-MAN-03). spotDL and FreyrJS only resolve tracks that exist in streaming catalogs.
      </Notice>

      {!run ? (
        <EmptyState icon={<FlaskConical size={22} />} title="No completed run" description="Start a run with the authorized sample set." action={<Button variant="primary" onClick={() => setRunModal(true)}>Run benchmark</Button>} />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            {engs.map((e) => {
              const s = sums[e];
              const reenc = results.filter((x) => x.engine === e && x.reencoded && x.success).length;
              return (
                <section key={e} className="rounded-[14px] border border-line bg-surface-2/70 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ background: ENGINE_COLOR[e] }} />
                        <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">{ENGINE_INFO[e].name}</h3>
                      </div>
                      <div className="mt-0.5 font-mono text-[11.5px] text-fg-3">
                        v{run.versions[e]} · {ENGINE_INFO[e].license}
                      </div>
                    </div>
                    {best("successRate").includes(e) && <Pill tone="success">Best success</Pill>}
                  </div>
                  <p className="mt-3 text-[12.5px] leading-relaxed text-fg-2">{ENGINE_INFO[e].notes}</p>
                  <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                    {[
                      ["Download success", fmtPct(s.successRate), best("successRate").includes(e)],
                      ["Metadata accuracy", fmtPct(s.accuracy), best("accuracy").includes(e)],
                      ["Avg response", fmtMs(s.avgResponse), best("avgResponse", true).includes(e)],
                      ["Avg download", fmtMs(dl(e)), false],
                      ["Exact matches", `${s.exact}/${s.n}`, false],
                      ["Doubtful / wrong", `${s.doubtful}`, false],
                    ].map(([k, v, b]) => (
                      <div key={k as string}>
                        <dt className="text-[11.5px] text-fg-3">{k}</dt>
                        <dd className={cx("mt-0.5 font-mono text-[17px] font-semibold tabular-nums", b && "text-st-ready")}>{v}</dd>
                      </div>
                    ))}
                  </dl>
                  {reenc > 0 && (
                    <div className="mt-4 flex items-start gap-2 rounded-lg bg-warn/[0.07] px-3 py-2 text-[12px] text-warn">
                      <TriangleAlert size={14} className="mt-px shrink-0" /> {reenc} output(s) re-encoded by the engine — not source quality.
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <Card title="Side by side" description={`${run.code} · ${tierView === "all" ? "all samples" : `${tierView} samples only`}`}>
            <div className="space-y-5">
              {[
                { k: "Download success rate", v: (e: EngineId) => sums[e].successRate, f: (x: number) => fmtPct(x), max: 1 },
                { k: "Metadata accuracy", v: (e: EngineId) => sums[e].accuracy, f: (x: number) => fmtPct(x), max: 1 },
                { k: "Average response time (lower is better)", v: (e: EngineId) => sums[e].avgResponse, f: (x: number) => fmtMs(x), max: Math.max(...engs.map((e) => sums[e].avgResponse), 1) },
              ].map((m) => (
                <div key={m.k}>
                  <div className="mb-2 text-[12.5px] font-semibold text-fg-2">{m.k}</div>
                  <div className="space-y-1.5">
                    {engs.map((e) => (
                      <div key={e} className="grid grid-cols-[80px_1fr_72px] items-center gap-3">
                        <span className="text-[12.5px] text-fg-2">{ENGINE_INFO[e].name}</span>
                        <div className="h-3 overflow-hidden rounded-full bg-white/[0.05]">
                          <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${(m.v(e) / m.max) * 100}%`, background: ENGINE_COLOR[e] }} />
                        </div>
                        <span className="text-right font-mono text-[12px] tabular-nums">{m.f(m.v(e))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <section>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[18px] font-extrabold tracking-[-0.02em]">Results per sample</h2>
              <span className="text-[12.5px] text-fg-3">Click a cell for the requested vs matched detail</span>
            </div>
            <Table>
              <thead>
                <tr>
                  <TH>Sample</TH>
                  {engs.map((e) => (
                    <TH key={e}>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="size-2 rounded-full" style={{ background: ENGINE_COLOR[e] }} />
                        {ENGINE_INFO[e].name}
                      </span>
                    </TH>
                  ))}
                </tr>
              </thead>
              <tbody>
                {run.sampleIds
                  .map((sid) => samples.find((s) => s.id === sid))
                  .filter((s): s is BenchSample => !!s && (tierView === "all" || s.tier === tierView))
                  .map((s) => (
                    <TR key={s.id}>
                      <TD className="min-w-[220px]">
                        <div className="font-semibold">{s.expected.title}</div>
                        <div className="mt-0.5 flex items-center gap-2 text-[12px] text-fg-3">
                          {s.expected.artist} · {fmtDuration(s.expected.durationSec)} <TierBadge tier={s.tier} />
                        </div>
                      </TD>
                      {engs.map((e) => {
                        const r = run.results.find((x) => x.sampleId === s.id && x.engine === e);
                        if (!r) return <TD key={e} className="text-fg-3">—</TD>;
                        const o = OUTCOME[r.match];
                        return (
                          <TD key={e}>
                            <button type="button" onClick={() => setCell({ r, s })} className="w-full rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-white/[0.06]">
                              <span className={cx("inline-flex items-center gap-1.5 text-[12.5px] font-semibold", o.cls)}>
                                {o.icon} {o.label}
                              </span>
                              <span className="mt-0.5 block font-mono text-[11px] text-fg-3">
                                {fmtMs(r.responseMs)}
                                {r.codec ? ` · ${codecLabel(r.codec)} ${r.bitrateKbps}k` : ""}
                                {r.success ? ` · meta ${fmtPct(r.metadataAccuracy)}` : ""}
                              </span>
                            </button>
                          </TD>
                        );
                      })}
                    </TR>
                  ))}
              </tbody>
            </Table>
          </section>
        </>
      )}

      <RunBenchmarkModal open={runModal} onClose={() => setRunModal(false)} />
      <Drawer
        open={!!cell}
        onClose={() => setCell(null)}
        title={cell ? `${ENGINE_INFO[cell.r.engine].name} · ${cell.s.expected.title}` : ""}
        subtitle={cell ? <span className={cx("inline-flex items-center gap-1.5 font-semibold", OUTCOME[cell.r.match].cls)}>{OUTCOME[cell.r.match].icon} {OUTCOME[cell.r.match].label}</span> : undefined}
        footer={
          cell && (cell.r.match === "doubtful" || cell.r.match === "wrong") ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                actions.createReview({
                  requested: cell.s.expected,
                  candidate: {
                    id: `bench:${cell.r.engine}:${cell.s.id}`,
                    engine: cell.r.engine,
                    query: cell.s.query,
                    provider: "youtube",
                    title: cell.r.matchedTitle ?? "",
                    channel: cell.r.matchedChannel ?? "",
                    durationSec: cell.r.matchedDurationSec ?? 0,
                    url: "",
                    codec: cell.r.codec ?? "",
                    bitrateKbps: cell.r.bitrateKbps ?? 0,
                    flags: [],
                    confidence: cell.r.metadataAccuracy,
                    coverSeed: cell.s.id,
                    scenario: "ok",
                  },
                  reasons: [OUTCOME[cell.r.match].label, `Benchmark ${run?.code}`],
                });
                toast({ title: "Sent to match review" });
                setCell(null);
              }}
            >
              Send to match review
            </Button>
          ) : undefined
        }
      >
        {cell && (
          <div className="space-y-4 p-5">
            <div className="overflow-hidden rounded-xl border border-line">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11.5px] text-fg-3">
                    <th className="px-4 py-2 font-semibold" />
                    <th className="px-4 py-2 font-semibold">Requested</th>
                    <th className="px-4 py-2 font-semibold">Matched</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t border-line">
                    <td className="px-4 py-2.5 text-fg-3">Title</td>
                    <td className="px-4 py-2.5">{cell.s.expected.title}</td>
                    <td className="px-4 py-2.5">{cell.r.matchedTitle ?? "—"}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="px-4 py-2.5 text-fg-3">Artist / channel</td>
                    <td className="px-4 py-2.5">{cell.s.expected.artist}</td>
                    <td className="px-4 py-2.5">{cell.r.matchedChannel ?? "—"}</td>
                  </tr>
                  <tr className="border-t border-line">
                    <td className="px-4 py-2.5 text-fg-3">Duration</td>
                    <td className="px-4 py-2.5 font-mono">{fmtDuration(cell.s.expected.durationSec)}</td>
                    <td className="px-4 py-2.5 font-mono">{fmtDuration(cell.r.matchedDurationSec)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <KV
              items={[
                { k: "Response time", v: fmtMs(cell.r.responseMs) },
                { k: "Download time", v: fmtMs(cell.r.downloadMs) },
                { k: "Download", v: cell.r.success ? "Succeeded" : "Failed" },
                { k: "Metadata accuracy", v: fmtPct(cell.r.metadataAccuracy) },
                { k: "Delivered codec", v: cell.r.codec ? `${codecLabel(cell.r.codec)} ${cell.r.bitrateKbps} kbps${cell.r.reencoded ? " · re-encoded by engine" : ""}` : "—" },
                { k: "Note", v: cell.r.note ?? "—" },
                { k: "Query", v: cell.s.query, mono: true },
              ]}
            />
          </div>
        )}
      </Drawer>
    </Body>
  );
}

/* ------------------------------------------------------------------ */

function exportRun(run: BenchRun, samples: BenchSample[]) {
  const head = "run,sample,query,tier,engine,version,match,success,response_ms,download_ms,metadata_accuracy,codec,bitrate_kbps,reencoded,note";
  const rows = run.results.map((r) => {
    const s = samples.find((x) => x.id === r.sampleId);
    return [run.code, r.sampleId, `"${s?.query ?? ""}"`, s?.tier ?? "", r.engine, run.versions[r.engine], r.match, r.success, r.responseMs, r.downloadMs ?? "", r.metadataAccuracy, r.codec ?? "", r.bitrateKbps ?? "", !!r.reencoded, `"${r.note ?? ""}"`].join(",");
  });
  downloadText(`${run.code.toLowerCase()}-results.csv`, [head, ...rows].join("\n"), "text/csv");
}

export function RunsView() {
  const runs = useStore((s) => s.benchRuns);
  const samples = useStore((s) => s.samples);
  const now = useNow();
  const [runModal, setRunModal] = useState(false);
  const sorted = [...runs].sort((a, b) => b.startedAt - a.startedAt);
  return (
    <Body>
      <div className="mb-4 flex justify-end">
        <Button variant="primary" icon={<Play size={14} />} onClick={() => setRunModal(true)} disabled={runs.some((r) => r.status === "running")}>
          Run benchmark
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <TH>Run</TH>
            <TH>Started</TH>
            <TH>Scope</TH>
            {ENGINES.map((e) => (
              <TH key={e} align="center">
                {ENGINE_INFO[e].name} success
              </TH>
            ))}
            <TH>Status</TH>
            <TH className="w-48" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <TR key={r.id}>
              <TD className="font-mono text-[12.5px] font-semibold">{r.code}</TD>
              <TD className="whitespace-nowrap text-[12.5px] text-fg-2">
                {fmtDateTime(r.startedAt)}
                <div className="text-[11.5px] text-fg-3">{r.finishedAt ? `took ${fmtMs(r.finishedAt - r.startedAt)}` : fmtRelative(r.startedAt, now)}</div>
              </TD>
              <TD className="text-[12.5px] text-fg-2">
                {r.sampleIds.length} samples × {r.engines.length} engines
              </TD>
              {ENGINES.map((e) => (
                <TD key={e} align="center" className="font-mono text-[12.5px] tabular-nums">
                  {r.engines.includes(e) && r.results.length ? fmtPct(benchSummary(r.results, e).successRate) : "—"}
                </TD>
              ))}
              <TD>
                <Pill tone={r.status === "completed" ? "success" : r.status === "running" ? "info" : "neutral"}>{r.status}</Pill>
              </TD>
              <TD>
                <div className="flex justify-end gap-1.5">
                  {r.status === "running" ? (
                    <Button size="xs" variant="danger" onClick={() => actions.cancelBenchRun(r.id)}>
                      Cancel
                    </Button>
                  ) : (
                    <>
                      <ButtonLink href={`/benchmark?run=${r.id}`} size="xs" variant="secondary">
                        Compare
                      </ButtonLink>
                      <IconButton label="Export CSV" size="sm" disabled={!r.results.length} onClick={() => exportRun(r, samples)}>
                        <Download size={15} />
                      </IconButton>
                    </>
                  )}
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <RunBenchmarkModal open={runModal} onClose={() => setRunModal(false)} />
    </Body>
  );
}

/* ------------------------------------------------------------------ */

const emptySample = { query: "", title: "", artist: "", duration: "", tier: "independent" as BenchSample["tier"], url: "" };

export function SamplesView() {
  const samples = useStore((s) => s.samples);
  const [editing, setEditing] = useState<BenchSample | "new" | null>(null);
  const [form, setForm] = useState(emptySample);
  const [del, setDel] = useState<BenchSample | null>(null);
  const open = (s: BenchSample | "new") => {
    setEditing(s);
    setForm(s === "new" ? emptySample : { query: s.query, title: s.expected.title, artist: s.expected.artist, duration: fmtDuration(s.expected.durationSec), tier: s.tier, url: s.url ?? "" });
  };
  const parseDur = (v: string) => {
    const [m, s] = v.split(":").map(Number);
    return Number.isFinite(m) && Number.isFinite(s) ? m * 60 + s : NaN;
  };
  const valid = form.query.trim() && form.title.trim() && form.artist.trim() && Number.isFinite(parseDur(form.duration));
  return (
    <Body>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Notice className="flex-1">The same authorized sample set feeds every engine. Mix established and independent repertoire so catalog-only engines are measured fairly.</Notice>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => open("new")}>
          Add sample
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <TH>Query</TH>
            <TH>Expected recording</TH>
            <TH>Duration</TH>
            <TH>Repertoire</TH>
            <TH className="w-24" />
          </tr>
        </thead>
        <tbody>
          {samples.map((s) => (
            <TR key={s.id} onClick={() => open(s)}>
              <TD className="font-mono text-[12.5px]">{s.query}</TD>
              <TD>
                <div className="font-semibold">{s.expected.title}</div>
                <div className="text-[12px] text-fg-3">{s.expected.artist}</div>
              </TD>
              <TD className="font-mono text-[12.5px]">{fmtDuration(s.expected.durationSec)}</TD>
              <TD>
                <TierBadge tier={s.tier} />
              </TD>
              <TD>
                <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                  <IconButton label="Edit sample" size="sm" onClick={() => open(s)}>
                    <Pencil size={14} />
                  </IconButton>
                  <IconButton label="Remove sample" size="sm" onClick={() => setDel(s)}>
                    <Trash size={14} />
                  </IconButton>
                </div>
              </TD>
            </TR>
          ))}
        </tbody>
      </Table>
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Add sample" : "Edit sample"}
        description="Describe the exact recording you expect, so matches can be judged."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!valid}
              onClick={() => {
                actions.saveSample({
                  id: editing !== "new" && editing ? editing.id : undefined,
                  query: form.query.trim(),
                  expected: { title: form.title.trim(), artist: form.artist.trim(), durationSec: parseDur(form.duration) },
                  tier: form.tier,
                  url: form.url.trim() || undefined,
                });
                toast({ tone: "success", title: "Sample saved" });
                setEditing(null);
              }}
            >
              Save sample
            </Button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Search query" className="sm:col-span-2">
            <Input value={form.query} onChange={(e) => setForm({ ...form, query: e.target.value })} placeholder="Title + artist, as an operator would type it" />
          </Field>
          <Field label="Expected title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Expected artist">
            <Input value={form.artist} onChange={(e) => setForm({ ...form, artist: e.target.value })} />
          </Field>
          <Field label="Expected duration" hint="m:ss">
            <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="3:39" />
          </Field>
          <Field label="Repertoire">
            <Segmented label="Tier" value={form.tier} onChange={(tier) => setForm({ ...form, tier })} options={[{ value: "established", label: "Established" }, { value: "independent", label: "Independent" }]} />
          </Field>
          <Field label="Authorized URL" optional className="sm:col-span-2">
            <Input value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://…" />
          </Field>
        </div>
      </Modal>
      <ConfirmDialog open={!!del} onClose={() => setDel(null)} title="Remove sample?" description={`“${del?.query}” will no longer be part of new runs. Past results are kept.`} confirmLabel="Remove" onConfirm={() => del && actions.deleteSample(del.id)} />
      <p className="mt-4 text-[12px] text-fg-3">
        Past runs keep their results. <Link href="/benchmark/runs" className="text-fg-2 hover:text-fg">See runs</Link>.
      </p>
    </Body>
  );
}
