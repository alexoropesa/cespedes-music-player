"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock3, Copy, Ellipsis, ExternalLink, FingerprintPattern, ListPlus, Lock, Pencil, Plus, Search, Shuffle, Trash, UserRound, Users } from "lucide-react";
import { actions, authStatus, isUsableStatus, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { playQueue, stopIfPlaying, toggle, usePlayer } from "@/lib/player";
import { toast } from "@/lib/toast";
import { ENGINE_INFO } from "@/lib/catalog";
import { isLossless } from "@/lib/seed";
import type { Artist, ArtistTier } from "@/lib/types";
import { cx, fmtDate, fmtDuration, fmtLongDuration, fmtRelative, hashString, initials, shortHash } from "@/lib/util";
import { Button, ButtonLink, IconButton, PlayButton } from "@/components/ui/button";
import { AuthStatusBadge, CodecBadge, TierBadge } from "@/components/ui/badges";
import { Chip, Field, Input, Segmented, Select, Textarea, Checkbox } from "@/components/ui/form";
import { Body, Cover, EmptyState, EqBars, Notice, TD, TH, TR, Table } from "@/components/ui/layout";
import { ConfirmDialog, Menu, Modal } from "@/components/ui/overlay";
import { AddToPlaylistMenu, EditTrackModal, TrackDrawer, copyText } from "@/components/tracks";

type Tier = "all" | ArtistTier;
type Sort = "added" | "title" | "artist" | "duration" | "plays";

export function TracksView() {
  const tracks = useStore((s) => s.tracks);
  const artists = useStore((s) => s.artists);
  const files = useStore((s) => s.files);
  const auths = useStore((s) => s.authorizations);
  const now = useNow();
  const player = usePlayer();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tier, setTier] = useState<Tier>("all");
  const [quality, setQuality] = useState<"all" | "lossless" | "lossy">("all");
  const [usableOnly, setUsableOnly] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("added");
  const [selected, setSelected] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const openTrack = params.get("track");

  const setTrackParam = (id: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (id) sp.set("track", id);
    else sp.delete("track");
    router.replace(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  };

  const artistOf = (id: string) => artists.find((a) => a.id === id);
  const fileOf = (id: string) => files.find((f) => f.id === id);
  const usable = (authId: string) => isUsableStatus(authStatus(auths.find((a) => a.id === authId), now));
  const ql = q.trim().toLowerCase();
  const rows = tracks
    .filter((t) => tier === "all" || artistOf(t.artistId)?.tier === tier)
    .filter((t) => quality === "all" || (quality === "lossless") === isLossless(fileOf(t.originalFileId)?.codec ?? ""))
    .filter((t) => !usableOnly || usable(t.authorizationId))
    .filter((t) => !ql || `${t.title} ${artistOf(t.artistId)?.name ?? ""} ${t.album ?? ""} ${t.code}`.toLowerCase().includes(ql))
    .sort((a, b) =>
      sort === "title"
        ? a.title.localeCompare(b.title)
        : sort === "artist"
          ? (artistOf(a.artistId)?.name ?? "").localeCompare(artistOf(b.artistId)?.name ?? "")
          : sort === "duration"
            ? b.durationSec - a.durationSec
            : sort === "plays"
              ? b.plays - a.plays
              : b.addedAt - a.addedAt,
    );
  const playable = rows.filter((t) => usable(t.authorizationId)).map((t) => t.id);
  const count = (t: Tier) => tracks.filter((x) => t === "all" || artistOf(x.artistId)?.tier === t).length;
  const allSel = rows.length > 0 && rows.every((r) => selected.includes(r.id));
  const editTrack = tracks.find((t) => t.id === editId) ?? null;
  const delTrack = tracks.find((t) => t.id === delId);
  const contextPlaying = player.context?.kind === "library" && player.context.label === "Library" && player.playing;

  return (
    <Body>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <PlayButton
          size="lg"
          playing={contextPlaying}
          disabled={!playable.length}
          label={contextPlaying ? "Pause" : "Play filtered tracks"}
          onClick={() => (contextPlaying ? toggle() : playQueue(playable, 0, { kind: "library", label: "Library" }))}
        />
        <IconButton label="Shuffle play" size="lg" disabled={!playable.length} onClick={() => playQueue([...playable].sort(() => Math.random() - 0.5), 0, { kind: "library", label: "Library · shuffle" })}>
          <Shuffle size={20} />
        </IconButton>
        <div className="mr-auto text-[12.5px] text-fg-3">
          {rows.length} tracks · {fmtLongDuration(rows.reduce((a, t) => a + t.durationSec, 0))} · plays from local files, no internet needed
        </div>
        {selected.length > 0 && (
          <div className="flex items-center gap-2 rounded-full border border-line-strong bg-surface-3 py-1 pl-3 pr-1">
            <span className="text-[12.5px] font-semibold">{selected.length} selected</span>
            <AddToPlaylistMenu
              trackIds={selected}
              trigger={(p) => (
                <Button {...p} size="xs" variant="primary" icon={<ListPlus size={13} />}>
                  Add to playlist
                </Button>
              )}
            />
            <Button size="xs" variant="ghost" onClick={() => setSelected([])}>
              Clear
            </Button>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["all", "established", "independent"] as Tier[]).map((t) => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)} count={count(t)}>
            {t === "all" ? "All artists" : t === "established" ? "Established" : "Independent"}
          </Chip>
        ))}
        <span className="mx-1 h-5 w-px bg-line-strong" />
        <Segmented
          size="sm"
          label="Codec"
          value={quality}
          onChange={setQuality}
          options={[
            { value: "all", label: "Any codec" },
            { value: "lossless", label: "Lossless" },
            { value: "lossy", label: "Lossy" },
          ]}
        />
        <div className="ml-1">
          <Checkbox checked={usableOnly} onChange={setUsableOnly} label={<span className="text-[12.5px] font-normal text-fg-2">Usable only</span>} />
        </div>
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="w-44" aria-label="Sort">
            <option value="added">Recently added</option>
            <option value="title">Title</option>
            <option value="artist">Artist</option>
            <option value="duration">Duration</option>
            <option value="plays">Most played</option>
          </Select>
          <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in library" className="flex-1 sm:w-60" aria-label="Search library" />
        </div>
      </div>

      {rows.length ? (
        <Table>
          <thead>
            <tr>
              <TH className="w-10">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSel}
                  onChange={() => setSelected(allSel ? [] : rows.map((r) => r.id))}
                  className="size-4 cursor-pointer accent-[var(--color-accent)]"
                />
              </TH>
              <TH className="w-10">#</TH>
              <TH>Title</TH>
              <TH className="hidden xl:table-cell">Album</TH>
              <TH>Real codec</TH>
              <TH className="hidden 2xl:table-cell">Source</TH>
              <TH>Rights</TH>
              <TH className="hidden lg:table-cell">Added</TH>
              <TH align="right">
                <Clock3 size={14} className="ml-auto" aria-label="Duration" />
              </TH>
              <TH className="w-20" />
            </tr>
          </thead>
          <tbody>
            {rows.map((t, i) => {
              const a = artistOf(t.artistId);
              const f = fileOf(t.originalFileId);
              const auth = auths.find((x) => x.id === t.authorizationId);
              const st = authStatus(auth, now);
              const ok = isUsableStatus(st);
              const isCur = player.queue[player.index] === t.id;
              return (
                <TR key={t.id} onClick={() => setTrackParam(t.id)} selected={openTrack === t.id || selected.includes(t.id)}>
                  <TD>
                    <input
                      type="checkbox"
                      aria-label={`Select ${t.title}`}
                      checked={selected.includes(t.id)}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => setSelected(selected.includes(t.id) ? selected.filter((x) => x !== t.id) : [...selected, t.id])}
                      className="size-4 cursor-pointer accent-[var(--color-accent)]"
                    />
                  </TD>
                  <TD className="text-fg-3">
                    <div className="relative flex size-6 items-center justify-center">
                      {isCur && player.playing ? <EqBars /> : <span className={cx("tabular-nums group-hover:invisible", isCur && "text-accent")}>{i + 1}</span>}
                      <button
                        type="button"
                        aria-label={ok ? `Play ${t.title}` : "Not usable"}
                        disabled={!ok}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCur) toggle();
                          else playQueue(playable, Math.max(0, playable.indexOf(t.id)), { kind: "library", label: "Library" });
                        }}
                        className="invisible absolute inset-0 flex items-center justify-center text-fg group-hover:visible disabled:text-fg-3"
                      >
                        {ok ? (
                          isCur && player.playing ? (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><rect x="3" y="2" width="3.6" height="12" rx="1" /><rect x="9.4" y="2" width="3.6" height="12" rx="1" /></svg>
                          ) : (
                            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M4 2.6v10.8c0 .8.9 1.3 1.6.9l8.6-5.4a1 1 0 0 0 0-1.8L5.6 1.7C4.9 1.3 4 1.8 4 2.6Z" /></svg>
                          )
                        ) : (
                          <Lock size={13} />
                        )}
                      </button>
                    </div>
                  </TD>
                  <TD className="max-w-[340px]">
                    <div className="flex items-center gap-3">
                      <Cover seed={t.coverSeed} size={40} />
                      <div className="min-w-0">
                        <div className={cx("truncate font-semibold", isCur ? "text-accent" : ok ? "text-fg" : "text-fg-2")}>{t.title}</div>
                        <div className="flex items-center gap-1.5 truncate text-[12px] text-fg-2">
                          {a?.name}
                          {a && <span className={cx("inline-block size-1.5 rounded-full", a.tier === "established" ? "bg-accent" : "bg-st-downloading")} title={a.tier === "established" ? "Established" : "Independent"} />}
                        </div>
                      </div>
                    </div>
                  </TD>
                  <TD className="hidden max-w-[180px] truncate text-fg-2 xl:table-cell">{t.album ?? "—"}</TD>
                  <TD>{f && <CodecBadge codec={f.codec} kbps={f.bitrateKbps} />}</TD>
                  <TD className="hidden whitespace-nowrap text-[12px] text-fg-2 2xl:table-cell">{t.provenance.tool === "local-import" ? "Local import" : ENGINE_INFO[t.provenance.tool].name} · {t.provenance.sourcePlatform}</TD>
                  <TD>{ok && st === "active" ? <span className="text-[12px] text-fg-3">{auth?.code}</span> : <AuthStatusBadge status={st} />}</TD>
                  <TD className="hidden whitespace-nowrap text-[12px] text-fg-3 lg:table-cell">{fmtRelative(t.addedAt, now)}</TD>
                  <TD align="right" className="font-mono text-[12.5px] tabular-nums text-fg-2">
                    {fmtDuration(t.durationSec)}
                  </TD>
                  <TD>
                    <div className="flex items-center justify-end gap-0.5 opacity-60 group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
                      <AddToPlaylistMenu trackIds={[t.id]} disabled={!ok} />
                      <Menu
                        items={[
                          { label: "Open details", icon: <ExternalLink size={15} />, onSelect: () => setTrackParam(t.id) },
                          { label: "Edit details", icon: <Pencil size={15} />, onSelect: () => setEditId(t.id) },
                          { label: "Copy SHA-256", icon: <Copy size={15} />, onSelect: () => f && copyText(f.sha256, "SHA-256 copied") },
                          { separator: true, label: "s" },
                          { label: "Delete from library…", icon: <Trash size={15} />, danger: true, onSelect: () => setDelId(t.id) },
                        ]}
                        trigger={(p) => (
                          <IconButton label="More" {...p}>
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
        <EmptyState title="No tracks match" description="Adjust the filters, or import a track." action={<ButtonLink href="/ingest" variant="primary">Import track</ButtonLink>} />
      )}
      <TrackDrawer trackId={openTrack} onClose={() => setTrackParam(null)} />
      <EditTrackModal track={editTrack} open={!!editTrack} onClose={() => setEditId(null)} />
      <ConfirmDialog
        open={!!delTrack}
        onClose={() => setDelId(null)}
        title={`Delete “${delTrack?.title}”?`}
        description={(() => {
          const f = files.find((x) => x.id === delTrack?.originalFileId);
          return `Removes the track from the library and every playlist. ${f?.location === "external" ? "The file stays in your music folder." : f?.audio === "disk" ? "Its file is deleted from the library folder." : "Its stored audio is deleted from this browser."} Never automatic; cannot be undone.`;
        })()}
        confirmLabel="Delete track"
        requireText={delTrack?.code}
        onConfirm={() => {
          if (!delTrack) return;
          stopIfPlaying(delTrack.id);
          actions.deleteTrack(delTrack.id);
          toast({ title: "Track deleted", description: `${delTrack.code} removed by operator.` });
        }}
      />
    </Body>
  );
}

/* ------------------------------------------------------------------ */

function Avatar({ name, size = 120 }: { name: string; size?: number }) {
  const h = hashString(name) % 360;
  return (
    <div
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full font-extrabold text-white/90 shadow-[0_10px_30px_-10px_rgb(0_0_0/0.8)]"
      style={{ width: size, height: size, fontSize: size / 3, background: `radial-gradient(circle at 30% 25%, hsl(${h} 45% 52%), hsl(${(h + 50) % 360} 50% 18%))` }}
    >
      {initials(name)}
    </div>
  );
}

const emptyArtist = { name: "", tier: "independent" as ArtistTier, country: "", notes: "" };

export function ArtistsView() {
  const artists = useStore((s) => s.artists);
  const tracks = useStore((s) => s.tracks);
  const [tier, setTier] = useState<Tier>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Artist | "new" | null>(null);
  const [form, setForm] = useState(emptyArtist);
  const [confirmDel, setConfirmDel] = useState(false);

  const list = artists
    .filter((a) => tier === "all" || a.tier === tier)
    .filter((a) => !q.trim() || a.name.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  const openEdit = (a: Artist | "new") => {
    setEditing(a);
    setForm(a === "new" ? emptyArtist : { name: a.name, tier: a.tier, country: a.country ?? "", notes: a.notes ?? "" });
  };
  const editingArtist = editing && editing !== "new" ? editing : null;
  const theirTracks = editingArtist ? tracks.filter((t) => t.artistId === editingArtist.id) : [];

  return (
    <Body>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["all", "established", "independent"] as Tier[]).map((t) => (
          <Chip key={t} active={tier === t} onClick={() => setTier(t)} count={artists.filter((a) => t === "all" || a.tier === t).length}>
            {t === "all" ? "All" : t === "established" ? "Established" : "Independent"}
          </Chip>
        ))}
        <div className="ml-auto flex w-full gap-2 sm:w-auto">
          <Input icon={<Search size={15} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search artists" className="flex-1 sm:w-56" aria-label="Search artists" />
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openEdit("new")}>
            New artist
          </Button>
        </div>
      </div>
      <Notice className="mb-5">Established = catalog or label presence; Independent = self-released or small labels. The repertoire covers both. The tier is set by the operator — never inferred from a source channel.</Notice>
      {list.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {list.map((a) => {
            const n = tracks.filter((t) => t.artistId === a.id).length;
            return (
              <button key={a.id} type="button" onClick={() => openEdit(a)} className="group flex flex-col items-center rounded-xl p-4 text-center transition-colors hover:bg-white/[0.05]">
                <Avatar name={a.name} />
                <div className="mt-3 w-full truncate text-[14px] font-bold">{a.name}</div>
                <div className="mt-1 flex items-center gap-1.5">
                  <TierBadge tier={a.tier} />
                </div>
                <div className="mt-1.5 text-[12px] text-fg-3">
                  {n} track{n === 1 ? "" : "s"}
                  {a.country ? ` · ${a.country}` : ""}
                </div>
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Users size={22} />} title="No artists" description="Create one, or confirm a new artist while ingesting a track." />
      )}

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "New artist" : "Edit artist"}
        icon={<UserRound size={18} />}
        size="lg"
        footer={
          <>
            {editingArtist && (
              <Button variant="danger" size="sm" className="mr-auto" disabled={theirTracks.length > 0} title={theirTracks.length ? "Artists with tracks can't be deleted" : undefined} onClick={() => setConfirmDel(true)}>
                Delete artist
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!form.name.trim()}
              onClick={() => {
                if (editing === "new") actions.createArtist({ name: form.name.trim(), tier: form.tier, country: form.country.trim() || undefined, notes: form.notes.trim() || undefined });
                else if (editingArtist) actions.updateArtist(editingArtist.id, { name: form.name.trim(), tier: form.tier, country: form.country.trim() || undefined, notes: form.notes.trim() || undefined });
                toast({ tone: "success", title: editing === "new" ? "Artist created" : "Artist updated" });
                setEditing(null);
              }}
            >
              {editing === "new" ? "Create artist" : "Save"}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6 sm:flex-row">
          <Avatar name={form.name || "?"} size={132} />
          <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
            <Field label="Name" className="sm:col-span-2">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Repertoire tier">
              <Segmented label="Tier" value={form.tier} onChange={(tier) => setForm({ ...form, tier })} options={[{ value: "established", label: "Established" }, { value: "independent", label: "Independent" }]} />
            </Field>
            <Field label="Country" optional>
              <Input value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} placeholder="ISO code, e.g. ES" />
            </Field>
            <Field label="Notes" optional className="sm:col-span-2">
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </div>
        </div>
        {editingArtist && (
          <div className="mt-6">
            <div className="mb-2 text-[12.5px] font-semibold text-fg-2">Tracks in library</div>
            {theirTracks.length ? (
              <ul className="divide-y divide-line rounded-xl border border-line">
                {theirTracks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
                    <Cover seed={t.coverSeed} size={32} />
                    <Link href={`/library?track=${t.id}`} onClick={() => setEditing(null)} className="flex-1 truncate font-medium hover:underline">
                      {t.title}
                    </Link>
                    <span className="font-mono text-[12px] text-fg-3">{fmtDuration(t.durationSec)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-fg-3">No tracks yet.</p>
            )}
          </div>
        )}
      </Modal>
      <ConfirmDialog
        open={confirmDel}
        onClose={() => setConfirmDel(false)}
        title={`Delete ${editingArtist?.name}?`}
        description="Only artists without tracks can be deleted."
        confirmLabel="Delete artist"
        onConfirm={() => {
          if (editingArtist) actions.deleteArtist(editingArtist.id);
          setEditing(null);
        }}
      />
    </Body>
  );
}

/* ------------------------------------------------------------------ */

export function DuplicatesView() {
  const dups = useStore((s) => s.duplicates);
  const tracks = useStore((s) => s.tracks);
  const jobs = useStore((s) => s.jobs);
  const now = useNow();
  const [showDismissed, setShowDismissed] = useState(false);
  const list = dups.filter((d) => showDismissed || !d.dismissed).sort((a, b) => b.at - a.at);
  return (
    <Body>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Notice className="flex-1" title="Detected by SHA-256 before entering the library">
          When a validated file has the same hash as one already stored, no second copy is added and the job ends as failed (Duplicate). The existing original stays untouched.
        </Notice>
      </div>
      <div className="mb-4">
        <Checkbox checked={showDismissed} onChange={setShowDismissed} label={<span className="text-[13px] font-normal text-fg-2">Show dismissed alerts</span>} />
      </div>
      {list.length ? (
        <div className="space-y-3">
          {list.map((d) => {
            const existing = tracks.find((t) => t.id === d.existingTrackId);
            const job = jobs.find((j) => j.id === d.jobId);
            return (
              <div key={d.id} className={cx("flex flex-col gap-4 rounded-[14px] border border-line bg-surface-2/60 p-4 sm:flex-row sm:items-center", d.dismissed && "opacity-60")}>
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-warn/10 text-warn">
                  <FingerprintPattern size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">
                    “{d.title}” matches {existing ? <Link href={`/library?track=${existing.id}`} className="text-accent hover:underline">{existing.code} · {existing.title}</Link> : "a deleted track"}
                  </div>
                  <div className="mt-1 break-all font-mono text-[11.5px] text-fg-3">
                    sha256 {shortHash(d.sha256, 20)} · {d.sourceUrl}
                  </div>
                  <div className="mt-1 text-[12px] text-fg-3">
                    {job ? <Link href={`/queue?job=${job.id}`} className="font-mono hover:text-fg">{job.code}</Link> : "—"} · {fmtRelative(d.at, now)} · {fmtDate(d.at)}
                  </div>
                </div>
                {!d.dismissed && (
                  <Button size="sm" variant="secondary" onClick={() => actions.dismissDuplicate(d.id)}>
                    Dismiss
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<FingerprintPattern size={22} />} title="No duplicate alerts" description="Duplicate attempts will show up here with the matching library track." />
      )}
    </Body>
  );
}
