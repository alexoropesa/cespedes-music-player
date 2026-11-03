"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Info, TriangleAlert, CircleAlert, CircleCheck } from "lucide-react";
import { cx, hashString } from "@/lib/util";
import { useCoverUrl } from "@/lib/covers";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="px-5 pt-6 sm:px-8 sm:pt-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 max-w-3xl">
          {eyebrow && <div className="mb-2 text-[12px] font-semibold text-fg-3">{eyebrow}</div>}
          <h1 className="text-[28px] font-extrabold leading-[1.1] tracking-[-0.025em] text-fg sm:text-[32px]">{title}</h1>
          {description && <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

export function SubNav({ items }: { items: { href: string; label: string; count?: number; exact?: boolean }[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Section" className="-mx-1 mt-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "relative inline-flex h-10 shrink-0 items-center gap-2 px-3 text-[13.5px] font-semibold transition-colors",
              active ? "text-fg" : "text-fg-3 hover:text-fg-2",
            )}
          >
            {it.label}
            {it.count != null && it.count > 0 && (
              <span className={cx("rounded-full px-1.5 py-px text-[11px] tabular-nums", active ? "bg-accent/20 text-accent" : "bg-white/[0.07] text-fg-2")}>{it.count}</span>
            )}
            {active && <span className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-fg" />}
          </Link>
        );
      })}
    </nav>
  );
}

export function Body({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-5 pb-10 pt-6 sm:px-8", className)}>{children}</div>;
}

export function Card({ children, className, title, actions, description, padded = true }: { children?: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode; description?: ReactNode; padded?: boolean }) {
  return (
    <section className={cx("rounded-[14px] border border-line bg-surface-2/70", className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-4">
          <div className="min-w-0">
            {title && <h3 className="text-[14.5px] font-bold tracking-[-0.01em]">{title}</h3>}
            {description && <p className="mt-0.5 text-[12.5px] text-fg-3">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
        </div>
      )}
      <div className={padded ? "p-5 pt-3" : undefined}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, icon, tone, href }: { label: string; value: ReactNode; hint?: ReactNode; icon?: ReactNode; tone?: string; href?: string }) {
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2 text-[12.5px] font-medium text-fg-2">
        <span>{label}</span>
        {icon && <span style={{ color: tone }} className="text-fg-3">{icon}</span>}
      </div>
      <div className="mt-3 text-[28px] font-extrabold leading-none tracking-[-0.03em] tabular-nums">{value}</div>
      {hint && <div className="mt-2 text-[12px] text-fg-3">{hint}</div>}
    </>
  );
  const cls = "block rounded-[14px] border border-line bg-surface-2/70 p-4 transition-colors";
  return href ? (
    <Link href={href} className={cx(cls, "hover:border-white/15 hover:bg-surface-3/70")}>
      {inner}
    </Link>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cx("flex flex-col items-center justify-center rounded-[14px] border border-dashed border-line-strong px-6 py-14 text-center", className)}>
      {icon && <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-white/[0.05] text-fg-2">{icon}</div>}
      <h3 className="text-[15px] font-bold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-[13px] leading-relaxed text-fg-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Notice({ tone = "info", title, children, action, className }: { tone?: "info" | "warning" | "danger" | "success"; title?: ReactNode; children?: ReactNode; action?: ReactNode; className?: string }) {
  const map = {
    info: { cls: "border-white/10 bg-white/[0.035]", icon: <Info size={16} className="text-fg-2" /> },
    warning: { cls: "border-warn/25 bg-warn/[0.06]", icon: <TriangleAlert size={16} className="text-warn" /> },
    danger: { cls: "border-st-failed/25 bg-st-failed/[0.06]", icon: <CircleAlert size={16} className="text-st-failed" /> },
    success: { cls: "border-st-ready/25 bg-st-ready/[0.06]", icon: <CircleCheck size={16} className="text-st-ready" /> },
  }[tone];
  return (
    <div className={cx("flex gap-3 rounded-xl border px-4 py-3", map.cls, className)}>
      <span className="mt-0.5 shrink-0">{map.icon}</span>
      <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-fg-2">
        {title && <div className="mb-0.5 font-semibold text-fg">{title}</div>}
        {children}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  );
}

/* ------------------------------ table ------------------------------ */

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("overflow-x-auto rounded-[14px] border border-line bg-surface-2/40", className)}>
      <table className="w-full border-collapse text-left text-[13px]">{children}</table>
    </div>
  );
}
export function TH({ children, className, align }: { children?: ReactNode; className?: string; align?: "right" | "center" }) {
  return (
    <th
      className={cx(
        "sticky top-0 whitespace-nowrap border-b border-line bg-surface-2 px-4 py-2.5 text-[11.5px] font-semibold text-fg-3",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}
export function TR({ children, onClick, selected, className }: { children: ReactNode; onClick?: () => void; selected?: boolean; className?: string }) {
  return (
    <tr
      onClick={onClick}
      className={cx(
        "group border-b border-line last:border-b-0 transition-colors",
        onClick && "cursor-pointer",
        selected ? "bg-white/[0.06]" : "hover:bg-white/[0.035]",
        className,
      )}
    >
      {children}
    </tr>
  );
}
export function TD({ children, className, align, colSpan, title }: { children?: ReactNode; className?: string; align?: "right" | "center"; colSpan?: number; title?: string }) {
  return (
    <td colSpan={colSpan} title={title} className={cx("px-4 py-2.5 align-middle", align === "right" && "text-right", align === "center" && "text-center", className)}>
      {children}
    </td>
  );
}

/* --------------------------- key / value ---------------------------- */

export function KV({ items, className }: { items: { k: ReactNode; v: ReactNode; mono?: boolean }[]; className?: string }) {
  return (
    <dl className={cx("divide-y divide-line rounded-xl border border-line bg-surface-1/50", className)}>
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(110px,38%)_1fr] gap-3 px-3.5 py-2.5 text-[13px]">
          <dt className="text-fg-3">{it.k}</dt>
          <dd className={cx("min-w-0 break-words text-fg", it.mono && "font-mono text-[12px]")}>{it.v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children, actions, className }: { children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cx("mb-3 flex items-center justify-between gap-3", className)}>
      <h2 className="text-[18px] font-extrabold tracking-[-0.02em]">{children}</h2>
      {actions}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton rounded-lg", className)} />;
}

export function ViewSkeleton() {
  return (
    <div className="px-5 pt-8 sm:px-8" aria-busy>
      <Skeleton className="h-4 w-28" />
      <Skeleton className="mt-3 h-8 w-72" />
      <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
      <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72" />
    </div>
  );
}

/* ------------------------------ cover ------------------------------ */

export const PLAYLIST_COLORS: Record<string, [string, string]> = {
  iris: ["#7c5cff", "#24164f"],
  teal: ["#18a999", "#0b2f33"],
  amber: ["#e0a43a", "#3a2408"],
  rose: ["#e2557a", "#3d0f1f"],
  sky: ["#3f8fe8", "#0d2244"],
  lime: ["#8fc23a", "#1e2c0a"],
  slate: ["#7a8191", "#1b1e25"],
};

export function Cover({ seed, size = 40, rounded = "rounded-md", className, label, color }: { seed: string; size?: number; rounded?: string; className?: string; label?: string; color?: string }) {
  let c1: string;
  let c2: string;
  if (color && PLAYLIST_COLORS[color]) [c1, c2] = PLAYLIST_COLORS[color];
  else {
    const h = hashString(seed);
    const hue = h % 360;
    const hue2 = (hue + 40 + ((h >> 9) % 80)) % 360;
    c1 = `hsl(${hue} 48% 46%)`;
    c2 = `hsl(${hue2} 52% 16%)`;
  }
  const shape = hashString(seed + "s") % 3;
  const img = useCoverUrl(seed);
  if (img) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- local blob URL from IndexedDB
      <img src={img} alt="" aria-hidden width={size} height={size} draggable={false} className={cx("shrink-0 bg-surface-3 object-cover", rounded, className)} style={{ width: size, height: size }} />
    );
  }
  return (
    <div
      aria-hidden
      className={cx("relative shrink-0 overflow-hidden", rounded, className)}
      style={{ width: size, height: size, background: `linear-gradient(140deg, ${c1}, ${c2})` }}
    >
      <div
        className="absolute inset-0 opacity-60 mix-blend-overlay"
        style={{
          background:
            shape === 0
              ? "radial-gradient(circle at 30% 25%, rgba(255,255,255,.55), transparent 45%)"
              : shape === 1
                ? "radial-gradient(circle at 80% 90%, rgba(255,255,255,.45), transparent 50%), linear-gradient(0deg, transparent 60%, rgba(255,255,255,.12))"
                : "conic-gradient(from 200deg at 70% 30%, rgba(255,255,255,.35), transparent 30%)",
        }}
      />
      {label && size >= 64 && (
        <span className="absolute bottom-2 left-2.5 right-2 truncate text-[11px] font-bold leading-tight text-white/90 drop-shadow">{label}</span>
      )}
    </div>
  );
}

export function EqBars({ className }: { className?: string }) {
  return (
    <span className={cx("inline-flex h-3 items-end gap-[2px]", className)} aria-label="Now playing">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-[3px] origin-bottom animate-eq rounded-sm bg-accent" style={{ height: "100%", animationDelay: `${i * 0.18}s` }} />
      ))}
    </span>
  );
}

export function ProgressBar({ value, color, className, indeterminate }: { value: number; color?: string; className?: string; indeterminate?: boolean }) {
  return (
    <div className={cx("h-1.5 w-full overflow-hidden rounded-full bg-white/[0.08]", className)}>
      <div
        className={cx("h-full rounded-full transition-[width] duration-300 ease-out", indeterminate && "skeleton")}
        style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: indeterminate ? undefined : (color ?? "var(--color-accent)") }}
      />
    </div>
  );
}
