"use client";

/**
 * Embedded artwork from imported files. The image bytes live in IndexedDB next
 * to the audio; a track points to them with `coverSeed = "img:<key>"`, so every
 * <Cover> in the app shows the real artwork (offline) and falls back to the
 * generated gradient when a file has none.
 */
import { useEffect, useState } from "react";
import { extractCover } from "./audio-inspect";
import { idbDel, idbGet, idbPut } from "./idb";
import { getState, setState } from "./store";
import { uid } from "./util";

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

/** Extracts the embedded picture of a file and stores it. Returns the cover seed or null. */
export async function storeEmbeddedCover(buf: ArrayBuffer): Promise<string | null> {
  const c = extractCover(buf);
  if (!c) return null;
  const key = uid("cover");
  await idbPut(key, new Blob([c.data.slice()], { type: c.mime }));
  return COVER_PREFIX + key;
}

export function deleteCover(seed: string | undefined) {
  const key = seed && coverKeyOf(seed);
  if (key) {
    void idbDel(key);
    const u = urls.get(key);
    if (u) URL.revokeObjectURL(u);
    urls.delete(key);
    pending.delete(key);
  }
}

/** One-off: tracks imported before artwork extraction existed get their cover now. */
let backfilled = false;
export async function backfillCovers() {
  if (backfilled) return;
  backfilled = true;
  const s = getState();
  for (const t of s.tracks) {
    if (coverKeyOf(t.coverSeed)) continue;
    const f = s.files.find((x) => x.id === t.originalFileId);
    if (f?.audio !== "blob" || !f.blobKey) continue;
    const blob = await idbGet(f.blobKey).catch(() => undefined);
    if (!blob) continue;
    const seed = await storeEmbeddedCover(await blob.arrayBuffer()).catch(() => null);
    if (seed) setState((st) => ({ ...st, tracks: st.tracks.map((x) => (x.id === t.id ? { ...x, coverSeed: seed } : x)) }));
  }
}
