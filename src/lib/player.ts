"use client";

/**
 * Local HTML5 player (RF-07 / RF-REP-01..04). Audio comes only from the local
 * library: real bytes from IndexedDB, or the synthesized demo preview. No
 * network is involved, so playback works offline. Missing/undecodable files
 * are skipped and logged (RF-REP-04).
 */
import { useSyncExternalStore } from "react";
import { idbGet } from "./idb";
import { synthWav } from "./synth";
import { actions, getState, trackUsable } from "./store";
import { toast } from "./toast";

export interface PlayerState {
  queue: string[];
  index: number;
  playing: boolean;
  loading: boolean;
  volume: number;
  muted: boolean;
  repeat: "off" | "all" | "one";
  shuffle: boolean;
  context?: { kind: "playlist" | "library" | "single"; id?: string; label: string };
  sourceKind?: "blob" | "synthetic";
}

const initial: PlayerState = { queue: [], index: -1, playing: false, loading: false, volume: 0.8, muted: false, repeat: "off", shuffle: false };
let ps: PlayerState = initial;
const ls = new Set<() => void>();
const emit = () => ls.forEach((l) => l());
const set = (p: Partial<PlayerState>) => {
  ps = { ...ps, ...p };
  emit();
};

let audio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;
const urlCache = new Map<string, string>();

function el() {
  if (audio || typeof window === "undefined") return audio;
  audio = new Audio();
  audio.preload = "auto";
  audio.volume = ps.volume;
  audio.addEventListener("ended", () => {
    if (ps.repeat === "one" && audio) {
      audio.currentTime = 0;
      void audio.play();
      return;
    }
    next(true);
  });
  audio.addEventListener("play", () => set({ playing: true }));
  audio.addEventListener("pause", () => set({ playing: false }));
  audio.addEventListener("timeupdate", emitTime);
  audio.addEventListener("durationchange", emitTime);
  audio.addEventListener("seeked", emitTime);
  return audio;
}

/* time is published separately to avoid re-rendering the whole player state */
const tls = new Set<() => void>();
let time = { current: 0, duration: 0 };
function emitTime() {
  if (!audio) return;
  time = { current: audio.currentTime || 0, duration: Number.isFinite(audio.duration) ? audio.duration : 0 };
  tls.forEach((l) => l());
}

async function urlFor(trackId: string): Promise<{ url: string; kind: "blob" | "synthetic" } | null> {
  const s = getState();
  const t = s.tracks.find((x) => x.id === trackId);
  if (!t) return null;
  const f = s.files.find((x) => x.id === t.originalFileId);
  if (!f) return null;
  const key = f.id;
  if (urlCache.has(key)) return { url: urlCache.get(key)!, kind: f.audio };
  let blob: Blob | undefined;
  if (f.audio === "blob" && f.blobKey) blob = await idbGet(f.blobKey).catch(() => undefined);
  else if (f.audio === "synthetic") {
    await new Promise((r) => setTimeout(r, 30));
    blob = synthWav(t.coverSeed + t.id, f.durationSec);
  }
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  if (urlCache.size > 4) {
    const [oldKey, oldUrl] = urlCache.entries().next().value as [string, string];
    if (oldUrl !== currentUrl) {
      URL.revokeObjectURL(oldUrl);
      urlCache.delete(oldKey);
    }
  }
  return { url, kind: f.audio };
}

async function loadIndex(i: number, autoplay = true, skips = 0): Promise<void> {
  const a = el();
  if (!a) return;
  const id = ps.queue[i];
  if (!id) return;
  set({ index: i, loading: true });
  const s = getState();
  const track = s.tracks.find((t) => t.id === id);
  if (!track || !trackUsable(track, s.authorizations, Date.now())) {
    actions.logEvent("player.track.skipped", `Skipped “${track?.title ?? id}” — not usable (authorization not active)`, "warning", track?.code);
    return skip(i, autoplay, skips);
  }
  const src = await urlFor(id);
  if (!src) {
    actions.logEvent("player.track.skipped", `Skipped “${track.title}” — file missing or not decodable`, "error", track.code);
    toast({ tone: "error", title: "Track skipped", description: `${track.title}: local file missing or not decodable.` });
    return skip(i, autoplay, skips);
  }
  currentUrl = src.url;
  a.src = src.url;
  set({ loading: false, sourceKind: src.kind });
  if (autoplay) {
    try {
      await a.play();
      actions.recordPlay(id);
    } catch {
      set({ playing: false });
    }
  }
}

function skip(i: number, autoplay: boolean, skips: number) {
  set({ loading: false });
  if (skips + 1 >= ps.queue.length) {
    set({ playing: false });
    return Promise.resolve();
  }
  return loadIndex((i + 1) % ps.queue.length, autoplay, skips + 1);
}

export function playQueue(trackIds: string[], startIndex = 0, context?: PlayerState["context"]) {
  if (!trackIds.length) return;
  const s = getState();
  const now = Date.now();
  const startId = trackIds[startIndex];
  const start = s.tracks.find((t) => t.id === startId);
  if (start && !trackUsable(start, s.authorizations, now)) {
    toast({ tone: "warning", title: "Not usable", description: `“${start.title}” has no active authorization. Review it in Rights & provenance.` });
    return;
  }
  set({ queue: trackIds, context });
  void loadIndex(startIndex);
}

export function toggle() {
  const a = el();
  if (!a) return;
  if (ps.index < 0) return;
  if (a.paused) void a.play();
  else a.pause();
}

export function next(fromEnded = false) {
  if (!ps.queue.length) return;
  let i = ps.shuffle ? Math.floor(Math.random() * ps.queue.length) : ps.index + 1;
  if (i >= ps.queue.length) {
    if (ps.repeat === "all" || !fromEnded) i = 0;
    else {
      set({ playing: false });
      return;
    }
  }
  void loadIndex(i);
}

export function prev() {
  const a = el();
  if (!a) return;
  if (a.currentTime > 3) {
    a.currentTime = 0;
    return;
  }
  void loadIndex(Math.max(0, ps.index - 1));
}

export function seek(sec: number) {
  const a = el();
  if (a && Number.isFinite(sec)) a.currentTime = sec;
}

export function setVolume(v: number) {
  const a = el();
  if (a) {
    a.volume = v;
    a.muted = false;
  }
  set({ volume: v, muted: false });
}

export function toggleMute() {
  const a = el();
  if (a) a.muted = !ps.muted;
  set({ muted: !ps.muted });
}

export function cycleRepeat() {
  set({ repeat: ps.repeat === "off" ? "all" : ps.repeat === "all" ? "one" : "off" });
}

export function toggleShuffle() {
  set({ shuffle: !ps.shuffle });
}

export function stopIfPlaying(trackId: string) {
  if (ps.queue[ps.index] === trackId && audio) {
    audio.pause();
    audio.removeAttribute("src");
    set({ queue: ps.queue.filter((x) => x !== trackId), index: -1, playing: false });
  }
}

export function usePlayer() {
  return useSyncExternalStore(
    (l) => {
      ls.add(l);
      return () => ls.delete(l);
    },
    () => ps,
    () => initial,
  );
}

const ZERO = { current: 0, duration: 0 };
export function usePlayerTime() {
  return useSyncExternalStore(
    (l) => {
      tls.add(l);
      return () => tls.delete(l);
    },
    () => time,
    () => ZERO,
  );
}

export function currentTrackId() {
  return ps.queue[ps.index];
}
