"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Database, Download, HardDrive, Lock, RotateCcw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { actions, getState, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useIsOffline } from "@/lib/connectivity";
import { ENGINE_INFO } from "@/lib/catalog";
import type { EngineId, Settings } from "@/lib/types";
import { ENGINES } from "@/lib/types";
import { cx, downloadText, fmtBytes } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badges";
import { Field, Input, RadioCard, RangeInput, Segmented, Select, Switch } from "@/components/ui/form";
import { Body, Card, Notice } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/overlay";

function useDraft<T extends Partial<Settings>>(pick: (s: Settings) => T) {
  const settings = useStore((s) => s.settings);
  const current = pick(settings);
  const [draft, setDraft] = useState<T | null>(null);
  const value = draft ?? current;
  const dirty = draft != null && JSON.stringify(draft) !== JSON.stringify(current);
  return { value, set: (p: Partial<T>) => setDraft({ ...value, ...p }), dirty, reset: () => setDraft(null) };
}

function SaveBar({ dirty, onSave, onDiscard }: { dirty: boolean; onSave: () => void; onDiscard: () => void }) {
  if (!dirty) return null;
  return (
    <div className="sticky bottom-3 z-10 mt-6 flex animate-pop-in items-center gap-3 rounded-2xl border border-line-strong bg-surface-3/95 px-4 py-3 shadow-[0_16px_40px_-10px_rgb(0_0_0/0.8)]">
      <span className="flex-1 text-[13px] font-medium">Unsaved changes · apply to new jobs only</span>
      <Button size="sm" variant="ghost" onClick={onDiscard}>
        Discard
      </Button>
      <Button size="sm" variant="primary" onClick={onSave}>
        Save changes
      </Button>
    </div>
  );
}

function Row({ title, desc, children, locked }: { title: ReactNode; desc?: ReactNode; children: ReactNode; locked?: string }) {
  return (
    <div className="flex flex-col gap-3 border-b border-line py-5 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-8">
      <div className="min-w-0 max-w-xl">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          {title}
          {locked && (
            <span title={locked} className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-px text-[10.5px] font-medium text-fg-2">
              <Lock size={10} /> Locked
            </span>
          )}
        </div>
        {desc && <p className="mt-1 text-[12.5px] leading-relaxed text-fg-3">{desc}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function IngestionSettings() {
  const d = useDraft((s) => ({ maxSizeMB: s.maxSizeMB, maxDurationMin: s.maxDurationMin, maxRetries: s.maxRetries, autoRetryTransient: s.autoRetryTransient, defaultEngine: s.defaultEngine }));
  const stagingDir = useStore((s) => s.settings.stagingDir);
  return (
    <Body className="max-w-4xl">
      <Card title="Limits" description="Enforced per file. A job that goes over a limit ends as failed with the reason.">
        <Row title="Maximum file size" desc="Downloads are aborted when they reach this size; partial files are removed from staging.">
          <Input type="number" min={1} max={2000} value={d.value.maxSizeMB} onChange={(e) => d.set({ maxSizeMB: Math.max(1, Number(e.target.value)) })} suffix="MB" className="w-36" aria-label="Maximum file size in MB" />
        </Row>
        <Row title="Maximum duration" desc="Sources longer than this can't be queued; imported files longer than this fail validation.">
          <Input type="number" min={1} max={180} value={d.value.maxDurationMin} onChange={(e) => d.set({ maxDurationMin: Math.max(1, Number(e.target.value)) })} suffix="min" className="w-36" aria-label="Maximum duration in minutes" />
        </Row>
        <Row title="Maximum retries" desc="Configurable up to 3. Never unlimited. Policy failures (limits, duplicates, access required) are not retried.">
          <Segmented label="Maximum retries" value={d.value.maxRetries} onChange={(v) => d.set({ maxRetries: v })} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
        </Row>
        <Row title="Automatic retry for transient errors" desc="Network resets and incomplete downloads retry with exponential backoff, within the maximum above.">
          <Switch checked={d.value.autoRetryTransient} onChange={(v) => d.set({ autoRetryTransient: v })} label="Automatic retry" />
        </Row>
      </Card>
      <Card title="Execution" className="mt-5">
        <Row title="Concurrency" desc="The pilot processes one task at a time." locked="Pilot constraint (RF-ING-05)">
          <Pill>1 job</Pill>
        </Row>
        <Row title="Staging folder" desc="Isolated sandbox. Only complete, validated files move to the library." locked="Defined by the worker sandbox">
          <code className="rounded-md bg-surface-1 px-2 py-1 font-mono text-[12.5px]">{stagingDir}</code>
        </Row>
        <Row title="Authorization before download" desc="A job can't be created without an authorization basis." locked="Compliance requirement (RF-ING-02)">
          <Switch checked onChange={() => undefined} disabled label="Require authorization" />
        </Row>
        <Row title="Default engine" desc="Preselected in URL ingest. The engine is swappable per job for comparisons.">
          <Select value={d.value.defaultEngine} onChange={(e) => d.set({ defaultEngine: e.target.value as EngineId })} className="w-44" aria-label="Default engine">
            {ENGINES.map((e) => (
              <option key={e} value={e}>
                {ENGINE_INFO[e].name}
              </option>
            ))}
          </Select>
        </Row>
      </Card>
      <SaveBar
        dirty={d.dirty}
        onDiscard={d.reset}
        onSave={() => {
          actions.updateSettings(d.value, "ingestion settings");
          d.reset();
          toast({ tone: "success", title: "Ingestion settings saved", description: "New jobs use these limits." });
        }}
      />
    </Body>
  );
}

export function EngineSettings() {
  const d = useDraft((s) => ({ engines: s.engines }));
  return (
    <Body className="max-w-5xl">
      <Notice className="mb-5">Engines run in an isolated environment with pinned versions; the system Python is never replaced. yt-dlp needs Python 3.11+; FreyrJS runs on Node.js. Dependency licenses are inventoried before packaging.</Notice>
      <div className="grid gap-4 lg:grid-cols-3">
        {ENGINES.map((e) => {
          const info = ENGINE_INFO[e];
          const v = d.value.engines[e];
          return (
            <section key={e} className={cx("rounded-[14px] border bg-surface-2/70 p-5", v.enabled ? "border-line" : "border-line opacity-70")}>
              <div className="flex items-center justify-between">
                <h3 className="text-[16px] font-extrabold">{info.name}</h3>
                <Switch checked={v.enabled} onChange={(on) => d.set({ engines: { ...d.value.engines, [e]: { ...v, enabled: on } } })} label={`Enable ${info.name}`} />
              </div>
              <Field label="Pinned version" className="mt-4">
                <Input value={v.version} onChange={(ev) => d.set({ engines: { ...d.value.engines, [e]: { ...v, version: ev.target.value } } })} className="font-mono" />
              </Field>
              <dl className="mt-4 space-y-2 text-[12.5px]">
                {[
                  ["Runtime", info.runtime],
                  ["Input", info.input],
                  ["Upstream", info.upstream],
                  ["License", info.license],
                ].map(([k, val]) => (
                  <div key={k}>
                    <dt className="text-fg-3">{k}</dt>
                    <dd className="text-fg-2">{val}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 rounded-lg bg-white/[0.04] px-3 py-2 text-[12px] leading-relaxed text-fg-2">{info.notes}</p>
            </section>
          );
        })}
      </div>
      <SaveBar
        dirty={d.dirty}
        onDiscard={d.reset}
        onSave={() => {
          actions.updateSettings(d.value, "engine versions");
          d.reset();
          toast({ tone: "success", title: "Engine settings saved" });
        }}
      />
    </Body>
  );
}

export function ValidationSettings() {
  const d = useDraft((s) => ({ durationToleranceSec: s.durationToleranceSec, conversionPolicy: s.conversionPolicy, normalizeDerivative: s.normalizeDerivative, libraryDir: s.libraryDir }));
  return (
    <Body className="max-w-4xl">
      <Card title="Validation">
        <Row title="Hash algorithm" desc="Computed over the original bytes to detect duplicates." locked="RF-04">
          <Pill>SHA-256</Pill>
        </Row>
        <Row title="Real codec detection" desc="Codec, container, bitrate and sample rate are read from the stream (ffprobe), never from the extension." locked="RF-PRO-01">
          <Pill>ffprobe</Pill>
        </Row>
        <Row
          title="Duration tolerance"
          desc={
            <>
              Maximum difference between the downloaded file and the source / reference before a match is flagged. Pending agreement with the client <span className="font-mono">(TBD-10)</span>.
            </>
          }
        >
          <div className="flex w-56 items-center gap-3">
            <RangeInput label="Duration tolerance" value={d.value.durationToleranceSec} min={0} max={10} onChange={(v) => d.set({ durationToleranceSec: v })} />
            <span className="w-12 text-right font-mono text-[13px]">±{d.value.durationToleranceSec}s</span>
          </div>
        </Row>
      </Card>
      <Card title="Processing policy" className="mt-5" description="Fidelity and loudness are different properties. Re-encoding never improves quality.">
        <div className="grid gap-2 py-4 sm:grid-cols-2" role="radiogroup" aria-label="Conversion policy">
          <RadioCard checked={d.value.conversionPolicy === "if-unplayable"} onChange={() => d.set({ conversionPolicy: "if-unplayable" })} title="Derive only if not playable" description="Default. Keep the original as is; create a compatible copy only when this system can't play it." />
          <RadioCard checked={d.value.conversionPolicy === "never"} onChange={() => d.set({ conversionPolicy: "never" })} title="Never convert" description="Unplayable originals stay in the library, flagged for manual handling." />
        </div>
        <Row title="Optional loudness normalization" desc="Creates a normalized derivative on demand. The original is never modified.">
          <Switch checked={d.value.normalizeDerivative} onChange={(v) => d.set({ normalizeDerivative: v })} label="Allow normalization derivatives" />
        </Row>
        <Row title="Keep originals" desc="Originals are never deleted automatically after creating derivatives." locked="RF-BIB-02 / RF-BIB-06">
          <Switch checked onChange={() => undefined} disabled label="Keep originals" />
        </Row>
        <Row title="Quality labels" desc="FLAC/WAV containers or high nominal bitrates from third-party sources are never presented as masters." locked="RF-PRO-05">
          <Pill>Real codec only</Pill>
        </Row>
      </Card>
      <Card title="Storage" className="mt-5">
        <Row title="Library root" desc="Originals in /originals, derivatives in /derivatives, each linked to its original.">
          <Input value={d.value.libraryDir} onChange={(e) => d.set({ libraryDir: e.target.value })} className="w-60 font-mono" aria-label="Library root" />
        </Row>
      </Card>
      <SaveBar
        dirty={d.dirty}
        onDiscard={d.reset}
        onSave={() => {
          actions.updateSettings(d.value, "validation & storage");
          d.reset();
          toast({ tone: "success", title: "Validation settings saved" });
        }}
      />
    </Body>
  );
}

export function WorkspaceSettings() {
  const d = useDraft((s) => ({ operator: s.operator }));
  const offline = useIsOffline();
  const files = useStore((s) => s.files);
  const [est, setEst] = useState<{ usage?: number; quota?: number; persisted?: boolean } | null>(null);
  const [sw, setSw] = useState<"unsupported" | "inactive" | "active">("inactive");
  const [reset, setReset] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const e = await navigator.storage?.estimate?.().catch(() => undefined);
      const p = await navigator.storage?.persisted?.().catch(() => false);
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration().catch(() => undefined) : undefined;
      if (!alive) return;
      setEst({ usage: e?.usage, quota: e?.quota, persisted: p });
      setSw(!("serviceWorker" in navigator) ? "unsupported" : reg?.active ? "active" : "inactive");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const realFiles = files.filter((f) => f.audio === "blob");

  return (
    <Body className="max-w-4xl">
      <Card title="Operator">
        <div className="grid gap-4 py-4 sm:grid-cols-2">
          <Field label="Name">
            <Input value={d.value.operator.name} onChange={(e) => d.set({ operator: { ...d.value.operator, name: e.target.value } })} />
          </Field>
          <Field label="Email" hint="Recorded as the actor of every audit event.">
            <Input type="email" value={d.value.operator.email} onChange={(e) => d.set({ operator: { ...d.value.operator, email: e.target.value } })} />
          </Field>
        </div>
      </Card>
      <Card title="Offline & storage" className="mt-5" description="Local playback works without internet: audio lives on this device.">
        <Row title="Connectivity" desc="Library playback never needs the network; ingestion and online providers do.">
          <Pill tone={offline ? "warning" : "success"} icon={offline ? <WifiOff size={11} /> : <Wifi size={11} />}>
            {offline ? "Offline" : "Online"}
          </Pill>
        </Row>
        <Row title="Offline shell" desc="A service worker caches the app so it reloads without internet (production build).">
          <Pill tone={sw === "active" ? "success" : "neutral"} icon={<ShieldCheck size={11} />}>
            {sw === "active" ? "Active" : sw === "unsupported" ? "Unsupported" : "Not active (dev)"}
          </Pill>
        </Row>
        <Row title="Browser storage" desc={`${realFiles.length} imported file(s) stored as real bytes; demo tracks use synthesized previews.`}>
          <div className="text-right">
            <div className="font-mono text-[13px]">
              {fmtBytes(est?.usage)} <span className="text-fg-3">/ {fmtBytes(est?.quota)}</span>
            </div>
            <Button
              size="xs"
              variant="ghost"
              icon={<HardDrive size={13} />}
              className="mt-1"
              disabled={est?.persisted}
              onClick={async () => {
                const ok = await navigator.storage?.persist?.().catch(() => false);
                setEst((x) => ({ ...x, persisted: !!ok }));
                toast({ tone: ok ? "success" : "warning", title: ok ? "Storage is persistent" : "Browser declined persistent storage" });
              }}
            >
              {est?.persisted ? "Persistent" : "Make persistent"}
            </Button>
          </div>
        </Row>
      </Card>
      <Card title="Workspace data" className="mt-5">
        <Row title="Export workspace" desc="Downloads all records (tracks, provenance, authorizations, jobs, audit) as JSON. Audio bytes are not included.">
          <Button
            variant="secondary"
            icon={<Download size={15} />}
            onClick={() => {
              downloadText(`bitferalda-workspace-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(getState(), null, 2), "application/json");
              actions.logEvent("workspace.exported", "Exported workspace JSON");
            }}
          >
            Export JSON
          </Button>
        </Row>
        <Row title="Reset demo workspace" desc="Clears local records and stored audio and restores the seeded pilot data. Cannot be undone.">
          <Button variant="danger" icon={<RotateCcw size={15} />} onClick={() => setReset(true)}>
            Reset…
          </Button>
        </Row>
      </Card>
      <p className="mt-4 flex items-center gap-2 text-[12px] text-fg-3">
        <Database size={13} /> Pilot storage is this browser. Framework, database and queue are decided after the pilot (TBD-08).
      </p>
      <SaveBar
        dirty={d.dirty}
        onDiscard={d.reset}
        onSave={() => {
          actions.updateSettings(d.value, "operator profile");
          d.reset();
          toast({ tone: "success", title: "Profile saved" });
        }}
      />
      <ConfirmDialog
        open={reset}
        onClose={() => setReset(false)}
        title="Reset the demo workspace?"
        description="All local records, imported audio and the audit trail on this device are replaced with the seeded pilot data."
        confirmLabel="Reset workspace"
        requireText="RESET"
        onConfirm={() => {
          void actions.resetWorkspace().then(() => toast({ title: "Workspace reset" }));
        }}
      />
    </Body>
  );
}
