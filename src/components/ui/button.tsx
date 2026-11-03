"use client";

import Link from "next/link";
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cx } from "@/lib/util";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "outline";
type Size = "xs" | "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-fg text-canvas hover:bg-white active:bg-white/85 shadow-[0_1px_0_rgb(255_255_255/0.4)_inset]",
  accent: "bg-accent text-accent-ink hover:bg-[#c2b1ff] active:bg-accent-strong",
  secondary: "bg-surface-3 text-fg border border-line-strong hover:bg-surface-4 hover:border-white/15",
  outline: "bg-transparent text-fg border border-line-strong hover:border-white/30 hover:bg-white/[0.03]",
  ghost: "text-fg-2 hover:text-fg hover:bg-white/[0.06]",
  danger: "bg-st-failed/12 text-st-failed border border-st-failed/25 hover:bg-st-failed/20",
};

const SIZE: Record<Size, string> = {
  xs: "h-7 px-2.5 text-[12px] gap-1.5",
  sm: "h-8 px-3 text-[13px] gap-1.5",
  md: "h-9 px-4 text-[13.5px] gap-2",
  lg: "h-11 px-6 text-[15px] gap-2",
};

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-full font-semibold tracking-[-0.005em] transition-[background-color,border-color,color,transform,opacity] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40";

export function ButtonLink({ href, variant = "secondary", size = "md", icon, children, className }: { href: string; variant?: Variant; size?: Size; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={cx(BASE, VARIANT[variant], SIZE[size], className)}>
      {icon}
      {children}
    </Link>
  );
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", icon, iconRight, loading, className, children, disabled, type = "button", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        BASE,
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
      {iconRight}
    </button>
  );
});

export function IconButton({
  label,
  className,
  size = "md",
  active,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; size?: "sm" | "md" | "lg"; active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full transition-colors duration-150 disabled:pointer-events-none disabled:opacity-35",
        size === "sm" ? "size-7" : size === "lg" ? "size-10" : "size-8",
        active ? "text-accent" : "text-fg-2 hover:bg-white/[0.07] hover:text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("size-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function PlayButton({
  playing,
  onClick,
  size = "md",
  label,
  className,
  disabled,
}: {
  playing?: boolean;
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const dim = size === "lg" ? "size-14" : size === "sm" ? "size-8" : "size-10";
  const ico = size === "lg" ? 22 : size === "sm" ? 13 : 16;
  return (
    <button
      type="button"
      aria-label={label ?? (playing ? "Pause" : "Play")}
      title={label ?? (playing ? "Pause" : "Play")}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_8px_24px_-6px_rgb(146_119_255/0.55)] transition-transform duration-150 hover:scale-[1.04] hover:bg-[#c2b1ff] active:scale-95 disabled:pointer-events-none disabled:opacity-35",
        dim,
        className,
      )}
    >
      {playing ? (
        <svg width={ico} height={ico} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <rect x="3" y="2" width="3.6" height="12" rx="1" />
          <rect x="9.4" y="2" width="3.6" height="12" rx="1" />
        </svg>
      ) : (
        <svg width={ico} height={ico} viewBox="0 0 16 16" fill="currentColor" aria-hidden className="translate-x-[1px]">
          <path d="M4 2.6v10.8c0 .8.9 1.3 1.6.9l8.6-5.4a1 1 0 0 0 0-1.8L5.6 1.7C4.9 1.3 4 1.8 4 2.6Z" />
        </svg>
      )}
    </button>
  );
}
