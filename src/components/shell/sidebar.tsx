"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { NAV_GROUPS, isActive } from "./nav";
import { actions, authStatus, isAwaitingReview, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { usePlayer } from "@/lib/player";
import { Cover, EqBars } from "@/components/ui/layout";
import { IconButton } from "@/components/ui/button";
import { cx } from "@/lib/util";

export function Sidebar({ pathname, onNavigate }: { pathname: string | null; onNavigate?: () => void }) {
  const jobs = useStore((s) => s.jobs);
  const reviews = useStore((s) => s.reviews);
  const auths = useStore((s) => s.authorizations);
  const playlists = useStore((s) => s.playlists);
  const tracks = useStore((s) => s.tracks);
  const now = useNow();
  const player = usePlayer();
  const router = useRouter();

  const badges = {
    queue: jobs.filter((j) => j.status === "pending" || j.status === "downloading" || (j.status === "validating" && !isAwaitingReview(j))).length,
    reviews: reviews.filter((r) => r.status === "needs-review").length,
    rights: now ? auths.filter((a) => ["expired", "expiring", "under-review"].includes(authStatus(a, now))).length : 0,
  };
  const playingPlaylist = player.playing && player.context?.kind === "playlist" ? player.context.id : undefined;

  const createPlaylist = () => {
    const p = actions.createPlaylist({ name: `Playlist #${playlists.length + 1}`, description: "", color: ["iris", "teal", "amber", "rose", "sky", "lime"][playlists.length % 6] });
    onNavigate?.();
    router.push(`/playlists/${p.id}?edit=1`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav aria-label="Primary" className="shrink-0 space-y-4 px-3 pb-3 pt-4">
        {NAV_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-3">{g.label}</div>
            <ul className="space-y-0.5">
              {g.items.map((it) => {
                const active = isActive(pathname, it.href);
                const count = it.badge ? badges[it.badge] : 0;
                return (
                  <li key={it.href}>
                    <Link
                      href={it.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cx(
                        "group flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-semibold transition-colors",
                        active ? "bg-white/[0.08] text-fg" : "text-fg-2 hover:bg-white/[0.04] hover:text-fg",
                      )}
                    >
                      <it.icon size={17} strokeWidth={active ? 2.3 : 2} className={active ? "text-fg" : "text-fg-3 group-hover:text-fg-2"} />
                      <span className="flex-1 truncate">{it.label}</span>
                      {count > 0 && (
                        <span
                          className={cx(
                            "min-w-5 rounded-full px-1.5 text-center text-[11px] font-bold tabular-nums leading-5",
                            it.badge === "reviews" ? "bg-st-validating/15 text-st-validating" : it.badge === "rights" ? "bg-warn/15 text-warn" : "bg-st-downloading/15 text-st-downloading",
                          )}
                        >
                          {count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="mx-3 flex min-h-0 flex-1 flex-col rounded-xl bg-white/[0.025]">
        <div className="flex items-center justify-between px-3 pb-1 pt-3">
          <Link href="/playlists" onClick={onNavigate} className="text-[13px] font-bold text-fg-2 hover:text-fg">
            Your playlists
          </Link>
          <IconButton label="Create playlist" size="sm" onClick={createPlaylist}>
            <Plus size={16} />
          </IconButton>
        </div>
        <ul className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {playlists.map((p) => {
            const active = pathname === `/playlists/${p.id}`;
            const count = p.trackIds.filter((id) => tracks.some((t) => t.id === id)).length;
            return (
              <li key={p.id}>
                <Link
                  href={`/playlists/${p.id}`}
                  onClick={onNavigate}
                  className={cx("flex items-center gap-3 rounded-lg p-1.5 transition-colors", active ? "bg-white/[0.08]" : "hover:bg-white/[0.04]")}
                >
                  <Cover seed={p.id} color={p.color} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className={cx("truncate text-[13.5px] font-semibold", playingPlaylist === p.id ? "text-accent" : "text-fg")}>{p.name}</div>
                    <div className="truncate text-[12px] text-fg-3">Playlist · {count} tracks</div>
                  </div>
                  {playingPlaylist === p.id && <EqBars className="mr-1" />}
                </Link>
              </li>
            );
          })}
          {!playlists.length && <li className="px-2 py-3 text-[12.5px] text-fg-3">No playlists yet. Use + to create one.</li>}
        </ul>
      </div>
      <div className="h-3 shrink-0" />
    </div>
  );
}
