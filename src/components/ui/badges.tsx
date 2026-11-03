import type { ReactNode } from "react";
import type { ArtistTier, AuthStatus, JobStatus } from "@/lib/types";
import { cx } from "@/lib/util";
import { codecLabel, isLossless } from "@/lib/seed";

const STATUS: Record<JobStatus, { label: string; dot: string; text: string; bg: string }> = {
  pending: { label: "Pending", dot: "bg-st-pending", text: "text-st-pending", bg: "bg-st-pending/10 border-st-pending/20" },
  downloading: { label: "Downloading", dot: "bg-st-downloading", text: "text-st-downloading", bg: "bg-st-downloading/10 border-st-downloading/25" },
  validating: { label: "Validating", dot: "bg-st-validating", text: "text-st-validating", bg: "bg-st-validating/10 border-st-validating/25" },
  ready: { label: "Ready", dot: "bg-st-ready", text: "text-st-ready", bg: "bg-st-ready/10 border-st-ready/25" },
  failed: { label: "Failed", dot: "bg-st-failed", text: "text-st-failed", bg: "bg-st-failed/10 border-st-failed/25" },
};

export const STATUS_COLOR: Record<JobStatus, string> = {
  pending: "var(--color-st-pending)",
  downloading: "var(--color-st-downloading)",
  validating: "var(--color-st-validating)",
  ready: "var(--color-st-ready)",
  failed: "var(--color-st-failed)",
};

export function StatusBadge({ status, note, size = "md" }: { status: JobStatus; note?: string; size?: "sm" | "md" }) {
  const s = STATUS[status];
  const live = status === "downloading" || status === "validating";
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border font-medium",
        size === "sm" ? "h-5 px-2 text-[11px]" : "h-6 px-2.5 text-[12px]",
        s.bg,
        s.text,
      )}
    >
      <span className="relative inline-flex size-1.5">
        {live && <span className={cx("absolute inset-0 animate-ping rounded-full opacity-70", s.dot)} />}
        <span className={cx("relative inline-flex size-1.5 rounded-full", s.dot)} />
      </span>
      {s.label}
      {note && <span className="font-normal text-fg-2">· {note}</span>}
    </span>
  );
}

type PillTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";
const TONE: Record<PillTone, string> = {
  neutral: "bg-white/[0.06] text-fg-2 border-line",
  accent: "bg-accent/12 text-accent border-accent/25",
  success: "bg-st-ready/10 text-st-ready border-st-ready/20",
  warning: "bg-warn/10 text-warn border-warn/25",
  danger: "bg-st-failed/10 text-st-failed border-st-failed/25",
  info: "bg-st-downloading/10 text-st-downloading border-st-downloading/25",
};

export function Pill({ tone = "neutral", children, icon, className, title }: { tone?: PillTone; children: ReactNode; icon?: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md border px-1.5 text-[11.5px] font-medium", TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function TierBadge({ tier }: { tier: ArtistTier }) {
  return tier === "established" ? (
    <Pill tone="accent" title="Established artist (label / catalog presence)">Established</Pill>
  ) : (
    <Pill tone="info" title="Independent artist (self-released / small label)">Independent</Pill>
  );
}

const AUTH: Record<AuthStatus, { label: string; tone: PillTone }> = {
  active: { label: "Active", tone: "success" },
  expiring: { label: "Expiring soon", tone: "warning" },
  expired: { label: "Expired", tone: "danger" },
  "under-review": { label: "Under review", tone: "neutral" },
  revoked: { label: "Revoked", tone: "danger" },
};

export function AuthStatusBadge({ status }: { status: AuthStatus }) {
  return <Pill tone={AUTH[status].tone}>{AUTH[status].label}</Pill>;
}

export function CodecBadge({ codec, kbps, title }: { codec: string; kbps?: number; title?: string }) {
  const lossless = isLossless(codec);
  return (
    <span
      title={title ?? (lossless ? "Lossless codec as received — not a claim of master quality" : "Lossy codec as received (real codec via ffprobe)")}
      className={cx(
        "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md border px-1.5 font-mono text-[11px] font-medium",
        lossless ? "border-white/15 bg-white/[0.07] text-fg" : "border-line bg-white/[0.03] text-fg-2",
      )}
    >
      {codecLabel(codec)}
      {kbps ? <span className="text-fg-3">{kbps}k</span> : null}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-line-strong bg-surface-3 px-1 font-mono text-[10.5px] text-fg-2">{children}</kbd>;
}
