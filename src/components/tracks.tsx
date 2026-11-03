"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Copy, ExternalLink, HardDrive, ListPlus, Pencil, Plus, Trash, Ellipsis, FileMusic } from "lucide-react";
import { actions, authStatus, isUsableStatus, useStore } from "@/lib/store";
import { playQueue, stopIfPlaying, toggle, usePlayer } from "@/lib/player";
import { useNow } from "@/lib/clock";
import { toast } from "@/lib/toast";
import type { Track } from "@/lib/types";
import { codecLabel, isLossless } from "@/lib/seed";
import { ENGINE_INFO } from "@/lib/catalog";
import { cx, fmtBytes, fmtDate, fmtDateTime, fmtDuration, fmtRelative, shortHash } from "@/lib/util";
import { Button, IconButton, PlayButton } from "./ui/button";
import { AuthStatusBadge, CodecBadge, Pill, TierBadge } from "./ui/badges";
import { ConfirmDialog, Drawer, Menu, Modal } from "./ui/overlay";
import { Field, Input, Select } from "./ui/form";
import { Cover, KV, Notice } from "./ui/layout";

export const BASIS_LABEL = {
  "own-content": "Own content",
  "rights-holder": "Rights-holder permission",
  purchase: "Purchase",
  license: "License",
} as const;

export const SCOPE_LABEL = { copy: "Copy", retain: "Retain", derivatives: "Derivatives" } as const;

export function copyText(text: string, what = "Copied") {
  void navigator.clipboard?.writeText(text).then(
    () => toast({ title: what }),
    () => undefined,
  );
}

/* ------------------------------------------------------------------ */

export function AddToPlaylistMenu({ trackIds, trigger, disabled }: { trackIds: string[]; trigger?: (p: { onClick: (e: React.MouseEvent<HTMLElement>) => void }) => ReactNode; disabled?: boolean }) {
  const playlists = useStore((s) => s.playlists);
  const add = (pid: string, name: string) => {
    const r = actions.addToPlaylist(pid, trackIds);
    if (r.added) toast({ tone: "success", title: `Added to ${name}`, description: r.skipped ? `${r.skipped} skipped (already in playlist or not usable).` : undefined });
    else toast({ tone: "warning", title: "Nothing added", description: "Already in this playlist, or the track isn't usable (authorization not active)." });
  };
  return (
    <Menu
      width={248}
      header="Add to playlist · only ready tracks"
      items={[
        ...playlists.map((p) => ({
          label: p.name,
          checked: trackIds.length === 1 && p.trackIds.includes(trackIds[0]),
          onSelect: () => add(p.id, p.name),
        })),
        { separator: true, label: "sep" },
        {
          label: "New playlist",
          icon: <Plus size={15} />,
          onSelect: () => {
            const p = actions.createPlaylist({ name: `Playlist #${playlists.length + 1}`, description: "", color: "iris" });
            add(p.id, p.name);
          },
        },
      ]}
      trigger={(p) =>
        trigger ? (
          trigger(p)
        ) : (
          <IconButton label="Add to playlist" {...p} disabled={disabled}>
            <ListPlus size={17} />
          </IconButton>
        )
      }
    />
  );
}

/* ------------------------------------------------------------------ */

export function EditTrackModal({ track, open, onClose }: { track: Track | null; open: boolean; onClose: () => void }) {
  const artists = useStore((s) => s.artists);
  const [form, setForm] = useState({ title: "", artistId: "", album: "" });
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (open && track && loadedFor !== track.id) {
    setLoadedFor(track.id);
    setForm({ title: track.title, artistId: track.artistId, album: track.album ?? "" });
  }
  const close = () => {
    setLoadedFor(null);
    onClose();
  };
  if (!track) return null;
  return (
    <Modal
      open={open}
      onClose={close}
      title="Edit details"
      description="Metadata only — the original file, its hash and its provenance stay untouched."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!form.title.trim()}
            onClick={() => {
              actions.updateTrack(track.id, { title: form.title.trim(), artistId: form.artistId, album: form.album.trim() || undefined });
              toast({ tone: "success", title: "Details saved" });
              close();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex gap-5">
        <Cover seed={track.coverSeed} size={132} rounded="rounded-xl" className="hidden sm:block" />
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          <Field label="Title">
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <Field label="Artist" hint="Confirmed by the operator. A source channel is never taken as the artist.">
            <Select value={form.artistId} onChange={(e) => setForm({ ...form, artistId: e.target.value })}>
              {artists.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.tier === "established" ? "Established" : "Independent"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Album" optional>
            <Input value={form.album} onChange={(e) => setForm({ ...form, album: e.target.value })} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

const TABS = ["Overview", "Files", "Provenance", "Rights", "Activity"] as const;

export function TrackDrawer({ trackId, onClose }: { trackId: string | null; onClose: () => void }) {
  const tracks = useStore((s) => s.tracks);
  const artists = useStore((s) => s.artists);
  const files = useStore((s) => s.files);
  const auths = useStore((s) => s.authorizations);
  const playlists = useStore((s) => s.playlists);
  const audit = useStore((s) => s.audit);
  const jobs = useStore((s) => s.jobs);
  const now = useNow();
  const player = usePlayer();
  const router = useRouter();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");
  const [edit, setEdit] = useState(false);
  const [del, setDel] = useState(false);

  const track = tracks.find((t) => t.id === trackId) ?? null;
  const close = () => {
    setTab("Overview");
    onClose();
  };
  if (!track) return <Drawer open={false} onClose={close} title="" />;

  const artist = artists.find((a) => a.id === track.artistId);
  const original = files.find((f) => f.id === track.originalFileId);
  const derivs = files.filter((f) => f.trackId === track.id && f.kind === "derivative");
  const auth = auths.find((a) => a.id === track.authorizationId);
  const st = authStatus(auth, now);
  const usable = isUsableStatus(st);
  const inPlaylists = playlists.filter((p) => p.trackIds.includes(track.id));
  const job = jobs.find((j) => j.id === track.provenance.jobId);
  const events = audit.filter((e) => e.target === track.code || (job && e.target === job.code)).slice(0, 30);
  const isCurrent = player.queue[player.index] === track.id;
  const tool = track.provenance.tool;

  return (
    <>
      <Drawer
        open={!!trackId}
        onClose={close}
        width="lg"
        title={
          <span className="flex items-center gap-2">
            {track.title} <span className="font-mono text-[12px] font-medium text-fg-3">{track.code}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            {artist?.name} {artist && <TierBadge tier={artist.tier} />}
            <Pill icon={<HardDrive size={11} />}>Local file</Pill>
          </span>
        }
        header={
          <div className="border-b border-line px-5 pt-4">
            <div className="flex items-center gap-4">
              <Cover seed={track.coverSeed} size={88} rounded="rounded-xl" />
              <div className="flex flex-1 flex-wrap items-center gap-2">
                <PlayButton
                  playing={isCurrent && player.playing}
                  disabled={!usable}
                  onClick={() => (isCurrent ? toggle() : playQueue([track.id], 0, { kind: "single", label: track.title }))}
                />
                <AddToPlaylistMenu
                  trackIds={[track.id]}
                  trigger={(p) => (
                    <Button {...p} variant="secondary" size="sm" icon={<ListPlus size={15} />} disabled={!usable}>
                      Add to playlist
                    </Button>
                  )}
                />
                <Button variant="ghost" size="sm" icon={<Pencil size={14} />} onClick={() => setEdit(true)}>
                  Edit details
                </Button>
                <Menu
                  items={[
                    { label: "Copy SHA-256", icon: <Copy size={15} />, onSelect: () => original && copyText(original.sha256, "SHA-256 copied") },
                    { label: "Open ingest job", icon: <ExternalLink size={15} />, disabled: !job, onSelect: () => job && router.push(`/queue?job=${job.id}`) },
                    { separator: true, label: "s" },
                    { label: "Delete from library…", icon: <Trash size={15} />, danger: true, onSelect: () => setDel(true) },
                  ]}
                  trigger={(p) => (
                    <IconButton label="More actions" {...p}>
                      <Ellipsis size={18} />
                    </IconButton>
                  )}
                />
              </div>
            </div>
            {!usable && (
              <Notice tone="danger" className="mt-4" title="Not usable until reviewed">
                Authorization {auth?.code} is {st.replace("-", " ")}. Playback and playlist use are blocked (RC-09).{" "}
                <Link href="/rights" className="font-semibold text-fg underline-offset-2 hover:underline">
                  Review in Rights
                </Link>
              </Notice>
            )}
            <div className="mt-4 flex gap-1 overflow-x-auto" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  onClick={() => setTab(t)}
                  className={cx("relative h-9 shrink-0 px-3 text-[13px] font-semibold", tab === t ? "text-fg" : "text-fg-3 hover:text-fg-2")}
                >
                  {t}
                  {tab === t && <span className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-fg" />}
                </button>
              ))}
            </div>
          </div>
        }
      >
        <div className="space-y-4 p-5">
          {tab === "Overview" && (
            <>
              <KV
                items={[
                  { k: "Title", v: track.title },
                  { k: "Artist", v: <span className="inline-flex items-center gap-2">{artist?.name} {artist && <TierBadge tier={artist.tier} />}</span> },
                  { k: "Album", v: track.album ?? "—" },
                  { k: "Duration", v: fmtDuration(track.durationSec) },
                  { k: "Real codec", v: original ? <CodecBadge codec={original.codec} kbps={original.bitrateKbps} /> : "—" },
                  { k: "Origin", v: "Local file in library (not an online reference)" },
                  { k: "Added", v: `${fmtDateTime(track.addedAt)} · ${fmtRelative(track.addedAt, now)}` },
                  { k: "Plays", v: track.plays },
                  {
                    k: "In playlists",
                    v: inPlaylists.length ? (
                      <span className="flex flex-wrap gap-1.5">
                        {inPlaylists.map((p) => (
                          <Link key={p.id} href={`/playlists/${p.id}`} className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[12px] hover:bg-white/[0.1]">
                            {p.name}
                          </Link>
                        ))}
                      </span>
                    ) : (
                      "—"
                    ),
                  },
                ]}
              />
            </>
          )}

          {tab === "Files" && original && (
            <>
              <div className="rounded-xl border border-line bg-surface-1/50">
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <FileMusic size={16} className="text-fg-2" />
                    <span className="text-[13.5px] font-semibold">Original</span>
                    <Pill tone="success">Retained</Pill>
                  </div>
                  <CodecBadge codec={original.codec} kbps={original.bitrateKbps} />
                </div>
                <KV
                  className="rounded-none border-0 bg-transparent"
                  items={[
                    { k: "Codec (from header)", v: `${codecLabel(original.codec)}${isLossless(original.codec) ? " · lossless as received" : " · lossy"}` },
                    { k: "Container", v: original.container.toUpperCase() + (original.declaredExt ? ` · .${original.declaredExt}` : "") },
                    { k: "Bitrate", v: `${original.bitrateKbps} kbps` },
                    { k: "Sample rate", v: original.sampleRateHz ? `${(original.sampleRateHz / 1000).toFixed(1)} kHz` : "—" },
                    { k: "Channels", v: original.channels ?? "—" },
                    { k: "Size", v: fmtBytes(original.sizeBytes) },
                    { k: "Duration", v: fmtDuration(original.durationSec, true) },
                    {
                      k: "SHA-256",
                      mono: true,
                      v: (
                        <button type="button" onClick={() => copyText(original.sha256, "SHA-256 copied")} className="inline-flex items-center gap-1.5 text-left hover:text-accent" title={original.sha256}>
                          {shortHash(original.sha256, 16)} <Copy size={12} />
                        </button>
                      ),
                    },
                    { k: "Path", v: original.path, mono: true },
                  ]}
                />
              </div>
              <div>
                <h4 className="mb-2 text-[13.5px] font-semibold">Derivatives</h4>
                {derivs.length ? (
                  <ul className="space-y-2">
                    {derivs.map((d) => (
                      <li key={d.id} className="rounded-xl border border-line bg-surface-1/50 px-4 py-3 text-[12.5px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-fg">Derivative · {codecLabel(d.codec)}</span>
                          <span className="text-fg-3">{fmtDate(d.createdAt)}</span>
                        </div>
                        <p className="mt-1 text-fg-2">{d.derivativeReason}</p>
                        <p className="mt-1 font-mono text-[11.5px] text-fg-3">
                          {d.path} · from {shortHash(original.sha256)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-[12.5px] text-fg-3">
                    No derivatives. The original is stored exactly as received and plays here as is — nothing is converted. Raising bitrate or converting to WAV never restores discarded information.
                  </p>
                )}
              </div>
            </>
          )}

          {tab === "Provenance" && (
            <KV
              items={[
                {
                  k: "Source URL",
                  mono: true,
                  v: track.provenance.sourceUrl.startsWith("http") ? (
                    <a href={track.provenance.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 break-all hover:text-accent">
                      {track.provenance.sourceUrl} <ExternalLink size={11} />
                    </a>
                  ) : (
                    track.provenance.sourceUrl
                  ),
                },
                { k: "Platform", v: track.provenance.sourcePlatform },
                { k: "Source ID", v: track.provenance.sourceId ?? "—", mono: true },
                { k: "Channel / uploader", v: <span>{track.provenance.channel ?? "—"} <span className="text-fg-3">· not assumed to be the artist</span></span> },
                {
                  k: "Requested reference",
                  v: track.provenance.requested ? `${track.provenance.requested.title} — ${track.provenance.requested.artist ?? "?"} (${fmtDuration(track.provenance.requested.durationSec)})` : "Direct source (no matching)",
                },
                { k: "Tool", v: tool === "local-import" ? "Local import (browser validator)" : `${ENGINE_INFO[tool].name} ${track.provenance.toolVersion}` },
                { k: "Retrieved", v: fmtDateTime(track.provenance.retrievedAt) },
                { k: "Operator", v: track.provenance.operator },
                { k: "IP address", v: track.provenance.ip, mono: true },
                { k: "Ingest job", v: job ? <Link href={`/queue?job=${job.id}`} className="font-mono hover:text-accent">{job.code}</Link> : "—" },
              ]}
            />
          )}

          {tab === "Rights" && auth && (
            <>
              <div className="rounded-xl border border-line bg-surface-1/50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="font-mono text-[12px] text-fg-3">{auth.code}</div>
                    <div className="text-[14px] font-semibold">{auth.holder}</div>
                  </div>
                  <AuthStatusBadge status={st} />
                </div>
                <KV
                  className="mt-3"
                  items={[
                    { k: "Basis", v: BASIS_LABEL[auth.basis] },
                    { k: "Scope", v: <span className="flex flex-wrap gap-1">{auth.scope.map((s) => <Pill key={s}>{SCOPE_LABEL[s]}</Pill>)}</span> },
                    { k: "Territory", v: auth.territory },
                    { k: "Valid", v: `${fmtDate(auth.validFrom)} → ${auth.validUntil ? fmtDate(auth.validUntil) : "No expiry"}` },
                    { k: "Evidence", v: auth.evidence },
                  ]}
                />
              </div>
              <Notice tone="info">Keeping a file does not grant copyright or rights for ads, broadcast or distribution. Use is limited to the client&apos;s personal listening (RC-02, RC-03).</Notice>
            </>
          )}

          {tab === "Activity" && (
            <ol className="relative space-y-3 border-l border-line pl-5">
              {events.map((e) => (
                <li key={e.id} className="relative">
                  <span className={cx("absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-surface-2", e.severity === "error" ? "bg-st-failed" : e.severity === "warning" ? "bg-warn" : "bg-fg-3")} />
                  <div className="text-[13px] text-fg">{e.message}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-fg-3">
                    {e.action} · {fmtDateTime(e.at)} · {e.actor} · {e.ip}
                  </div>
                </li>
              ))}
              {!events.length && <li className="text-[13px] text-fg-3">No recorded activity.</li>}
            </ol>
          )}
        </div>
      </Drawer>
      <EditTrackModal track={track} open={edit} onClose={() => setEdit(false)} />
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title={`Delete “${track.title}”?`}
        description={`Removes the track from the library and all playlists. ${original?.location === "external" ? `The file stays in your folder: ${original.path}` : original?.audio === "disk" ? `Its file is deleted from the library folder: ${original.path}` : "Its stored audio is deleted from this browser."} This is never done automatically and cannot be undone.`}
        confirmLabel="Delete track"
        requireText={track.code}
        onConfirm={() => {
          stopIfPlaying(track.id);
          actions.deleteTrack(track.id);
          toast({ title: "Track deleted", description: `${track.code} removed by operator.` });
          close();
        }}
      />
    </>
  );
}

export function useTrackLookup() {
  const artists = useStore((s) => s.artists);
  const files = useStore((s) => s.files);
  return {
    artistOf: (t: Track) => artists.find((a) => a.id === t.artistId),
    fileOf: (t: Track) => files.find((f) => f.id === t.originalFileId),
  };
}

