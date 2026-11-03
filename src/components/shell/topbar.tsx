"use client";

import Link from "next/link";
import { Activity, FlaskConical, House, Menu as MenuIcon, Plus, Search, WifiOff } from "lucide-react";
import { useIsOffline } from "@/lib/connectivity";
import { isAwaitingReview, useStore } from "@/lib/store";
import { Button, IconButton } from "@/components/ui/button";
import { Kbd } from "@/components/ui/badges";
import { Menu } from "@/components/ui/overlay";
import { cx, initials } from "@/lib/util";
import { useRouter } from "next/navigation";

export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="bf-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#c9bbff" />
          <stop offset="1" stopColor="#7a5cff" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#bf-g)" />
      <g fill="#0d0819">
        <rect x="8" y="12" width="3" height="8" rx="1.5" />
        <rect x="12.8" y="8" width="3" height="16" rx="1.5" />
        <rect x="17.6" y="10.5" width="3" height="11" rx="1.5" />
        <rect x="22.4" y="14" width="3" height="4" rx="1.5" />
      </g>
    </svg>
  );
}

export function Topbar({ onOpenNav, onOpenSearch }: { onOpenNav: () => void; onOpenSearch: () => void }) {
  const offline = useIsOffline();
  const jobs = useStore((s) => s.jobs);
  const paused = useStore((s) => s.queuePaused);
  const operator = useStore((s) => s.settings.operator);
  const router = useRouter();
  const active = jobs.find((j) => (j.status === "downloading" || j.status === "validating") && !isAwaitingReview(j));
  const pending = jobs.filter((j) => j.status === "pending").length;

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 px-2 sm:gap-3">
      <IconButton label="Open navigation" onClick={onOpenNav} className="lg:hidden">
        <MenuIcon size={19} />
      </IconButton>
      <Link href="/" className="flex shrink-0 items-center gap-2.5 rounded-lg px-1.5 py-1" aria-label="Bitferalda back office — overview">
        <LogoMark />
        <span className="hidden flex-col leading-none sm:flex">
          <span className="text-[15px] font-extrabold tracking-[-0.02em]">Bitferalda</span>
          <span className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-fg-3">Back office</span>
        </span>
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-center gap-2">
        <Link
          href="/"
          aria-label="Overview"
          className="hidden size-11 shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg md:flex"
        >
          <House size={20} />
        </Link>
        <button
          type="button"
          onClick={onOpenSearch}
          className="group flex h-11 w-full max-w-[460px] items-center gap-3 rounded-full border border-transparent bg-surface-2 px-4 text-left text-[14px] text-fg-3 transition-colors hover:border-line-strong hover:bg-surface-3"
        >
          <Search size={19} className="shrink-0 text-fg-2 group-hover:text-fg" />
          <span className="flex-1 truncate">Search tracks, playlists, jobs, actions…</span>
          <span className="hidden items-center gap-1 sm:flex">
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        <span
          title="Ingestion runs through the simulation adapter until the local worker (TBD-09) and an authorized sample (TBD-03) exist. Imports from disk use real validation."
          className="hidden h-7 items-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-2.5 text-[11.5px] font-semibold text-accent xl:inline-flex"
        >
          <FlaskConical size={13} /> Pilot · simulation adapter
        </span>
        {offline && (
          <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-warn/30 bg-warn/10 px-2.5 text-[11.5px] font-semibold text-warn" role="status">
            <WifiOff size={13} /> Offline
          </span>
        )}
        <Link
          href="/queue"
          title={paused ? "Queue paused" : active ? `${active.code} ${active.status}` : "Worker idle"}
          className="hidden h-8 items-center gap-2 rounded-full bg-surface-2 px-3 text-[12px] font-semibold text-fg-2 transition-colors hover:bg-surface-3 hover:text-fg md:inline-flex"
        >
          <span className="relative flex size-2">
            {active && !paused && <span className="absolute inset-0 animate-ping rounded-full bg-st-downloading opacity-70" />}
            <span className={cx("relative size-2 rounded-full", paused ? "bg-warn" : active ? "bg-st-downloading" : "bg-st-ready")} />
          </span>
          <Activity size={14} />
          {paused ? "Paused" : active ? `${active.code} · ${active.status}` : "Idle"}
          {pending > 0 && <span className="text-fg-3">+{pending}</span>}
        </Link>
        <Button variant="primary" size="sm" icon={<Plus size={15} />} onClick={() => router.push("/ingest")} className="hidden sm:inline-flex">
          New ingest
        </Button>
        <Menu
          header={
            <div>
              <div className="font-semibold text-fg">{operator.name}</div>
              <div>{operator.email} · Operator</div>
            </div>
          }
          items={[
            { label: "Workspace settings", onSelect: () => router.push("/settings/workspace") },
            { label: "My activity", onSelect: () => router.push("/audit") },
          ]}
          trigger={(props) => (
            <button {...props} type="button" aria-label="Operator menu" className="ml-0.5 flex size-8 items-center justify-center rounded-full bg-accent/90 text-[12px] font-extrabold text-accent-ink ring-4 ring-surface-2 transition hover:ring-surface-3">
              {initials(operator.name)}
            </button>
          )}
        />
      </div>
    </header>
  );
}
