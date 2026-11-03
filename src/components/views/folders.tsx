"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpen, FolderPlus, HardDrive, RefreshCw, Trash } from "lucide-react";
import { actions, authStatus, getState, isUsableStatus, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { toast } from "@/lib/toast";
import type { FolderScanEntry, LibraryFolder, LibraryInfo } from "@/lib/library-types";
import { fmtRelative } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { AuthStatusBadge, Pill } from "@/components/ui/badges";
import { Field, Input } from "@/components/ui/form";
import { Body, Card, EmptyState, Notice } from "@/components/ui/layout";
import { ConfirmDialog } from "@/components/ui/overlay";
import { AuthorizationFields, authValid, commitAuthorization, emptyAuth, type AuthValue } from "./ingest/shared";

const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** Queues one folder-import job per new file. Returns how many were queued / skipped. */
function queueScan(folder: LibraryFolder, files: FolderScanEntry[]) {
  const s = getState();
  const known = new Set(s.files.filter((f) => f.audio === "disk").map((f) => f.path.toLowerCase()));
  const inFlight = new Set(s.jobs.filter((j) => j.mode === "folder" && j.status !== "failed" && j.localPath).map((j) => j.localPath!.toLowerCase()));
  let queued = 0;
  let already = 0;
  for (const f of files) {
    const key = f.path.toLowerCase();
    if (known.has(key) || inFlight.has(key)) {
      already++;
      continue;
    }
    const artistName = (f.artist ?? "").split(/[;,/]| feat\. /i)[0]?.trim() || "Unknown artist";
    const st = getState();
    const artistId = st.artists.find((a) => a.name.toLowerCase() === artistName.toLowerCase())?.id ?? actions.createArtist({ name: artistName, tier: "independent", country: undefined, notes: undefined }).id;
    const title = f.title?.trim() || f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/^\d+\s*[-.]\s*/, "");
    const ext = extOf(f.name);
    actions.createJob({
      mode: "folder",
      tool: "local-import",
      toolVersion: "ffprobe/ffmpeg",
      source: {
        url: `file:///${f.path.replace(/\\/g, "/")}`,
        platform: "Local folder",
        sourceId: f.name,
        title: f.name,
        channel: folder.path,
        durationSec: 0,
        bitrateKbps: 0,
        album: f.album,
        formats: [{ id: "file", ext, codec: "unknown", container: ext, abrKbps: 0, asrHz: 0, sizeBytes: f.sizeBytes }],
        coverSeed: f.path,
      },
      formatId: "file",
      identity: { title, artistId, album: f.album },
      authorizationId: folder.authorizationId,
      scenario: "ok",
      fileName: f.name,
      localPath: f.path,
    });
    inFlight.add(key);
    queued++;
  }
  return { queued, already };
}

export function FoldersView() {
  const auths = useStore((s) => s.authorizations);
  const files = useStore((s) => s.files);
  const jobs = useStore((s) => s.jobs);
  const now = useNow();
  const [info, setInfo] = useState<LibraryInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [path, setPath] = useState("");
  const [auth, setAuth] = useState<AuthValue>(emptyAuth("own-content"));
  const [adding, setAdding] = useState(false);
  const [scanning, setScanning] = useState<string | null>(null);
  const [lastScan, setLastScan] = useState<Record<string, { found: number; queued: number; already: number }>>({});
  const [remove, setRemove] = useState<LibraryFolder | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/library", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      setInfo((await r.json()) as LibraryInfo);
      setError(null);
    } catch {
      setError("The local server is not reachable. Start the app on this PC and reload.");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/library", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<LibraryInfo>) : Promise.reject(new Error(String(r.status)))))
      .then((i) => alive && setInfo(i))
      .catch(() => alive && setError("The local server is not reachable. Start the app on this PC and reload."));
    return () => {
      alive = false;
    };
  }, []);

  const scan = async (folder: LibraryFolder) => {
    const a = getState().authorizations.find((x) => x.id === folder.authorizationId); // current state: the record may have just been created
    if (!a || !isUsableStatus(authStatus(a, Date.now()))) {
      toast({ tone: "error", title: "Authorization not active", description: "This folder's authorization is expired, revoked or under review. Nothing was imported." });
      return;
    }
    setScanning(folder.id);
    try {
      const r = await fetch(`/api/library/folders/${folder.id}/scan`, { method: "POST", cache: "no-store" });
      const d = (await r.json()) as { files?: FolderScanEntry[]; error?: string };
      if (!r.ok || !d.files) throw new Error(d.error ?? `HTTP ${r.status}`);
      const res = queueScan(folder, d.files);
      setLastScan((x) => ({ ...x, [folder.id]: { found: d.files!.length, ...res } }));
      actions.logEvent("library.folder.scanned", `Scanned ${folder.path} · ${d.files.length} audio file(s) · ${res.queued} queued for validation · ${res.already} already in library`, "info", folder.path);
      toast({ tone: "success", title: `${res.queued} file(s) queued`, description: `${d.files.length} audio files found · ${res.already} already in the library. Each one is validated before it appears.` });
      void load();
    } catch (e) {
      toast({ tone: "error", title: "Scan failed", description: (e as Error).message });
    } finally {
      setScanning(null);
    }
  };

  const add = async () => {
    setAdding(true);
    try {
      const authorizationId = commitAuthorization(auth);
      const r = await fetch("/api/library/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ path, authorizationId }), cache: "no-store" });
      const d = (await r.json()) as LibraryFolder & { error?: string };
      if (!r.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
      const code = getState().authorizations.find((a) => a.id === authorizationId)?.code;
      actions.logEvent("library.folder.added", `Added music folder ${d.path} · covered by ${code ?? authorizationId}`, "info", d.path);
      setPath("");
      setAuth(emptyAuth("own-content"));
      await load();
      await scan(d);
    } catch (e) {
      toast({ tone: "error", title: "Could not add the folder", description: (e as Error).message });
    } finally {
      setAdding(false);
    }
  };

  const inFolder = (f: LibraryFolder) => {
    const pre = f.path.toLowerCase();
    return {
      tracks: files.filter((x) => x.audio === "disk" && x.location === "external" && x.path.toLowerCase().startsWith(pre)).length,
      pending: jobs.filter((j) => j.mode === "folder" && j.localPath?.toLowerCase().startsWith(pre) && (j.status === "pending" || j.status === "downloading" || j.status === "validating")).length,
      failed: jobs.filter((j) => j.mode === "folder" && j.localPath?.toLowerCase().startsWith(pre) && j.status === "failed").length,
    };
  };
  const managed = files.filter((f) => f.audio === "disk" && f.location === "managed").length;

  return (
    <Body className="max-w-5xl space-y-5">
      {error && <Notice tone="danger" title="Local server not reachable">{error}</Notice>}

      <Card title="Downloads folder" description="Where URL downloads are kept once validated. Fixed for the pilot.">
        <div className="flex flex-wrap items-center gap-3 py-1">
          <HardDrive size={18} className="text-fg-2" />
          <code className="min-w-0 flex-1 break-all rounded-md bg-surface-1 px-2.5 py-1.5 font-mono text-[12.5px]">{info ? `${info.originalsDir}\\<artist>\\<title>.<ext>` : "…"}</code>
          <Pill>{managed} file(s)</Pill>
        </div>
      </Card>

      <Card title="Add a music folder" description="Music you already have on this PC. Files are read where they are — never copied, moved, converted or deleted — and each one is validated (FFmpeg decode, real codec, SHA-256, duplicates) before it appears in the library.">
        <div className="space-y-5 py-1">
          <Field label="Folder path" hint="Full path, e.g. D:\Music or C:\Users\you\Music. Subfolders are included.">
            <Input icon={<FolderOpen size={16} />} value={path} onChange={(e) => setPath(e.target.value)} placeholder="C:\Users\you\Music" className="font-mono" aria-label="Folder path" />
          </Field>
          <div>
            <div className="mb-2 text-[13px] font-semibold">Authorization that covers these files</div>
            <AuthorizationFields value={auth} onChange={setAuth} />
          </div>
          <div className="flex justify-end">
            <Button variant="primary" icon={<FolderPlus size={16} />} loading={adding} disabled={!path.trim() || !authValid(auth) || !!error} onClick={() => void add()}>
              Add and scan
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Music folders" padded={false}>
        {info?.folders.length ? (
          <ul className="divide-y divide-line">
            {info.folders.map((f) => {
              const a = auths.find((x) => x.id === f.authorizationId);
              const c = inFolder(f);
              const ls = lastScan[f.id];
              return (
                <li key={f.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
                  <FolderOpen size={18} className="shrink-0 text-fg-2" />
                  <div className="min-w-0 flex-1">
                    <div className="break-all font-mono text-[13px] font-semibold">{f.path}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-fg-3">
                      {a ? (
                        <>
                          <span className="font-mono">{a.code}</span> <AuthStatusBadge status={authStatus(a, now)} />
                        </>
                      ) : (
                        <Pill tone="danger">authorization missing</Pill>
                      )}
                      <span>· {c.tracks} in library</span>
                      {c.pending > 0 && <span>· {c.pending} validating</span>}
                      {c.failed > 0 && <span className="text-st-failed">· {c.failed} failed</span>}
                      <span>· {f.lastScanAt ? `scanned ${fmtRelative(f.lastScanAt, now)} (${f.lastScanCount ?? 0} audio files)` : "not scanned yet"}</span>
                    </div>
                    {ls && (
                      <div className="mt-1 text-[12px] text-fg-2">
                        Last scan: {ls.found} found · {ls.queued} queued · {ls.already} already in library
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" icon={<RefreshCw size={14} />} loading={scanning === f.id} disabled={!!scanning} onClick={() => void scan(f)}>
                      Scan for new files
                    </Button>
                    <Button size="sm" variant="ghost" icon={<Trash size={14} />} onClick={() => setRemove(f)} aria-label={`Remove ${f.path}`}>
                      Remove
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState icon={<FolderOpen size={22} />} title="No music folders yet" description="Add a folder above to bring the music you already have into the library." />
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!remove}
        onClose={() => setRemove(null)}
        title="Remove this folder?"
        description={`${remove?.path ?? ""} stops being scanned and served. Its files on disk are not touched. Tracks already imported from it stay in the library but can't play until the folder is added again.`}
        confirmLabel="Remove folder"
        onConfirm={() => {
          const f = remove!;
          void fetch(`/api/library/folders?id=${encodeURIComponent(f.id)}`, { method: "DELETE" }).then(() => {
            actions.logEvent("library.folder.removed", `Removed music folder ${f.path} (files on disk kept)`, "warning", f.path);
            void load();
          });
        }}
      />
    </Body>
  );
}
