"use client";

import { use, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Clock3, Ellipsis, GripVertical, HardDrive, ListMusic, Lock, Pencil, Plus, Search, Shuffle, Trash, X } from "lucide-react";
import { actions, authStatus, isUsableStatus, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { playQueue, toggle, usePlayer } from "@/lib/player";
import { toast } from "@/lib/toast";
import type { Playlist } from "@/lib/types";
import { cx, fmtDuration, fmtLongDuration, fmtRelative } from "@/lib/util";
import { Button, IconButton, PlayButton } from "@/components/ui/button";
import { CodecBadge, Pill } from "@/components/ui/badges";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Body, Cover, EmptyState, EqBars, Notice, PageHeader, PLAYLIST_COLORS } from "@/components/ui/layout";
import { ConfirmDialog, Menu, Modal } from "@/components/ui/overlay";
import { TrackDrawer } from "@/components/tracks";

/* ------------------------------------------------------------------ */
/* Edit details modal (Spotify-style: cover left, fields right)         */
/* ------------------------------------------------------------------ */

export function PlaylistModal({ open, onClose, playlist }: { open: boolean; onClose: () => void; playlist?: Playlist }) {
  const [form, setForm] = useState({ name: "", description: "", color: "iris" });
  const [loaded, setLoaded] = useState<string | null>(null);
  const key = playlist?.id ?? "new";
  if (open && loaded !== key) {
    setLoaded(key);
    setForm(playlist ? { name: playlist.name, description: playlist.description, color: playlist.color } : { name: "", description: "", color: "iris" });
  }
  const close = () => {
    setLoaded(null);
    onClose();
  };
  const router = useRouter();
  const save = () => {
    if (playlist) {
      actions.updatePlaylist(playlist.id, { name: form.name.trim(), description: form.description.trim(), color: form.color });
      toast({ title: "Details saved" });
      close();
    } else {
      const p = actions.createPlaylist({ name: form.name.trim(), description: form.description.trim(), color: form.color });
      toast({ tone: "success", title: "Playlist created", description: "Add ready tracks from the library." });
      close();
      router.push(`/playlists/${p.id}`);
    }
  };
  return (
    <Modal open={open} onClose={close} title={playlist ? "Edit details" : "Create playlist"} size="md">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (form.name.trim()) save();
        }}
        className="flex flex-col gap-5 sm:flex-row"
      >
        <div className="shrink-0">
          <Cover seed={key} color={form.color} size={168} rounded="rounded-xl" className="shadow-[0_16px_40px_-12px_rgb(0_0_0/0.8)]" label={form.name || "Untitled"} />
          <div className="mt-3 flex flex-wrap gap-1.5" role="radiogroup" aria-label="Cover color">
            {Object.entries(PLAYLIST_COLORS).map(([name, [c1, c2]]) => (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={form.color === name}
                aria-label={`${name} cover`}
                onClick={() => setForm({ ...form, color: name })}
                className={cx("size-6 rounded-full ring-offset-2 ring-offset-surface-2 transition", form.color === name ? "ring-2 ring-fg" : "hover:scale-110")}
                style={{ background: `linear-gradient(140deg, ${c1}, ${c2})` }}
              />
            ))}
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Add a name" data-autofocus />
          </Field>
          <Field label="Description" optional>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Add an optional description" rows={4} />
          </Field>
          <div className="mt-auto flex justify-end">
            <Button type="submit" variant="primary" size="lg" disabled={!form.name.trim()}>
              Save
            </Button>
          </div>
        </div>
      </form>
      <p className="mt-4 text-[11.5px] leading-relaxed text-fg-3">Local playlists only hold ready tracks from this library. Online provider playlists are managed separately; mixing both is pending a terms review (TBD-12).</p>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */

export function PlaylistsView() {
  const playlists = useStore((s) => s.playlists);
  const tracks = useStore((s) => s.tracks);
  const auths = useStore((s) => s.authorizations);
  const now = useNow();
  const player = usePlayer();
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<Playlist | null>(null);
  const [del, setDel] = useState<Playlist | null>(null);
  const [q, setQ] = useState("");
  const list = playlists.filter((p) => !q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt);
  const usableIds = (p: Playlist) => p.trackIds.filter((id) => {
    const t = tracks.find((x) => x.id === id);
    return t && isUsableStatus(authStatus(auths.find((a) => a.id === t.authorizationId), now));
  });

  return (
    <>
      <PageHeader
        eyebrow="Playlists"
        title="Your playlists"
        description="Ordered selections of ready tracks. They play from local files, so they keep working without internet."
        actions={
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setCreate(true)}>
            Create playlist
          </Button>
        }
      />
      <Body>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search playlists" className="w-full sm:w-72" aria-label="Search playlists" />
          <span className="text-[12.5px] text-fg-3">{playlists.length} playlists</span>
        </div>
        {list.length ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
            {list.map((p) => {
              const ids = usableIds(p);
              const dur = p.trackIds.reduce((a, id) => a + (tracks.find((t) => t.id === id)?.durationSec ?? 0), 0);
              const playing = player.playing && player.context?.kind === "playlist" && player.context.id === p.id;
              return (
                <div key={p.id} className="group relative rounded-xl p-3 transition-colors hover:bg-white/[0.05]">
                  <div className="relative">
                    <Link href={`/playlists/${p.id}`} aria-label={`Open ${p.name}`}>
                      <Cover seed={p.id} color={p.color} size={400} rounded="rounded-lg" label={p.name} className="aspect-square !h-auto !w-full shadow-[0_10px_30px_-12px_rgb(0_0_0/0.8)]" />
                    </Link>
                    <div className={cx("absolute bottom-2 right-2 translate-y-1 opacity-0 transition-all group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:translate-y-0 group-hover:opacity-100", playing && "translate-y-0 opacity-100")}>
                      <PlayButton playing={playing} disabled={!ids.length} onClick={() => (playing ? toggle() : playQueue(ids, 0, { kind: "playlist", id: p.id, label: p.name }))} />
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-1">
                    <Link href={`/playlists/${p.id}`} className="min-w-0 flex-1">
                      <span className={cx("block truncate text-[14px] font-bold", playing && "text-accent")}>{p.name}</span>
                      <span className="block truncate text-[12px] text-fg-3">
                        {p.trackIds.length} tracks · {fmtLongDuration(dur)}
                      </span>
                    </Link>
                    <Menu
                      items={[
                        { label: "Edit details", icon: <Pencil size={15} />, onSelect: () => setEdit(p) },
                        { label: "Delete playlist", icon: <Trash size={15} />, danger: true, onSelect: () => setDel(p) },
                      ]}
                      trigger={(pp) => (
                        <IconButton label="Playlist actions" size="sm" {...pp}>
                          <Ellipsis size={16} />
                        </IconButton>
                      )}
                    />
                  </div>
                </div>
              );
            })}
            <button type="button" onClick={() => setCreate(true)} className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong p-3 text-fg-2 transition-colors hover:border-white/25 hover:text-fg">
              <Plus size={22} />
              <span className="text-[13px] font-semibold">New playlist</span>
            </button>
          </div>
        ) : (
          <EmptyState icon={<ListMusic size={22} />} title="Create your first playlist" description="It's easy — pick a name, then add ready tracks from the library." action={<Button variant="primary" onClick={() => setCreate(true)}>Create playlist</Button>} />
        )}
      </Body>
      <PlaylistModal open={create} onClose={() => setCreate(false)} />
      <PlaylistModal open={!!edit} onClose={() => setEdit(null)} playlist={edit ?? undefined} />
      <ConfirmDialog
        open={!!del}
        onClose={() => setDel(null)}
        title={`Delete “${del?.name}”?`}
        description="The playlist is removed. Its tracks stay in the library."
        confirmLabel="Delete playlist"
        onConfirm={() => {
          if (del) actions.deletePlaylist(del.id);
          toast({ title: "Playlist deleted" });
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

export function PlaylistDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const playlists = useStore((s) => s.playlists);
  const tracks = useStore((s) => s.tracks);
  const artists = useStore((s) => s.artists);
  const files = useStore((s) => s.files);
  const auths = useStore((s) => s.authorizations);
  const operator = useStore((s) => s.settings.operator);
  const now = useNow();
  const player = usePlayer();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [editOpen, setEditOpen] = useState(() => sp.get("edit") === "1");
  const [del, setDel] = useState(false);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const [find, setFind] = useState("");
  const [openTrack, setOpenTrack] = useState<string | null>(null);

  const p = playlists.find((x) => x.id === id);
  if (!p) {
    return (
      <Body className="pt-10">
        <EmptyState icon={<ListMusic size={22} />} title="Playlist not found" description="It may have been deleted." action={<Link href="/playlists" className="text-[13px] font-semibold text-accent hover:underline">Back to playlists</Link>} />
      </Body>
    );
  }
  const items = p.trackIds.map((tid, idx) => ({ idx, t: tracks.find((x) => x.id === tid) })).filter((x): x is { idx: number; t: NonNullable<typeof x.t> } => !!x.t);
  const usable = (authId: string) => isUsableStatus(authStatus(auths.find((a) => a.id === authId), now));
  const playableIds = items.filter((x) => usable(x.t.authorizationId)).map((x) => x.t.id);
  const total = items.reduce((a, x) => a + x.t.durationSec, 0);
  const isCtx = player.context?.kind === "playlist" && player.context.id === p.id;
  const fq = find.trim().toLowerCase();
  const candidates = tracks
    .filter((t) => !p.trackIds.includes(t.id) && usable(t.authorizationId))
    .filter((t) => !fq || `${t.title} ${artists.find((a) => a.id === t.artistId)?.name ?? ""} ${t.album ?? ""}`.toLowerCase().includes(fq))
    .slice(0, fq ? 12 : 6);
  const [c1] = PLAYLIST_COLORS[p.color] ?? PLAYLIST_COLORS.iris;

  const closeEdit = () => {
    setEditOpen(false);
    if (sp.get("edit")) router.replace(pathname, { scroll: false });
  };

  return (
    <>
      <div className="relative" style={{ background: `linear-gradient(180deg, color-mix(in oklab, ${c1} 55%, transparent) 0%, transparent 100%)` }}>
        <div className="flex flex-col gap-6 px-5 pb-6 pt-10 sm:flex-row sm:items-end sm:px-8">
          <button type="button" onClick={() => setEditOpen(true)} className="group relative shrink-0 self-start" aria-label="Edit details">
            <Cover seed={p.id} color={p.color} size={208} rounded="rounded-xl" className="shadow-[0_24px_60px_-12px_rgb(0_0_0/0.85)]" />
            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-xl bg-black/55 text-[13px] font-semibold opacity-0 transition-opacity group-hover:opacity-100">
              <Pencil size={26} /> Choose cover
            </span>
          </button>
          <div className="min-w-0">
            <div className="text-[12.5px] font-semibold">Playlist</div>
            <button type="button" onClick={() => setEditOpen(true)} className="block max-w-full text-left">
              <h1 className="mt-1 break-words text-[40px] font-black leading-[0.95] tracking-[-0.04em] sm:text-[64px] xl:text-[80px]">{p.name}</h1>
            </button>
            {p.description && <p className="mt-3 text-[14px] text-fg-2">{p.description}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-fg-2">
              <span className="font-bold text-fg">{operator.name}</span>·<span>{items.length} tracks, {fmtLongDuration(total)}</span>·<span>updated {fmtRelative(p.updatedAt, now)}</span>
              <Pill icon={<HardDrive size={11} />} className="ml-1">
                Offline-ready
              </Pill>
            </div>
          </div>
        </div>
      </div>

      <Body className="pt-4">
        <div className="mb-5 flex items-center gap-3">
          <PlayButton
            size="lg"
            playing={isCtx && player.playing}
            disabled={!playableIds.length}
            onClick={() => (isCtx ? toggle() : playQueue(playableIds, 0, { kind: "playlist", id: p.id, label: p.name }))}
          />
          <IconButton label="Shuffle play" size="lg" disabled={!playableIds.length} onClick={() => playQueue([...playableIds].sort(() => Math.random() - 0.5), 0, { kind: "playlist", id: p.id, label: `${p.name} · shuffle` })}>
            <Shuffle size={20} />
          </IconButton>
          <Menu
            items={[
              { label: "Edit details", icon: <Pencil size={15} />, onSelect: () => setEditOpen(true) },
              { label: "Delete playlist", icon: <Trash size={15} />, danger: true, onSelect: () => setDel(true) },
            ]}
            trigger={(pp) => (
              <IconButton label="More options" size="lg" {...pp}>
                <Ellipsis size={22} />
              </IconButton>
            )}
          />
        </div>

        {items.length ? (
          <div className="rounded-[14px] border border-line">
            <div className="grid grid-cols-[28px_32px_minmax(0,1fr)_84px_64px_72px] items-center gap-3 border-b border-line px-3 py-2 text-[11.5px] font-semibold text-fg-3 md:grid-cols-[28px_32px_minmax(0,1.3fr)_minmax(0,1fr)_84px_64px_72px]">
              <span />
              <span>#</span>
              <span>Title</span>
              <span className="hidden md:block">Album</span>
              <span>Codec</span>
              <Clock3 size={14} className="justify-self-end" aria-label="Duration" />
              <span />
            </div>
            <ol>
              {items.map(({ t, idx }, pos) => {
                const a = artists.find((x) => x.id === t.artistId);
                const f = files.find((x) => x.id === t.originalFileId);
                const ok = usable(t.authorizationId);
                const isCur = isCtx && player.queue[player.index] === t.id;
                return (
                  <li
                    key={`${t.id}-${idx}`}
                    draggable
                    onDragStart={(e) => {
                      setDragIdx(idx);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOverIdx(idx);
                    }}
                    onDragEnd={() => {
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (dragIdx != null && dragIdx !== idx) actions.movePlaylistTrack(p.id, dragIdx, idx);
                      setDragIdx(null);
                      setOverIdx(null);
                    }}
                    className={cx(
                      "group grid grid-cols-[28px_32px_minmax(0,1fr)_84px_64px_72px] items-center gap-3 border-b border-line px-3 py-2 last:border-b-0 md:grid-cols-[28px_32px_minmax(0,1.3fr)_minmax(0,1fr)_84px_64px_72px]",
                      dragIdx === idx ? "opacity-40" : "hover:bg-white/[0.04]",
                      overIdx === idx && dragIdx !== idx && "shadow-[inset_0_2px_0_var(--color-accent)]",
                    )}
                  >
                    <span className="cursor-grab text-fg-3 opacity-0 group-hover:opacity-100" title="Drag to reorder">
                      <GripVertical size={16} />
                    </span>
                    <span className="relative flex size-6 items-center justify-center text-[13px] text-fg-3">
                      {isCur && player.playing ? <EqBars /> : <span className={cx("tabular-nums group-hover:invisible", isCur && "text-accent")}>{pos + 1}</span>}
                      <button
                        type="button"
                        disabled={!ok}
                        aria-label={ok ? `Play ${t.title}` : "Not usable"}
                        onClick={() => (isCur ? toggle() : playQueue(playableIds, Math.max(0, playableIds.indexOf(t.id)), { kind: "playlist", id: p.id, label: p.name }))}
                        className="invisible absolute inset-0 flex items-center justify-center text-fg group-hover:visible disabled:text-fg-3"
                      >
                        {ok ? <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.6v10.8c0 .8.9 1.3 1.6.9l8.6-5.4a1 1 0 0 0 0-1.8L5.6 1.7C4.9 1.3 4 1.8 4 2.6Z" /></svg> : <Lock size={13} />}
                      </button>
                    </span>
                    <button type="button" onClick={() => setOpenTrack(t.id)} className="flex min-w-0 items-center gap-3 text-left">
                      <Cover seed={t.coverSeed} size={40} />
                      <span className="min-w-0">
                        <span className={cx("block truncate text-[13.5px] font-semibold", isCur ? "text-accent" : ok ? "text-fg" : "text-fg-3 line-through decoration-fg-3/50")}>{t.title}</span>
                        <span className="block truncate text-[12px] text-fg-2">
                          {a?.name}
                          {!ok && " · not usable — skipped on play"}
                        </span>
                      </span>
                    </button>
                    <span className="hidden truncate text-[13px] text-fg-2 md:block">{t.album ?? "—"}</span>
                    <span>{f && <CodecBadge codec={f.codec} />}</span>
                    <span className="text-right font-mono text-[12.5px] tabular-nums text-fg-2">{fmtDuration(t.durationSec)}</span>
                    <span className="flex justify-end gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                      <IconButton label="Move up" size="sm" disabled={pos === 0} onClick={() => actions.movePlaylistTrack(p.id, idx, items[pos - 1].idx)}>
                        <ArrowUp size={14} />
                      </IconButton>
                      <IconButton label="Move down" size="sm" disabled={pos === items.length - 1} onClick={() => actions.movePlaylistTrack(p.id, idx, items[pos + 1].idx)}>
                        <ArrowDown size={14} />
                      </IconButton>
                      <IconButton
                        label="Remove from playlist"
                        size="sm"
                        onClick={() => {
                          actions.removeFromPlaylist(p.id, idx);
                          toast({ title: "Removed from playlist", description: `“${t.title}” is still in the library.` });
                        }}
                      >
                        <X size={14} />
                      </IconButton>
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : (
          <Notice className="mb-2">This playlist is empty. Add ready tracks from the library below.</Notice>
        )}

        <section className="mt-10">
          <h2 className="text-[20px] font-extrabold tracking-[-0.02em]">Let&apos;s find something for your playlist</h2>
          <p className="mt-1 text-[13px] text-fg-3">Only ready, usable tracks from the local library can be added — never a pending reference.</p>
          <Input icon={<Search size={15} />} value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search for songs in the library" className="mt-4 max-w-md" aria-label="Find tracks to add" />
          <ul className="mt-3">
            {candidates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-white/[0.04]">
                <Cover seed={t.coverSeed} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13.5px] font-semibold">{t.title}</div>
                  <div className="truncate text-[12px] text-fg-3">{artists.find((a) => a.id === t.artistId)?.name}</div>
                </div>
                <span className="hidden truncate text-[12.5px] text-fg-3 sm:block">{t.album}</span>
                <span className="w-12 text-right font-mono text-[12px] text-fg-3">{fmtDuration(t.durationSec)}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    actions.addToPlaylist(p.id, [t.id]);
                    toast({ title: `Added to ${p.name}` });
                  }}
                >
                  Add
                </Button>
              </li>
            ))}
            {!candidates.length && <li className="px-2 py-4 text-[13px] text-fg-3">{fq ? "No usable tracks match." : "Every usable track is already in this playlist."}</li>}
          </ul>
        </section>
      </Body>

      <PlaylistModal open={editOpen} onClose={closeEdit} playlist={p} />
      <ConfirmDialog
        open={del}
        onClose={() => setDel(false)}
        title={`Delete “${p.name}”?`}
        description="The playlist is removed. Its tracks stay in the library."
        confirmLabel="Delete playlist"
        onConfirm={() => {
          actions.deletePlaylist(p.id);
          toast({ title: "Playlist deleted" });
          router.push("/playlists");
        }}
      />
      <TrackDrawer trackId={openTrack} onClose={() => setOpenTrack(null)} />
    </>
  );
}
