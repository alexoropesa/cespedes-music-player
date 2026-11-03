"use client";

import { useState } from "react";
import { Download, RefreshCw, ScrollText, Search } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import type { AuditEvent, Severity } from "@/lib/types";
import { cx, downloadText, fmtDateTime, fmtRelative, initials } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { Chip, Input, Segmented, Select } from "@/components/ui/form";
import { Body, EmptyState, KV, PageHeader, TD, TH, TR, Table } from "@/components/ui/layout";
import { Drawer } from "@/components/ui/overlay";

const SEV_DOT: Record<Severity, string> = { info: "bg-fg-3", warning: "bg-warn", error: "bg-st-failed" };
const RANGES = { "24h": 86_400_000, "7d": 7 * 86_400_000, "30d": 30 * 86_400_000, all: Infinity } as const;

export function AuditView() {
  const audit = useStore((s) => s.audit);
  const now = useNow();
  const [sev, setSev] = useState<"all" | Severity>("all");
  const [cat, setCat] = useState("all");
  const [actor, setActor] = useState("all");
  const [range, setRange] = useState<keyof typeof RANGES>("30d");
  const [q, setQ] = useState("");
  const [limit, setLimit] = useState(60);
  const [open, setOpen] = useState<AuditEvent | null>(null);

  const cats = [...new Set(audit.map((e) => e.action.split(".")[0]))].sort();
  const actors = [...new Set(audit.map((e) => e.actor))];
  const ql = q.trim().toLowerCase();
  const list = audit
    .filter((e) => sev === "all" || e.severity === sev)
    .filter((e) => cat === "all" || e.action.startsWith(cat + "."))
    .filter((e) => actor === "all" || e.actor === actor)
    .filter((e) => range === "all" || now - e.at <= RANGES[range])
    .filter((e) => !ql || `${e.message} ${e.action} ${e.target ?? ""} ${e.ip}`.toLowerCase().includes(ql));

  const exportCsv = () => {
    const head = "timestamp,actor,ip,severity,action,target,message";
    const rows = list.map((e) => [new Date(e.at).toISOString(), e.actor, e.ip, e.severity, e.action, e.target ?? "", `"${e.message.replace(/"/g, '""')}"`].join(","));
    downloadText(`audit-log-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows].join("\n"), "text/csv");
    actions.logEvent("audit.exported", `Exported ${list.length} audit events (CSV)`);
  };

  return (
    <>
      <PageHeader
        eyebrow="Audit log"
        title="Audit log"
        description="Every action, download error and failed attempt, with operator and IP address. Append-only from the interface."
        actions={
          <>
            <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-3">
              <RefreshCw size={12} /> Live
            </span>
            <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv}>
              Export CSV
            </Button>
          </>
        }
      />
      <Body>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(["all", "info", "warning", "error"] as const).map((s) => (
            <Chip key={s} active={sev === s} onClick={() => setSev(s)} count={audit.filter((e) => s === "all" || e.severity === s).length}>
              {s !== "all" && <span className={cx("size-2 rounded-full", SEV_DOT[s])} />}
              {s === "all" ? "All events" : s[0].toUpperCase() + s.slice(1)}
            </Chip>
          ))}
          <Segmented size="sm" label="Date range" value={range} onChange={setRange} options={[{ value: "24h", label: "24 h" }, { value: "7d", label: "7 d" }, { value: "30d", label: "30 d" }, { value: "all", label: "All" }]} className="ml-1" />
        </div>
        <div className="mb-4 flex flex-wrap gap-2">
          <Select value={cat} onChange={(e) => setCat(e.target.value)} className="w-44" aria-label="Event category">
            <option value="all">All categories</option>
            {cats.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
          <Select value={actor} onChange={(e) => setActor(e.target.value)} className="w-60" aria-label="Actor">
            <option value="all">All operators</option>
            {actors.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </Select>
          <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search message, event, target or IP" className="min-w-[220px] flex-1" aria-label="Search audit log" />
        </div>
        {list.length ? (
          <>
            <Table>
              <thead>
                <tr>
                  <TH>Date and time</TH>
                  <TH>Operator</TH>
                  <TH>Event</TH>
                  <TH className="hidden md:table-cell">Target</TH>
                  <TH>IP address</TH>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, limit).map((e) => (
                  <TR key={e.id} onClick={() => setOpen(e)}>
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center gap-2.5">
                        <span className={cx("size-2 shrink-0 rounded-full", SEV_DOT[e.severity])} title={e.severity} />
                        <div>
                          <div className="text-[12.5px]">{fmtDateTime(e.at)}</div>
                          <div className="text-[11.5px] text-fg-3">{fmtRelative(e.at, now)}</div>
                        </div>
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-md bg-accent/20 text-[10px] font-bold text-accent">{initials(e.actor.split("@")[0].replace(/[._]/g, " "))}</span>
                        <span className="text-[12.5px]">{e.actor}</span>
                      </div>
                    </TD>
                    <TD className="max-w-[420px]">
                      <div className="truncate text-[13px]">{e.message}</div>
                      <code className="mt-1 inline-block rounded border border-line bg-surface-1 px-1.5 py-px font-mono text-[11px] text-fg-2">{e.action}</code>
                    </TD>
                    <TD className="hidden font-mono text-[12px] text-fg-2 md:table-cell">{e.target ?? "—"}</TD>
                    <TD className="whitespace-nowrap font-mono text-[12px] text-fg-2">{e.ip}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
            <div className="mt-4 flex items-center justify-between text-[12.5px] text-fg-3">
              <span>
                Showing {Math.min(limit, list.length)} of {list.length}
              </span>
              {limit < list.length && (
                <Button size="sm" variant="secondary" onClick={() => setLimit(limit + 60)}>
                  Load more
                </Button>
              )}
            </div>
          </>
        ) : (
          <EmptyState icon={<ScrollText size={22} />} title="No events match" description="Change the filters or the date range." />
        )}
      </Body>
      <Drawer open={!!open} onClose={() => setOpen(null)} title="Event details" subtitle={open?.action}>
        {open && (
          <div className="space-y-4 p-5">
            <KV
              items={[
                { k: "Timestamp", v: new Date(open.at).toISOString(), mono: true },
                { k: "Operator", v: open.actor },
                { k: "IP address", v: open.ip, mono: true },
                { k: "Severity", v: open.severity },
                { k: "Event", v: open.action, mono: true },
                { k: "Target", v: open.target ?? "—", mono: true },
                { k: "Message", v: open.message },
              ]}
            />
            <div>
              <div className="mb-2 text-[12px] font-semibold text-fg-3">Raw JSON</div>
              <pre className="overflow-x-auto rounded-xl border border-line bg-surface-1 p-4 font-mono text-[11.5px] leading-relaxed text-fg-2">{JSON.stringify(open, null, 2)}</pre>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
