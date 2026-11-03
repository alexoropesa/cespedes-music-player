"use client";

import { useSyncExternalStore } from "react";

/** Shared ticking clock so render stays pure (no Date.now() in render). */
let now = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const ls = new Set<() => void>();

function subscribe(l: () => void) {
  ls.add(l);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const x of ls) x();
    }, 1000);
  }
  return () => {
    ls.delete(l);
    if (!ls.size && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useNow() {
  return useSyncExternalStore(
    subscribe,
    () => now || (now = Date.now()),
    () => 0,
  );
}
