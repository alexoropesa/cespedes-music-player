"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { FileMusic, FileUp, RotateCcw, Upload } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { toast } from "@/lib/toast";
import { idbPut } from "@/lib/idb";
import { EXT_COMPATIBLE, extOf, extractCover, sniffAudio, type Sniff } from "@/lib/audio-inspect";
import { storeEmbeddedCover } from "@/lib/covers";
import { codecLabel } from "@/lib/seed";
import { cx, fmtBytes, fmtRelative, uid } from "@/lib/util";
import { Button } from "@/components/ui/button";
import { CodecBadge, Pill, StatusBadge } from "@/components/ui/badges";
import { Body, Card, Notice } from "@/components/ui/layout";
import { AuthorizationFields, IdentityFields, PlaylistSelect, authValid, commitAuthorization, commitIdentity, emptyAuth, emptyIdentity, identityValid, type AuthValue, type IdentityValue } from "./shared";
import { JobDrawer, jobNote } from "@/components/jobs";

export function ImportView() {
  const settings = useStore((s) => s.settings);
  const jobs = useStore((s) => s.jobs);
  const now = useNow();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [sniff, setSniff] = useState<Sniff | null | "pending">(null);
  const [drag, setDrag] = useState(false);
  const [identity, setIdentity] = useState<IdentityValue>(emptyIdentity());
  const [auth, setAuth] = useState<AuthValue>(emptyAuth("own-content"));
  const [playlistId, setPlaylistId] = useState("");
  const [busy, setBusy] = useState(false);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [artwork, setArtwork] = useState<string | null>(null);

  const recent = jobs.filter((j) => j.mode === "local-file").sort((a, b) => b.createdAt - a.createdAt).slice(0, 8);
  const tooBig = file ? file.size > settings.maxSizeMB * 1048576 : false;
  const ext = file ? extOf(file.name) : "";
  const extMismatch = file && sniff && sniff !== "pending" ? !(EXT_COMPATIBLE[sniff.ext]?.includes(ext) ?? sniff.ext === ext) : false;

  const choose = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setSniff("pending");
    setIdentity(emptyIdentity(f.name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/^\d+\s*[-.]\s*/, "")));
    const head = await f.slice(0, 512 * 1024).arrayBuffer();
    setSniff(sniffAudio(head));
    const cover = extractCover(await f.arrayBuffer());
    setArtwork((old) => {
      if (old) URL.revokeObjectURL(old);
      return cover ? URL.createObjectURL(new Blob([cover.data.slice()], { type: cover.mime })) : null;
    });
  };

  const reset = () => {
    setFile(null);
    setSniff(null);
    setArtwork((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setIdentity(emptyIdentity());
    setAuth(emptyAuth("own-content"));
    setPlaylistId("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      const key = uid("stage");
      await idbPut(key, file);
      const coverSeed = (await storeEmbeddedCover(await file.arrayBuffer()).catch(() => null)) ?? file.name;
      const authorizationId = commitAuthorization(auth);
      const ident = commitIdentity(identity);
      const sn = sniff && sniff !== "pending" ? sniff : null;
      const job = actions.createJob({
        mode: "local-file",
        tool: "local-import",
        toolVersion: "browser-validator 1.0",
        source: {
          url: `file://imports/${file.name}`,
          platform: "Local file",
          sourceId: file.name,
          title: file.name,
          channel: "Provided by operator",
          durationSec: 0,
          bitrateKbps: 0,
          formats: [{ id: "file", ext, codec: sn?.codec ?? "unknown", container: sn?.container ?? ext, abrKbps: 0, asrHz: sn?.sampleRateHz ?? 0, sizeBytes: file.size }],
          coverSeed,
        },
        formatId: "file",
        identity: ident,
        authorizationId,
        playlistId: playlistId || undefined,
        scenario: "ok",
        blobKey: key,
        fileName: file.name,
      });
      toast({ tone: "success", title: `${job.code} queued`, description: "Real validation runs on this device: decode, codec, duration, SHA-256, duplicates." });
      reset();
      setOpenJob(job.id);
    } catch (e) {
      toast({ tone: "error", title: "Could not stage the file", description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Body>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-5">
          <Card title="Audio file" description="Files the client provides (own recordings, purchases). Validated for real in this browser and stored locally for offline playback.">
            {!file ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDrag(true);
                }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDrag(false);
                  void choose(e.dataTransfer.files[0]);
                }}
                className={cx("flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-14 text-center transition-colors", drag ? "border-accent bg-accent/[0.06]" : "border-line-strong bg-surface-1/40")}
              >
                <div className="flex size-12 items-center justify-center rounded-2xl bg-white/[0.06]">
                  <Upload size={22} />
                </div>
                <p className="mt-4 text-[14px] font-semibold">Drop an audio file here</p>
                <p className="mt-1 text-[12.5px] text-fg-3">
                  FLAC, WAV, MP3, M4A/AAC, Opus/Ogg, WebM · max {settings.maxSizeMB} MB · max {settings.maxDurationMin} min
                </p>
                <Button className="mt-5" variant="primary" icon={<FileUp size={16} />} onClick={() => inputRef.current?.click()}>
                  Browse files
                </Button>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-surface-1/50 p-4">
                <div className="flex items-start gap-3">
                  {artwork ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local preview of the file's embedded artwork
                    <img src={artwork} alt="Embedded artwork" width={56} height={56} className="size-14 shrink-0 rounded-lg object-cover" title="Embedded artwork — kept with the track" />
                  ) : (
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/[0.06]" title="No embedded artwork — a generated cover will be used">
                      <FileMusic size={20} />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold">{file.name}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12.5px] text-fg-2">
                      <span className={tooBig ? "text-st-failed" : ""}>{fmtBytes(file.size)}</span>·<span>declared .{ext || "?"}</span>·
                      {sniff === "pending" ? (
                        <span className="text-fg-3">Reading header…</span>
                      ) : sniff ? (
                        <span className="inline-flex items-center gap-1.5">
                          detected <CodecBadge codec={sniff.codec} /> {sniff.container.toUpperCase()}
                          {sniff.sampleRateHz ? ` · ${(sniff.sampleRateHz / 1000).toFixed(1)} kHz` : ""}
                          {sniff.channels ? ` · ${sniff.channels} ch` : ""}
                        </span>
                      ) : (
                        <span className="text-warn">Unrecognized header</span>
                      )}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={reset}>
                    Change
                  </Button>
                </div>
                {tooBig && (
                  <Notice tone="danger" className="mt-3" title="Exceeds the size limit">
                    {fmtBytes(file.size)} is over the {settings.maxSizeMB} MB limit (Settings › Ingestion).
                  </Notice>
                )}
                {extMismatch && sniff && sniff !== "pending" && (
                  <Notice tone="warning" className="mt-3" title="Extension doesn't match the real codec">
                    The file says .{ext} but its stream is {codecLabel(sniff.codec)} in {sniff.container.toUpperCase()}. The real codec is what gets recorded.
                  </Notice>
                )}
              </div>
            )}
            <input ref={inputRef} type="file" accept="audio/*,.flac,.opus,.m4a,.webm" className="hidden" onChange={(e) => void choose(e.target.files?.[0])} />
          </Card>

          {file && (
            <>
              <Card title="Track identity">
                <IdentityFields value={identity} onChange={setIdentity} />
              </Card>
              <Card title="Authorization basis" description="Own content or a purchase are the usual bases for files provided by the client.">
                <AuthorizationFields value={auth} onChange={setAuth} />
              </Card>
              <Card>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div className="w-full max-w-sm">
                    <PlaylistSelect value={playlistId} onChange={setPlaylistId} />
                  </div>
                  <Button variant="primary" size="lg" loading={busy} disabled={tooBig || !identityValid(identity) || !authValid(auth) || sniff === "pending"} onClick={() => void submit()}>
                    Queue import
                  </Button>
                </div>
              </Card>
            </>
          )}
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card title="What gets validated" description="Same states as any ingest job">
            <ol className="space-y-3 text-[12.5px]">
              {[
                ["Complete file", "Decoded end-to-end; truncated files fail."],
                ["Real codec", "Read from the stream header, not the extension."],
                ["Duration", `Measured, and checked against the ${settings.maxDurationMin} min limit.`],
                ["SHA-256", "Computed over the original bytes."],
                ["Duplicates", "Same hash as a library file → not added again."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-3">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-white/[0.07] text-[10.5px] font-bold text-fg-2">{i + 1}</span>
                  <span>
                    <span className="block font-semibold">{t}</span>
                    <span className="text-fg-3">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Recent imports" padded={false}>
            {recent.length ? (
              <ul className="divide-y divide-line">
                {recent.map((j) => (
                  <li key={j.id}>
                    <button type="button" onClick={() => setOpenJob(j.id)} className="flex w-full items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.03]">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold">{j.identity.title}</div>
                        <div className="font-mono text-[11px] text-fg-3">
                          {j.code} · {fmtRelative(j.createdAt, now)}
                        </div>
                      </div>
                      <StatusBadge status={j.status} note={jobNote(j)} size="sm" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 pb-5 text-[12.5px] text-fg-3">No imports yet.</p>
            )}
            <div className="border-t border-line px-5 py-3 text-[12px] text-fg-3">
              Bytes stay in this browser&apos;s storage —{" "}
              <Link href="/settings/workspace" className="text-fg-2 hover:text-fg">
                storage usage
              </Link>
              . <Pill>Offline playback</Pill>
            </div>
          </Card>
        </aside>
      </div>
      <JobDrawer jobId={openJob} onClose={() => setOpenJob(null)} />
    </Body>
  );
}
