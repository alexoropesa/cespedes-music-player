"use client";

import { useSyncExternalStore } from "react";

export interface Toast {
  id: number;
  title: string;
  description?: string;
  tone?: "default" | "success" | "error" | "warning";
  action?: { label: string; onClick: () => void };
}

let toasts: Toast[] = [];
let n = 0;
const ls = new Set<() => void>();
const EMPTY: Toast[] = [];

function emit() {
  for (const l of ls) l();
}

export function toast(t: Omit<Toast, "id">) {
  const id = ++n;
  toasts = [...toasts.slice(-3), { ...t, id }];
  emit();
  setTimeout(() => dismissToast(id), t.tone === "error" ? 7000 : 4200);
  return id;
}

export function dismissToast(id: number) {
  toasts = toasts.filter((x) => x.id !== id);
  emit();
}

export function useToasts() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => toasts,
    () => EMPTY,
  );
}
