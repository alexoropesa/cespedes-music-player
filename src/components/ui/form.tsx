"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { ChevronDown, Lock } from "lucide-react";
import { cx } from "@/lib/util";

const control =
  "w-full rounded-lg border border-line-strong bg-surface-1 px-3 text-[13.5px] text-fg placeholder:text-fg-3 outline-none transition-colors hover:border-white/18 focus:border-accent/70 focus:bg-surface-1 focus:ring-2 focus:ring-accent/20 disabled:cursor-not-allowed disabled:opacity-50";

export function Field({
  label,
  hint,
  error,
  children,
  optional,
  locked,
  className,
  htmlFor,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
  optional?: boolean;
  locked?: string;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-[12.5px] font-semibold text-fg">
        {label}
        {optional && <span className="font-normal text-fg-3">Optional</span>}
        {locked && (
          <span title={locked} className="inline-flex items-center gap-1 rounded bg-white/[0.06] px-1.5 py-px text-[10.5px] font-medium text-fg-2">
            <Lock size={10} /> Locked
          </span>
        )}
      </label>
      {children}
      {error ? <p className="text-[12px] text-st-failed">{error}</p> : hint ? <p className="text-[12px] leading-relaxed text-fg-3">{hint}</p> : null}
    </div>
  );
}

export function Input({ className, icon, suffix, ...rest }: InputHTMLAttributes<HTMLInputElement> & { icon?: ReactNode; suffix?: ReactNode }) {
  if (icon || suffix) {
    return (
      <div className={cx("relative flex items-center", className)}>
        {icon && <span className="pointer-events-none absolute left-3 text-fg-3">{icon}</span>}
        <input className={cx(control, "h-10", !!icon && "pl-9", !!suffix && "pr-14")} {...rest} />
        {suffix && <span className="pointer-events-none absolute right-3 text-[12px] text-fg-3">{suffix}</span>}
      </div>
    );
  }
  return <input className={cx(control, "h-10", className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(control, "min-h-[84px] resize-y py-2.5 leading-relaxed", className)} {...rest} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={cx("relative", className)}>
      <select className={cx(control, "h-10 cursor-pointer appearance-none pr-9")} {...rest}>
        {children}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

export function Switch({ checked, onChange, label, disabled, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-45",
        checked ? "border-accent/60 bg-accent" : "border-line-strong bg-surface-4",
      )}
    >
      <span className={cx("inline-block size-4 rounded-full shadow transition-transform", checked ? "translate-x-[18px] bg-accent-ink" : "translate-x-[3px] bg-fg")} />
    </button>
  );
}

export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = "md",
  className,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode; disabled?: boolean; title?: string }[];
  size?: "sm" | "md";
  className?: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cx("inline-flex rounded-full border border-line bg-surface-1 p-0.5", className)}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            "rounded-full font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35",
            size === "sm" ? "h-7 px-3 text-[12px]" : "h-8 px-3.5 text-[12.5px]",
            o.value === value ? "bg-fg text-canvas" : "text-fg-2 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, count }: { active?: boolean; onClick?: () => void; children: ReactNode; count?: number }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        "inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium transition-colors",
        active ? "bg-fg text-canvas" : "bg-white/[0.07] text-fg hover:bg-white/[0.12]",
      )}
    >
      {children}
      {count != null && <span className={cx("tabular-nums text-[11.5px]", active ? "text-canvas/60" : "text-fg-3")}>{count}</span>}
    </button>
  );
}

export function Checkbox({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; description?: ReactNode; disabled?: boolean }) {
  return (
    <label className={cx("flex cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-50")}>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden
        className={cx(
          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent",
          checked ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface-1",
        )}
      >
        {checked && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 6.5 5 9l4.5-6" />
          </svg>
        )}
      </span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-medium text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-3">{description}</span>}
      </span>
    </label>
  );
}

export function RadioCard({
  checked,
  onChange,
  title,
  description,
  icon,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      disabled={disabled}
      onClick={onChange}
      className={cx(
        "flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        checked ? "border-accent/60 bg-accent/[0.08] ring-1 ring-accent/30" : "border-line-strong bg-surface-1 hover:border-white/20 hover:bg-white/[0.02]",
      )}
    >
      {icon && <span className={cx("mt-0.5 shrink-0", checked ? "text-accent" : "text-fg-2")}>{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-fg">{title}</span>
        {description && <span className="mt-0.5 block text-[12.5px] leading-relaxed text-fg-2">{description}</span>}
      </span>
      <span className={cx("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border", checked ? "border-accent" : "border-line-strong")}>
        {checked && <span className="size-2 rounded-full bg-accent" />}
      </span>
    </button>
  );
}

export function RangeInput({ value, min, max, step = 1, onChange, label, className }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; label: string; className?: string }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      type="range"
      aria-label={label}
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={cx("range range-always w-full", className)}
      style={{ ["--pct" as string]: `${pct}%`, ["--fill" as string]: "var(--color-accent)" }}
    />
  );
}
