"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { PlayerBar } from "./player-bar";
import { CommandPalette } from "./command-palette";
import { Toaster } from "./toaster";
import { initStore, session, useHydrated } from "@/lib/store";
import { engineTick } from "@/lib/engine";
import { toggle } from "@/lib/player";
import { ViewSkeleton } from "@/components/ui/layout";
import { IconButton } from "@/components/ui/button";

function SidebarRoute({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return <Sidebar pathname={pathname} onNavigate={onNavigate} />;
}

export function AppShell({ children }: { children: ReactNode }) {
  const hydrated = useHydrated();
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Boot: load persisted workspace (or seed), learn the request IP for audit entries.
  useEffect(() => {
    initStore();
    fetch("/api/whoami", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { ip?: string }) => {
        if (d.ip) session.ip = d.ip;
      })
      .catch(() => undefined);
  }, []);

  // Ingestion worker loop (one job at a time).
  useEffect(() => {
    const id = setInterval(engineTick, 250);
    return () => clearInterval(id);
  }, []);

  // Offline shell for full reloads without network (production only).
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      const t = e.target as HTMLElement;
      const typing = t.closest("input, textarea, select, [contenteditable=true], button, [role=dialog]");
      if (e.code === "Space" && !typing) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-dvh flex-col bg-canvas px-2 pt-0">
      <Topbar onOpenNav={() => setNavOpen(true)} onOpenSearch={() => setPaletteOpen(true)} />
      <div className="flex min-h-0 flex-1 gap-2">
        <aside className="hidden w-[272px] shrink-0 overflow-hidden rounded-[var(--radius-panel)] bg-surface-1 lg:block">
          <Suspense fallback={<Sidebar pathname={null} />}>
            <SidebarRoute />
          </Suspense>
        </aside>
        <main
          id="main"
          className="panel-wash min-w-0 flex-1 overflow-y-auto overflow-x-hidden rounded-[var(--radius-panel)]"
          style={{ backgroundAttachment: "local" }}
        >
          {!hydrated && <ViewSkeleton />}
          {/* The route segment always renders (instant-navigation validation); it is revealed once the local workspace is loaded. */}
          <div hidden={!hydrated}>{children}</div>
        </main>
      </div>
      <PlayerBar />

      {navOpen && (
        <div className="fixed inset-0 z-[65] lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={() => setNavOpen(false)} aria-hidden />
          <div className="relative flex h-full w-[300px] max-w-[85vw] animate-pop-in flex-col bg-surface-1">
            <div className="flex justify-end p-2">
              <IconButton label="Close navigation" onClick={() => setNavOpen(false)}>
                <X size={18} />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1">
              <Suspense fallback={<Sidebar pathname={null} />}>
                <SidebarRoute onNavigate={() => setNavOpen(false)} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <Toaster />
    </div>
  );
}
