"use client";

import { useState } from "react";
import Link from "next/link";
import { Ban, CircleCheck, Copy, Download, Ellipsis, Pencil, Plus, Search, ShieldCheck } from "lucide-react";
import { actions, authStatus, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { toast } from "@/lib/toast";
import { ENGINE_INFO } from "@/lib/catalog";
import type { AuthBasis, AuthScope, AuthStatus, Authorization } from "@/lib/types";
import { downloadText, fmtDate, fmtDateTime, hostOf, shortHash } from "@/lib/util";
import { Button, IconButton } from "@/components/ui/button";
import { AuthStatusBadge, Pill } from "@/components/ui/badges";
import { Checkbox, Chip, Field, Input, RadioCard, Select, Textarea } from "@/components/ui/form";
import { Body, Cover, EmptyState, Notice, TD, TH, TR, Table } from "@/components/ui/layout";
import { ConfirmDialog, Drawer, Menu } from "@/components/ui/overlay";
import { BASIS_LABEL, SCOPE_LABEL, copyText } from "@/components/tracks";

type F = "all" | AuthStatus;

interface Form {
  basis: AuthBasis;
  holder: string;
  scope: AuthScope[];
  territory: string;
  validFrom: string;
  validUntil: string;
  evidence: string;
  notes: string;
  review: Authorization["review"];
}

const toInput = (t: number | null) => (t ? new Date(t).toISOString().slice(0, 10) : "");
const fromInput = (v: string, end = false) => (v ? new Date(v + (end ? "T23:59:59" : "T00:00:00")).getTime() : null);

function AuthorizationDrawer({ target, onClose }: { target: Authorization | "new" | null; onClose: () => void }) {
  const tracks = useStore((s) => s.tracks);
  const audit = useStore((s) => s.audit);
  const now = useNow();
  const [form, setForm] = useState<Form | null>(null);
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = target === "new" ? "new" : target?.id ?? null;
  if (target && loaded !== key) {
    setLoaded(key);
    setForm(
      target === "new"
        ? { basis: "rights-holder", holder: "", scope: ["copy", "retain"], territory: "ES", validFrom: toInput(now), validUntil: "", evidence: "", notes: "", review: "approved" }
        : { basis: target.basis, holder: target.holder, scope: target.scope, territory: target.territory, validFrom: toInput(target.validFrom), validUntil: toInput(target.validUntil), evidence: target.evidence, notes: target.notes ?? "", review: target.review },
    );
  }
  const close = () => {
    setLoaded(null);
    onClose();
  };
  if (!target || !form) return <Drawer open={false} onClose={close} title="" />;
  const existing = target === "new" ? null : target;
  const linked = existing ? tracks.filter((t) => t.authorizationId === existing.id) : [];
  const history = existing ? audit.filter((e) => e.target === existing.code).slice(0, 12) : [];
  const valid = form.holder.trim() && form.evidence.trim() && form.territory.trim() && form.scope.includes("copy") && form.scope.includes("retain");
  const set = (p: Partial<Form>) => setForm({ ...form, ...p });

  const save = () => {
    const payload = {
      basis: form.basis,
      holder: form.holder.trim(),
      scope: form.scope,
      territory: form.territory.trim(),
      validFrom: fromInput(form.validFrom) ?? now,
      validUntil: fromInput(form.validUntil, true),
      evidence: form.evidence.trim(),
      notes: form.notes.trim() || undefined,
      review: form.review,
    };
    if (existing) actions.updateAuthorization(existing.id, payload);
    else actions.createAuthorization(payload);
    toast({ tone: "success", title: existing ? `${existing.code} updated` : "Authorization recorded" });
    close();
  };

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      title={existing ? `${existing.code} · ${existing.holder}` : "New authorization"}
      subtitle={existing ? <AuthStatusBadge status={authStatus(existing, now)} /> : "Recorded with your user and IP"}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={close}>
            Cancel
          </Button>
          <div className="flex-1" />
          <Button size="md" variant="primary" disabled={!valid} onClick={save}>
            {existing ? "Save changes" : "Record authorization"}
          </Button>
        </>
      }
    >
      <div className="space-y-6 p-5">
        <section>
          <div className="mb-2 text-[12.5px] font-semibold">Basis</div>
          <div role="radiogroup" aria-label="Basis" className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(BASIS_LABEL) as AuthBasis[]).map((b) => (
              <RadioCard key={b} checked={form.basis === b} onChange={() => set({ basis: b })} title={BASIS_LABEL[b]} />
            ))}
          </div>
        </section>
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="Rights holder" className="sm:col-span-2">
            <Input value={form.holder} onChange={(e) => set({ holder: e.target.value })} />
          </Field>
          <Field label="Territory">
            <Input value={form.territory} onChange={(e) => set({ territory: e.target.value })} />
          </Field>
          <Field label="Review state">
            <Select value={form.review} onChange={(e) => set({ review: e.target.value as Form["review"] })}>
              <option value="approved">Approved</option>
              <option value="under-review">Under review</option>
              <option value="revoked">Revoked</option>
            </Select>
          </Field>
          <Field label="Valid from">
            <Input type="date" value={form.validFrom} onChange={(e) => set({ validFrom: e.target.value })} />
          </Field>
          <Field label="Valid until" optional hint="Empty = no expiry">
            <Input type="date" value={form.validUntil} onChange={(e) => set({ validUntil: e.target.value })} />
          </Field>
          <div className="sm:col-span-2">
            <div className="mb-2 text-[12.5px] font-semibold">Scope</div>
            <div className="flex flex-wrap gap-5">
              {(Object.keys(SCOPE_LABEL) as AuthScope[]).map((s) => (
                <Checkbox key={s} checked={form.scope.includes(s)} onChange={(on) => set({ scope: on ? [...form.scope, s] : form.scope.filter((x) => x !== s) })} label={SCOPE_LABEL[s]} />
              ))}
            </div>
          </div>
          <Field label="Evidence" className="sm:col-span-2">
            <Input value={form.evidence} onChange={(e) => set({ evidence: e.target.value })} placeholder="Document, receipt, email ID or license URL" />
          </Field>
          <Field label="Notes" optional className="sm:col-span-2">
            <Textarea rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </section>
        {existing && (
          <>
            <section>
              <div className="mb-2 text-[12.5px] font-semibold">Linked tracks ({linked.length})</div>
              {linked.length ? (
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {linked.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                      <Cover seed={t.coverSeed} size={32} />
                      <Link href={`/library?track=${t.id}`} className="flex-1 truncate font-medium hover:underline">
                        {t.title}
                      </Link>
                      <span className="font-mono text-[11.5px] text-fg-3">{t.code}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[12.5px] text-fg-3">No tracks use this record yet.</p>
              )}
            </section>
            <section>
              <div className="mb-2 text-[12.5px] font-semibold">History</div>
              <ol className="space-y-2 text-[12.5px]">
                {history.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-36 shrink-0 font-mono text-[11.5px] text-fg-3">{fmtDateTime(e.at)}</span>
                    <span className="text-fg-2">{e.message}</span>
                  </li>
                ))}
              </ol>
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}

export function AuthorizationsView() {
  const auths = useStore((s) => s.authorizations);
  const tracks = useStore((s) => s.tracks);
  const now = useNow();
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [target, setTarget] = useState<Authorization | "new" | null>(null);
  const [revoke, setRevoke] = useState<Authorization | null>(null);
  const statusOf = (a: Authorization) => authStatus(a, now);
  const list = auths
    .filter((a) => f === "all" || statusOf(a) === f)
    .filter((a) => !q.trim() || `${a.code} ${a.holder} ${a.evidence}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.createdAt - a.createdAt);
  const blockedTracks = tracks.filter((t) => {
    const st = authStatus(auths.find((a) => a.id === t.authorizationId), now);
    return st === "expired" || st === "revoked" || st === "under-review";
  }).length;

  return (
    <Body>
      <Notice className="mb-5" title="Personal listening only">
        Keeping a file grants no copyright and no right to use it in ads, broadcast or distribution — the interface offers none of those uses. When an authorization expires or is revoked, its files are flagged as not usable until reviewed.
        {blockedTracks > 0 && <span className="font-semibold text-warn"> {blockedTracks} track(s) are currently blocked.</span>}
      </Notice>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", "active", "expiring", "expired", "under-review", "revoked"] as F[]).map((x) => (
          <Chip key={x} active={f === x} onClick={() => setF(x)} count={auths.filter((a) => x === "all" || statusOf(a) === x).length}>
            {x === "all" ? "All" : x === "expiring" ? "Expiring soon" : x === "under-review" ? "Under review" : x[0].toUpperCase() + x.slice(1)}
          </Chip>
        ))}
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, holder or evidence" className="flex-1 sm:w-64" aria-label="Search authorizations" />
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setTarget("new")}>
            New authorization
          </Button>
        </div>
      </div>
      {list.length ? (
        <Table>
          <thead>
            <tr>
              <TH>Record</TH>
              <TH>Basis</TH>
              <TH className="hidden lg:table-cell">Scope</TH>
              <TH className="hidden md:table-cell">Territory</TH>
              <TH>Valid until</TH>
              <TH align="center">Tracks</TH>
              <TH>Status</TH>
              <TH className="w-12" />
            </tr>
          </thead>
          <tbody>
            {list.map((a) => {
              const st = statusOf(a);
              return (
                <TR key={a.id} onClick={() => setTarget(a)}>
                  <TD className="max-w-[280px]">
                    <div className="font-mono text-[11.5px] text-fg-3">{a.code}</div>
                    <div className="truncate font-semibold">{a.holder}</div>
                    <div className="truncate text-[12px] text-fg-3" title={a.evidence}>
                      {a.evidence}
                    </div>
                  </TD>
                  <TD className="whitespace-nowrap text-[12.5px]">{BASIS_LABEL[a.basis]}</TD>
                  <TD className="hidden lg:table-cell">
                    <span className="flex flex-wrap gap-1">
                      {a.scope.map((s) => (
                        <Pill key={s}>{SCOPE_LABEL[s]}</Pill>
                      ))}
                    </span>
                  </TD>
                  <TD className="hidden text-[12.5px] text-fg-2 md:table-cell">{a.territory}</TD>
                  <TD className="whitespace-nowrap text-[12.5px] text-fg-2">{a.validUntil ? fmtDate(a.validUntil) : "No expiry"}</TD>
                  <TD align="center" className="font-mono tabular-nums">
                    {tracks.filter((t) => t.authorizationId === a.id).length}
                  </TD>
                  <TD>
                    <AuthStatusBadge status={st} />
                  </TD>
                  <TD>
                    <div onClick={(e) => e.stopPropagation()}>
                      <Menu
                        items={[
                          { label: "Edit record", icon: <Pencil size={15} />, onSelect: () => setTarget(a) },
                          { label: "Approve", icon: <CircleCheck size={15} />, disabled: a.review === "approved", hint: a.review === "approved" ? "Already approved" : undefined, onSelect: () => actions.updateAuthorization(a.id, { review: "approved" }) },
                          { label: "Copy code", icon: <Copy size={15} />, onSelect: () => copyText(a.code, "Code copied") },
                          { separator: true, label: "s" },
                          { label: "Revoke…", icon: <Ban size={15} />, danger: true, disabled: a.review === "revoked", hint: a.review === "revoked" ? "Already revoked" : undefined, onSelect: () => setRevoke(a) },
                        ]}
                        trigger={(p) => (
                          <IconButton label="Authorization actions" {...p}>
                            <Ellipsis size={17} />
                          </IconButton>
                        )}
                      />
                    </div>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      ) : (
        <EmptyState icon={<ShieldCheck size={22} />} title="No authorizations match" />
      )}
      <AuthorizationDrawer target={target} onClose={() => setTarget(null)} />
      <ConfirmDialog
        open={!!revoke}
        onClose={() => setRevoke(null)}
        title={`Revoke ${revoke?.code}?`}
        description={`${tracks.filter((t) => t.authorizationId === revoke?.id).length} track(s) will be flagged as not usable (no playback, no playlists) until a valid authorization is recorded. Files are not deleted.`}
        confirmLabel="Revoke"
        onConfirm={() => {
          if (revoke) actions.updateAuthorization(revoke.id, { review: "revoked" });
          toast({ title: "Authorization revoked" });
        }}
      />
    </Body>
  );
}

export function ProvenanceView() {
  const tracks = useStore((s) => s.tracks);
  const files = useStore((s) => s.files);
  const auths = useStore((s) => s.authorizations);
  const artists = useStore((s) => s.artists);
  const now = useNow();
  const [q, setQ] = useState("");
  const rows = tracks
    .map((t) => ({ t, f: files.find((x) => x.id === t.originalFileId), a: auths.find((x) => x.id === t.authorizationId), ar: artists.find((x) => x.id === t.artistId) }))
    .filter(({ t, ar }) => !q.trim() || `${t.title} ${ar?.name ?? ""} ${t.provenance.sourceUrl} ${t.code}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((x, y) => y.t.addedAt - x.t.addedAt);

  const exportCsv = () => {
    const head = "track_code,title,artist,source_url,platform,channel,tool,tool_version,retrieved_at,operator,ip,sha256,codec,authorization,basis";
    const lines = rows.map(({ t, f, a, ar }) =>
      [t.code, `"${t.title}"`, `"${ar?.name ?? ""}"`, t.provenance.sourceUrl, `"${t.provenance.sourcePlatform}"`, `"${t.provenance.channel ?? ""}"`, t.provenance.tool, t.provenance.toolVersion, new Date(t.provenance.retrievedAt).toISOString(), t.provenance.operator, t.provenance.ip, f?.sha256 ?? "", f?.codec ?? "", a?.code ?? "", a?.basis ?? ""].join(","),
    );
    downloadText("provenance-register.csv", [head, ...lines].join("\n"), "text/csv");
    actions.logEvent("rights.provenance.exported", `Exported provenance register (${rows.length} rows)`);
  };

  return (
    <Body>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <p className="mr-auto max-w-2xl text-[13px] text-fg-2">One row per original file: where it came from, which tool and version fetched it, who did it from which IP, its hash, and the authorization that covers it.</p>
        <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Track, artist or URL" className="w-full sm:w-64" aria-label="Search provenance" />
        <Button variant="secondary" icon={<Download size={15} />} onClick={exportCsv}>
          Export CSV
        </Button>
      </div>
      <Table>
        <thead>
          <tr>
            <TH>Track</TH>
            <TH>Origin</TH>
            <TH>Tool</TH>
            <TH className="hidden lg:table-cell">Retrieved · operator · IP</TH>
            <TH>SHA-256</TH>
            <TH>Authorization</TH>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ t, f, a, ar }) => (
            <TR key={t.id}>
              <TD className="max-w-[240px]">
                <Link href={`/library?track=${t.id}`} className="block truncate font-semibold hover:underline">
                  {t.title}
                </Link>
                <div className="truncate text-[12px] text-fg-3">
                  {ar?.name} · <span className="font-mono">{t.code}</span>
                </div>
              </TD>
              <TD className="max-w-[260px]">
                <div className="truncate text-[12.5px]" title={t.provenance.sourceUrl}>
                  {t.provenance.sourceUrl.startsWith("http") ? hostOf(t.provenance.sourceUrl) : t.provenance.sourceUrl}
                </div>
                <div className="truncate text-[11.5px] text-fg-3">
                  {t.provenance.sourcePlatform} · {t.provenance.channel}
                </div>
              </TD>
              <TD className="whitespace-nowrap font-mono text-[12px] text-fg-2">{t.provenance.tool === "local-import" ? "local import" : `${ENGINE_INFO[t.provenance.tool].name} ${t.provenance.toolVersion}`}</TD>
              <TD className="hidden whitespace-nowrap text-[12px] text-fg-2 lg:table-cell">
                {fmtDateTime(t.provenance.retrievedAt)}
                <div className="font-mono text-[11px] text-fg-3">
                  {t.provenance.operator} · {t.provenance.ip}
                </div>
              </TD>
              <TD>
                {f && (
                  <button type="button" onClick={() => copyText(f.sha256, "SHA-256 copied")} className="inline-flex items-center gap-1 font-mono text-[11.5px] text-fg-2 hover:text-accent" title={f.sha256}>
                    {shortHash(f.sha256)} <Copy size={11} />
                  </button>
                )}
              </TD>
              <TD>{a ? <span className="inline-flex items-center gap-2"><span className="font-mono text-[12px]">{a.code}</span><AuthStatusBadge status={authStatus(a, now)} /></span> : "—"}</TD>
            </TR>
          ))}
        </tbody>
      </Table>
    </Body>
  );
}
