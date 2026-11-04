"use client";

/**
 * Track artwork. The worker (thumbnail or Spotify cover) and folder scans
 * (embedded picture) hand the image to the app, which keeps its bytes in
 * IndexedDB; a track points to them with `coverSeed = "img:<key>"`, so every
 * <Cover> shows the real artwork (offline) and falls back to the generated
 * gradient when there is none.
 */
import { useEffect, useState } from "react";
import { idbGet } from "./idb";

export const COVER_PREFIX = "img:";
export const coverKeyOf = (seed: string) => (seed.startsWith(COVER_PREFIX) ? seed.slice(COVER_PREFIX.length) : null);

const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

function load(key: string) {
  if (!pending.has(key)) {
    pending.set(
      key,
      idbGet(key)
        .then((blob) => {
          if (!blob) return null;
          const u = URL.createObjectURL(blob);
          urls.set(key, u);
          return u;
        })
        .catch(() => null),
    );
  }
  return pending.get(key)!;
}

/** Object URL for a cover seed ("img:<key>"), or null while loading / when absent. */
export function useCoverUrl(seed: string) {
  const key = coverKeyOf(seed);
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    if (!key || urls.has(key)) return;
    let alive = true;
    void load(key).then((u) => alive && setLoaded({ key, url: u }));
    return () => {
      alive = false;
    };
  }, [key]);
  if (!key) return null;
  return urls.get(key) ?? (loaded?.key === key ? loaded.url : null);
}
