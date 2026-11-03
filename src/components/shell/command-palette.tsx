"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Disc3, FileUp, Link2, ListMusic, Plus, Search, SearchCheck, Workflow } from "lucide-react";
import { NAV_GROUPS } from "./nav";
import { actions, useStore, trackUsable } from "@/lib/store";
import { playQueue } from "@/lib/player";
import { useNow } from "@/lib/clock";
import { cx, fmtDuration } from "@/lib/util";
import { Kbd } from "@/components/ui/badges";

interface Item {
  id: string;
  group: string;
  label: string;
  sub?: string;
  icon: React.ReactNode;
  run: () => void;
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const tracks = useStore((s) => s.tracks);
  const artists = useStore((s) => s.artists);
  const playlists = useStore((s) => s.playlists);
  const jobs = useStore((s) => s.jobs);
  const auths = useStore((s) => s.authorizations);
  const now = useNow();

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 20);
  }, [open]);

  const close = () => {
    setQ("");
    setSel(0);
    onClose();
  };

  const items = useMemo<Item[]>(() => {
    const go = (href: string) => () => router.push(href);
    const base: Item[] = [
      { id: "a-url", group: "Actions", label: "New ingest from URL", sub: "Inspect metadata before downloading", icon: <Link2 size={16} />, run: go("/ingest") },
      { id: "a-search", group: "Actions", label: "Search by text across engines", sub: "yt-dlp · spotDL · FreyrJS", icon: <SearchCheck size={16} />, run: go("/ingest/search") },
      { id: "a-import", group: "Actions", label: "Import audio file from disk", sub: "Real validation: codec, decode, SHA-256", icon: <FileUp size={16} />, run: go("/ingest/import") },
      {
        id: "a-pl",
        group: "Actions",
        label: "Create playlist",
        icon: <Plus size={16} />,
        run: () => {
          const p = actions.createPlaylist({ name: `Playlist #${playlists.length + 1}`, description: "", color: "iris" });
          router.push(`/playlists/${p.id}?edit=1`);
        },
      },
      ...NAV_GROUPS.flatMap((g) => g.items.map((it) => ({ id: `n-${it.href}`, group: "Go to", label: it.label, icon: <it.icon size={16} />, run: go(it.href) }))),
    ];
    const ql = q.trim().toLowerCase();
    if (!ql) return base;
    const trackItems: Item[] = tracks
      .filter((t) => `${t.title} ${artists.find((a) => a.id === t.artistId)?.name ?? ""} ${t.code}`.toLowerCase().includes(ql))
      .slice(0, 6)
      .map((t) => ({
        id: `t-${t.id}`,
        group: "Tracks",
        label: t.title,
        sub: `${artists.find((a) => a.id === t.artistId)?.name ?? ""} · ${fmtDuration(t.durationSec)}${trackUsable(t, auths, now) ? "" : " · not usable"}`,
        icon: <Disc3 size={16} />,
        run: () => playQueue([t.id], 0, { kind: "single", label: t.title }),
      }));
    const plItems: Item[] = playlists
      .filter((p) => p.name.toLowerCase().includes(ql))
      .slice(0, 4)
      .map((p) => ({ id: `p-${p.id}`, group: "Playlists", label: p.name, sub: `${p.trackIds.length} tracks`, icon: <ListMusic size={16} />, run: go(`/playlists/${p.id}`) }));
    const jobItems: Item[] = jobs
      .filter((j) => `${j.code} ${j.source.title}`.toLowerCase().includes(ql))
      .slice(0, 4)
      .map((j) => ({ id: `j-${j.id}`, group: "Jobs", label: `${j.code} · ${j.source.title}`, sub: j.status, icon: <Workflow size={16} />, run: go(`/queue?job=${j.id}`) }));
    return [...trackItems, ...plItems, ...jobItems, ...base.filter((b) => b.label.toLowerCase().includes(ql))];
  }, [q, tracks, artists, playlists, jobs, auths, router, now]);

  if (!open) return null;
  const groups = [...new Set(items.map((i) => i.group))];
  const flat = groups.flatMap((g) => items.filter((i) => i.group === g));
  const cur = Math.min(sel, flat.length - 1);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel((cur + 1) % Math.max(1, flat.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel((cur - 1 + flat.length) % Math.max(1, flat.length));
    } else if (e.key === "Enter" && flat[cur]) {
      flat[cur].run();
      close();
    } else if (e.key === "Escape") close();
  };

  return (
    <div className="fixed inset-0 z-[75] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 animate-fade-in bg-black/65" onClick={close} aria-hidden />
      <div role="dialog" aria-modal="true" aria-label="Command palette" className="relative w-full max-w-[620px] animate-pop-in overflow-hidden rounded-2xl border border-line-strong bg-surface-2 shadow-[0_30px_90px_-10px_rgb(0_0_0/0.9)]" onKeyDown={onKey}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-fg-3" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setSel(0);
            }}
            placeholder="Type a track, playlist, job code or action…"
            className="h-14 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-3"
            aria-label="Search"
          />
          <Kbd>Esc</Kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {!flat.length && <div className="px-3 py-10 text-center text-[13px] text-fg-3">No matches for “{q}”.</div>}
          {groups.map((g) => (
            <div key={g} className="mb-1">
              <div className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{g}</div>
              {items
                .filter((i) => i.group === g)
                .map((i) => {
                  const idx = flat.indexOf(i);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      onMouseEnter={() => setSel(idx)}
                      onClick={() => {
                        i.run();
                        close();
                      }}
                      className={cx("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left", idx === cur ? "bg-white/[0.08]" : "")}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-fg-2">{i.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium">{i.label}</span>
                        {i.sub && <span className="block truncate text-[12px] text-fg-3">{i.sub}</span>}
                      </span>
                      {idx === cur && <CornerDownLeft size={14} className="text-fg-3" />}
                    </button>
                  );
                })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
