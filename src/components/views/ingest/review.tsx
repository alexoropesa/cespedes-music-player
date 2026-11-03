"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, SearchCheck, X } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { toast } from "@/lib/toast";
import { ENGINE_INFO, PROVIDER_LABEL } from "@/lib/catalog";
import type { ReviewItem } from "@/lib/types";
import { cx, fmtDuration, fmtRelative } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { Pill, StatusBadge } from "@/components/ui/badges";
import { Chip } from "@/components/ui/form";
import { Body, Cover, EmptyState } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/overlay";
import { jobNote } from "@/components/jobs";

type Filter = "needs-review" | "accepted" | "rejected" | "all";

export function ReviewView() {
  const reviews = useStore((s) => s.reviews);
  const jobs = useStore((s) => s.jobs);
  const tol = useStore((s) => s.settings.durationToleranceSec);
  const now = useNow();
  const [filter, setFilter] = useState<Filter>("needs-review");
  const [rejecting, setRejecting] = useState<ReviewItem | null>(null);
  const list = reviews.filter((r) => filter === "all" || r.status === filter).sort((a, b) => b.createdAt - a.createdAt);
  const count = (f: Filter) => reviews.filter((r) => f === "all" || r.status === f).length;

  return (
    <Body>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["needs-review", "accepted", "rejected", "all"] as Filter[]).map((f) => (
          <Chip key={f} active={filter === f} onClick={() => setFilter(f)} count={count(f)}>
            {f === "needs-review" ? "Needs review" : f[0].toUpperCase() + f.slice(1)}
          </Chip>
        ))}
        <span className="ml-auto text-[12.5px] text-fg-3">Tolerance ±{tol} s (TBD-10) · requested vs obtained, side by side</span>
      </div>

      {!list.length ? (
        <EmptyState icon={<SearchCheck size={22} />} title={filter === "needs-review" ? "Nothing waiting for review" : "No items"} description="Doubtful matches (different duration, live version, cover, edit or lyric upload) land here after validation and stay out of the library until you decide." />
      ) : (
        <div className="space-y-4">
          {list.map((r) => {
            const job = jobs.find((j) => j.id === r.jobId);
            const c = r.candidate;
            const delta = c.durationSec - r.requested.durationSec;
            const rows: { k: string; req: React.ReactNode; got: React.ReactNode; bad?: boolean }[] = [
              { k: "Title", req: r.requested.title, got: c.title, bad: !c.title.toLowerCase().includes(r.requested.title.toLowerCase()) || /live|cover|remix|lyrics/i.test(c.title) },
              { k: "Artist / channel", req: r.requested.artist, got: <>{c.channel} <span className="text-fg-3">(channel)</span></>, bad: !c.channel.toLowerCase().startsWith(r.requested.artist.toLowerCase()) },
              { k: "Duration", req: fmtDuration(r.requested.durationSec), got: <>{fmtDuration(c.durationSec)} <span className="font-mono">({delta > 0 ? "+" : ""}{delta}s)</span></>, bad: Math.abs(delta) > tol },
              {
                k: "Origin",
                req: c.reference ? `${PROVIDER_LABEL[c.reference.provider]} reference` : "Text query",
                got: (
                  <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-accent">
                    {PROVIDER_LABEL[c.provider]} <ExternalLink size={11} />
                  </a>
                ),
              },
            ];
            return (
              <article key={r.id} className={cx("overflow-hidden rounded-[14px] border bg-surface-2/60", r.status === "needs-review" ? "border-warn/25" : "border-line")}>
                <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3.5">
                  <Cover seed={c.coverSeed} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-bold">{r.requested.title} <span className="font-normal text-fg-2">— {r.requested.artist}</span></div>
                    <div className="text-[12px] text-fg-3">
                      {ENGINE_INFO[c.engine].name} match · flagged {fmtRelative(r.createdAt, now)}
                      {job && (
                        <>
                          {" · "}
                          <Link href={`/queue?job=${job.id}`} className="font-mono hover:text-fg">
                            {job.code}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  {job && <StatusBadge status={job.status} note={jobNote(job)} size="sm" />}
                  {r.status !== "needs-review" && <Pill tone={r.status === "accepted" ? "success" : "danger"}>{r.status === "accepted" ? "Accepted" : "Rejected"}</Pill>}
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead>
                      <tr className="text-left text-[11.5px] text-fg-3">
                        <th className="w-40 px-5 py-2 font-semibold"></th>
                        <th className="px-5 py-2 font-semibold">Requested</th>
                        <th className="px-5 py-2 font-semibold">Obtained file</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.k} className="border-t border-line">
                          <td className="px-5 py-2.5 text-fg-3">{row.k}</td>
                          <td className="px-5 py-2.5">{row.req}</td>
                          <td className={cx("px-5 py-2.5", row.bad && "text-warn")}>{row.got}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <footer className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
                  <div className="flex flex-1 flex-wrap gap-1">
                    {r.reasons.map((x) => (
                      <Pill key={x} tone="warning">
                        {x}
                      </Pill>
                    ))}
                  </div>
                  {r.status === "needs-review" ? (
                    <>
                      <span className="mr-1 text-[12px] text-fg-3">Preview plays only once Ready</span>
                      <Button size="sm" variant="danger" icon={<X size={14} />} onClick={() => setRejecting(r)}>
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        variant="primary"
                        icon={<Check size={14} />}
                        onClick={() => {
                          actions.decideReview(r.id, "accepted");
                          toast({ tone: "success", title: "Match accepted", description: job ? `${job.code} continues to Ready with this exact version.` : "Recorded." });
                        }}
                      >
                        Accept this version
                      </Button>
                    </>
                  ) : (
                    <span className="text-[12px] text-fg-3">
                      {r.status === "accepted" ? "Accepted" : "Rejected"} by {r.decidedBy} · {fmtRelative(r.decidedAt, now)}
                    </span>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
      <ConfirmDialog
        open={!!rejecting}
        onClose={() => setRejecting(null)}
        title="Reject this match?"
        description="The downloaded file is discarded from staging and the job ends as failed (Match rejected). No other version is substituted — search again if you want a different source."
        confirmLabel="Reject match"
        onConfirm={() => {
          if (rejecting) {
            actions.decideReview(rejecting.id, "rejected");
            toast({ title: "Match rejected", description: "Nothing was added to the library." });
          }
        }}
      />
    </Body>
  );
}
