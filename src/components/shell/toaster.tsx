"use client";

import { CircleAlert, CircleCheck, TriangleAlert, X } from "lucide-react";
import { dismissToast, useToasts } from "@/lib/toast";
import { cx } from "@/lib/util";

export function Toaster() {
  const toasts = useToasts();
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-[92px] z-[90] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className={cx(
            "pointer-events-auto flex w-full max-w-[440px] animate-toast-in items-start gap-3 rounded-xl px-4 py-3 shadow-[0_16px_40px_-8px_rgb(0_0_0/0.8)]",
            t.tone === "default" || !t.tone ? "bg-fg text-canvas" : "border border-line-strong bg-surface-4 text-fg",
          )}
        >
          {t.tone === "success" && <CircleCheck size={18} className="mt-px shrink-0 text-st-ready" />}
          {t.tone === "error" && <CircleAlert size={18} className="mt-px shrink-0 text-st-failed" />}
          {t.tone === "warning" && <TriangleAlert size={18} className="mt-px shrink-0 text-warn" />}
          <div className="min-w-0 flex-1">
            <div className="text-[13.5px] font-semibold">{t.title}</div>
            {t.description && <div className={cx("mt-0.5 text-[12.5px] leading-snug", !t.tone || t.tone === "default" ? "text-canvas/70" : "text-fg-2")}>{t.description}</div>}
          </div>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick();
                dismissToast(t.id);
              }}
              className="shrink-0 self-center rounded-full px-2.5 py-1 text-[12.5px] font-bold underline-offset-2 hover:underline"
            >
              {t.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => dismissToast(t.id)} className="shrink-0 opacity-60 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}
