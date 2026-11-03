"use client";

/**
 * Modal, Drawer, ConfirmDialog and Menu.
 * Rendered inline with `position: fixed` (no portal) so that when Next.js hides
 * a route with <Activity>, the overlay is hidden with it. Modals/drawers keep
 * their state across navigations (form drafts survive; URL-driven drawers reset
 * from the URL). Transient menus close when their route is hidden.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { cx } from "@/lib/util";
import { Button, IconButton } from "./button";

function useCloseOnHide(open: boolean, onClose: () => void) {
  const openRef = useRef(open);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    openRef.current = open;
    closeRef.current = onClose;
  });
  useLayoutEffect(
    () => () => {
      if (openRef.current) closeRef.current();
    },
    [],
  );
}

function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

function useAutoFocus(open: boolean, ref: React.RefObject<HTMLElement | null>, self = false) {
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>(self ? "[data-autofocus]" : "[data-autofocus], input:not([type=hidden]):not([disabled]), textarea, select, button:not([data-close])");
      (el ?? ref.current)?.focus({ preventScroll: true });
    }, 30);
    return () => {
      clearTimeout(t);
      prev?.focus?.({ preventScroll: true });
    };
  }, [open, ref, self]);
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  icon,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  icon?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useAutoFocus(open, ref);
  if (!open) return null;
  const w = size === "sm" ? "max-w-[420px]" : size === "lg" ? "max-w-[720px]" : size === "xl" ? "max-w-[960px]" : "max-w-[560px]";
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-black/70" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "relative flex max-h-[92dvh] outline-none w-full animate-pop-in flex-col overflow-hidden rounded-t-2xl border border-line-strong bg-surface-2 shadow-[0_24px_80px_-12px_rgb(0_0_0/0.8)] sm:rounded-2xl",
          w,
        )}
      >
        <div className="flex items-start gap-3 px-6 pb-2 pt-5">
          {icon && <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-fg">{icon}</div>}
          <div className="min-w-0 flex-1">
            <h2 className="text-[17px] font-bold tracking-[-0.01em] text-fg">{title}</h2>
            {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{description}</p>}
          </div>
          <IconButton label="Close" data-close onClick={onClose} className="-mr-2 -mt-1">
            <X size={18} />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-3">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface-1/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  header,
  children,
  footer,
  width = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  header?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEscape(open, onClose);
  useAutoFocus(open, ref, true);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[55] flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-black/55" onClick={onClose} aria-hidden />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cx(
          "relative m-0 flex h-full outline-none w-full animate-slide-in flex-col overflow-hidden border-l border-line-strong bg-surface-2 shadow-[-24px_0_80px_-20px_rgb(0_0_0/0.8)] sm:m-2 sm:h-[calc(100%-16px)] sm:rounded-2xl sm:border",
          width === "lg" ? "sm:max-w-[680px]" : "sm:max-w-[540px]",
        )}
      >
        <div className="flex items-start gap-3 border-b border-line px-5 pb-4 pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[17px] font-bold tracking-[-0.01em]">{title}</h2>
            {subtitle && <div className="mt-1 text-[13px] text-fg-2">{subtitle}</div>}
          </div>
          <IconButton label="Close panel" data-close onClick={onClose} className="-mr-1.5">
            <X size={18} />
          </IconButton>
        </div>
        {header}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer && <div className="flex flex-wrap items-center gap-2 border-t border-line bg-surface-1/60 px-5 py-3">{footer}</div>}
      </aside>
    </div>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  tone = "danger",
  requireText,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  requireText?: string;
  children?: ReactNode;
}) {
  const [typed, setTyped] = useState("");
  const close = () => {
    setTyped("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={close}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            disabled={!!requireText && typed !== requireText}
            onClick={() => {
              onConfirm();
              close();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {requireText && (
        <label className="mt-1 block text-[13px] text-fg-2">
          Type <span className="font-mono text-fg">{requireText}</span> to confirm
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            className="mt-2 h-10 w-full rounded-lg border border-line-strong bg-surface-1 px-3 font-mono text-sm text-fg outline-none focus:border-accent"
          />
        </label>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Menu (fixed-position popover; escapes table overflow clipping)       */
/* ------------------------------------------------------------------ */

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
  separator?: boolean;
  checked?: boolean;
}

export function Menu({
  trigger,
  items,
  align = "end",
  header,
  width = 224,
}: {
  trigger: (props: { onClick: (e: React.MouseEvent<HTMLElement>) => void; "aria-expanded": boolean; "aria-haspopup": "menu" }) => ReactNode;
  items: MenuItem[];
  align?: "start" | "end";
  header?: ReactNode;
  width?: number;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const open = !!pos;
  const close = () => setPos(null);
  useCloseOnHide(open, close);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setPos(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setPos(null);
    const onScroll = () => setPos(null);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScroll);
    document.addEventListener("scroll", onScroll, true);
    const first = menuRef.current?.querySelector<HTMLElement>("button:not([disabled])");
    first?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  const onClick = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    if (open) return setPos(null);
    const r = e.currentTarget.getBoundingClientRect();
    const estH = Math.min(items.length * 36 + (header ? 44 : 0) + 12, 420);
    const top = r.bottom + 6 + estH > window.innerHeight ? Math.max(8, r.top - estH - 6) : r.bottom + 6;
    const left = align === "end" ? Math.max(8, r.right - width) : Math.min(r.left, window.innerWidth - width - 8);
    setPos({ top, left });
  };

  const onKeyNav = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const btns = [...(menuRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? [])];
    const i = btns.indexOf(document.activeElement as HTMLElement);
    btns[(i + (e.key === "ArrowDown" ? 1 : -1) + btns.length) % btns.length]?.focus();
  };

  return (
    <>
      {trigger({ onClick, "aria-expanded": open, "aria-haspopup": "menu" })}
      {pos && (
        <div
          ref={menuRef}
          role="menu"
          onKeyDown={onKeyNav}
          onClick={(e) => e.stopPropagation()}
          style={{ top: pos.top, left: pos.left, width }}
          className="fixed z-[70] max-h-[420px] animate-pop-in overflow-y-auto rounded-xl border border-line-strong bg-surface-3 p-1 shadow-[0_16px_48px_-8px_rgb(0_0_0/0.85)]"
        >
          {header && <div className="border-b border-line px-2.5 pb-2 pt-1.5 text-[12px] text-fg-3">{header}</div>}
          {items.map((it, i) =>
            it.separator ? (
              <div key={`sep-${i}`} className="my-1 h-px bg-line" />
            ) : (
              <button
                key={`${it.label}-${i}`}
                role="menuitem"
                type="button"
                disabled={it.disabled}
                title={it.disabled ? it.hint : undefined}
                onClick={() => {
                  setPos(null);
                  it.onSelect?.();
                }}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                  it.danger ? "text-st-failed hover:bg-st-failed/10 focus:bg-st-failed/10" : "text-fg hover:bg-white/[0.07] focus:bg-white/[0.07]",
                )}
              >
                {it.icon && <span className={cx("shrink-0", it.danger ? "" : "text-fg-2")}>{it.icon}</span>}
                <span className="flex-1 truncate">{it.label}</span>
                {it.checked && <span className="text-accent">✓</span>}
                {!it.disabled && it.hint && <span className="text-[11px] text-fg-3">{it.hint}</span>}
              </button>
            ),
          )}
        </div>
      )}
    </>
  );
}
