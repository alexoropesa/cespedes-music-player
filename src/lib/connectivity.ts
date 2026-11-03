"use client";

import { useSyncExternalStore } from "react";
import { useOffline } from "next/offline";

function subscribe(l: () => void) {
  window.addEventListener("online", l);
  window.addEventListener("offline", l);
  return () => {
    window.removeEventListener("online", l);
    window.removeEventListener("offline", l);
  };
}

/** true when offline — combines Next's connectivity signal with navigator.onLine */
export function useIsOffline() {
  const nextOffline = useOffline();
  const navOffline = useSyncExternalStore(
    subscribe,
    () => !navigator.onLine,
    () => false,
  );
  return nextOffline || navOffline;
}
