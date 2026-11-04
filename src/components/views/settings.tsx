"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Database, Download, HardDrive, Lock, RotateCcw, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { actions, getState, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useIsOffline } from "@/lib/connectivity";
import type { Settings } from "@/lib/types";
import { downloadText, fmtBytes } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badges";
import { Field, Input, RangeInput, Segmented, Switch } from "@/components/ui/form";
import { Body, Card } from "@/components/ui/layout";
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
  const d = useDraft((s) => ({ maxSizeMB: s.maxSizeMB, maxDurationMin: s.maxDurationMin, maxRetries: s.maxRetries, autoRetryTransient: s.autoRetryTransient }));
  return (
    <Body className="max-w-4xl">
      <Card title="Limits" description="Enforced per file. A job that goes over a limit ends as failed with the reason.">
        <Row title="Maximum file size" desc="Downloads are aborted when they reach this size and the partial file is removed from staging.">
          <Input type="number" min={1} max={2000} value={d.value.maxSizeMB} onChange={(e) => d.set({ maxSizeMB: Math.max(1, Number(e.target.value)) })} suffix="MB" className="w-36" aria-label="Maximum file size in MB" />
        </Row>
        <Row title="Maximum duration" desc="Measured after a full decode; longer files fail validation and are not added to the library.">
          <Input type="number" min={1} max={180} value={d.value.maxDurationMin} onChange={(e) => d.set({ maxDurationMin: Math.max(1, Number(e.target.value)) })} suffix="min" className="w-36" aria-label="Maximum duration in minutes" />
        </Row>
        <Row title="Maximum retries" desc="Configurable up to 3. Never unlimited. Policy failures (limits, duplicates, undecodable files) are not retried.">
          <Segmented label="Maximum retries" value={d.value.maxRetries} onChange={(v) => d.set({ maxRetries: v })} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
        </Row>
        <Row title="Automatic retry for transient errors" desc="Interrupted jobs (e.g. the tab closed mid-validation) retry with exponential backoff, within the maximum above.">
          <Switch checked={d.value.autoRetryTransient} onChange={(v) => d.set({ autoRetryTransient: v })} label="Automatic retry" />
        </Row>
      </Card>
      <Card title="Execution" className="mt-5">
        <Row title="Concurrency" desc="The pilot processes one task at a time." locked="Pilot constraint (RF-ING-05)">
          <Pill>1 job</Pill>
        </Row>
        <Row title="Staging" desc="Each download goes to its own folder in .worker/staging on this PC and is removed after validation. Only complete, validated files reach the library." locked="Local worker">
          <Pill>Disk · this PC</Pill>
        </Row>
        <Row title="Authorization before download" desc="An import can't be queued without an authorization basis." locked="Compliance requirement (RF-ING-02)">
          <Switch checked onChange={() => undefined} disabled label="Require authorization" />
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

export function ValidationSettings() {
  const d = useDraft((s) => ({ durationToleranceSec: s.durationToleranceSec }));
  return (
    <Body className="max-w-4xl">
      <Card title="Validation" description="Runs on every import, in this order. Any failure stops the job and nothing reaches the library.">
        <Row title="Complete file" desc="The stream must decode end to end with FFmpeg; truncated or corrupt files fail." locked="RF-04">
          <Pill>Full decode</Pill>
        </Row>
        <Row title="Real codec detection" desc="Read from the stream with ffprobe, never from the extension. A mismatching extension is a warning and the real codec is recorded." locked="RF-PRO-01">
          <Pill>ffprobe</Pill>
        </Row>
        <Row title="Duration" desc="Measured from the decoded audio and checked against the maximum in Settings › Ingestion." locked="RF-ING-06">
          <Pill>Decoded length</Pill>
        </Row>
        <Row
          title="Duration tolerance"
          desc={
            <>
              URL downloads: maximum difference between the file and the source or catalog reference before it fails as a different version. Pending agreement with the client <span className="font-mono">(TBD-10)</span>.
            </>
          }
        >
          <div className="flex w-56 items-center gap-3">
            <RangeInput label="Duration tolerance" value={d.value.durationToleranceSec} min={0} max={10} onChange={(v) => d.set({ durationToleranceSec: v })} />
            <span className="w-12 text-right font-mono text-[13px]">±{d.value.durationToleranceSec}s</span>
          </div>
        </Row>
        <Row title="Hash algorithm" desc="Computed over the original bytes on this PC." locked="RF-04">
          <Pill>SHA-256</Pill>
        </Row>
        <Row title="Duplicates" desc="A file with the same SHA-256 as one already in the library fails and is logged under Library › Duplicates." locked="RF-BIB-04">
          <Pill>By hash</Pill>
        </Row>
      </Card>
      <Card title="Processing policy" className="mt-5" description="Fidelity and loudness are different properties. Re-encoding never improves quality.">
        <Row title="Conversion" desc="The original is stored exactly as received. Output written by spotDL or FreyrJS is recorded as written by the engine, never as source quality." locked="RF-PRO-03">
          <Pill>No conversion</Pill>
        </Row>
        <Row title="Keep originals" desc="Originals are never modified or deleted automatically; deleting a track always needs confirmation." locked="RF-BIB-02 / RF-BIB-06">
          <Switch checked onChange={() => undefined} disabled label="Keep originals" />
        </Row>
        <Row title="Quality labels" desc="A FLAC/WAV container or a high nominal bitrate is never presented as a master — the real codec is what gets recorded." locked="RF-PRO-05">
          <Pill>Real codec only</Pill>
        </Row>
      </Card>
      <Card title="Storage" className="mt-5">
        <Row title="Downloads" desc="URL downloads are moved, once validated, to library/originals/<artist>/<title> in the app folder on this PC. Deleting the track deletes that file." locked="Fixed for the pilot">
          <Pill>Disk · this PC</Pill>
        </Row>
        <Row title="Music folders" desc="Folders you add in Library › Folders are read in place: files are never copied, moved or deleted; deleting a track only removes it from the library." locked="Library › Folders">
          <Pill>Read in place</Pill>
        </Row>
      </Card>
      <SaveBar
        dirty={d.dirty}
        onDiscard={d.reset}
        onSave={() => {
          actions.updateSettings(d.value, "validation");
          d.reset();
          toast({ tone: "success", title: "Validation settings saved", description: "New jobs use this tolerance." });
        }}
      />
    </Body>
  );
}

export function WorkspaceSettings() {
  const d = useDraft((s) => ({ operator: s.operator }));
  const offline = useIsOffline();
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
        <Row title="Browser storage" desc="Workspace records and cover art are kept in this browser; the audio itself lives on disk.">
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
        <Row title="Reset workspace" desc="Clears every local record (tracks, playlists, authorizations, jobs, audit) and the stored audio, leaving an empty workspace. Cannot be undone.">
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
        title="Reset the workspace?"
        description="All local records, imported audio and the audit trail on this device are deleted. The workspace starts empty."
        confirmLabel="Reset workspace"
        requireText="RESET"
        onConfirm={() => {
          void actions.resetWorkspace().then(() => toast({ title: "Workspace reset" }));
        }}
      />
    </Body>
  );
}
