"use client";

import Link from "next/link";
import { HardDrive, ListMusic, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, Volume2, VolumeX, WifiOff } from "lucide-react";
import { cycleRepeat, next, prev, seek, setVolume, toggle, toggleMute, toggleShuffle, usePlayer, usePlayerTime, playQueue } from "@/lib/player";
import { useStore } from "@/lib/store";
import { useIsOffline } from "@/lib/connectivity";
import { Cover, EqBars } from "@/components/ui/layout";
import { IconButton, Spinner } from "@/components/ui/button";
import { Menu } from "@/components/ui/overlay";
import { CodecBadge } from "@/components/ui/badges";
import { cx, fmtDuration } from "@/lib/util";

export function PlayerBar() {
  const p = usePlayer();
  const time = usePlayerTime();
  const tracks = useStore((s) => s.tracks);
  const artists = useStore((s) => s.artists);
  const files = useStore((s) => s.files);
  const offline = useIsOffline();
  const track = tracks.find((t) => t.id === p.queue[p.index]);
  const artist = artists.find((a) => a.id === track?.artistId);
  const file = files.find((f) => f.id === track?.originalFileId);
  const dur = time.duration || track?.durationSec || 0;
  const pct = dur ? (time.current / dur) * 100 : 0;
  const volPct = (p.muted ? 0 : p.volume) * 100;
  const VolIcon = p.muted || p.volume === 0 ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2;

  return (
    <footer className="flex h-[76px] shrink-0 items-center gap-3 px-2 sm:gap-4" aria-label="Player">
      {/* now playing */}
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:w-[30%] sm:flex-none">
        {track ? (
          <>
            <Cover seed={track.coverSeed} size={52} rounded="rounded-lg" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Link href={`/library?track=${track.id}`} className="truncate text-[13.5px] font-semibold hover:underline">
                  {track.title}
                </Link>
                {p.playing && <EqBars />}
              </div>
              <div className="truncate text-[12px] text-fg-2">{artist?.name}</div>
              <div className="mt-0.5 hidden items-center gap-1.5 text-[11px] text-fg-3 sm:flex">
                <HardDrive size={11} />
                {p.sourceKind === "synthetic" ? "Local · synthesized preview" : "Local file"}
                {file && <CodecBadge codec={file.codec} />}
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 text-fg-3">
            <div className="flex size-[52px] items-center justify-center rounded-lg border border-dashed border-line-strong">
              <ListMusic size={18} />
            </div>
            <div className="hidden text-[12.5px] leading-snug sm:block">
              Nothing playing
              <br />
              <Link href="/library" className="text-fg-2 hover:text-fg hover:underline">
                Pick a ready track
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* transport */}
      <div className="flex flex-col items-center gap-1 sm:flex-1">
        <div className="flex items-center gap-1 sm:gap-2">
          <IconButton label={p.shuffle ? "Disable shuffle" : "Enable shuffle"} active={p.shuffle} onClick={toggleShuffle} className="hidden sm:inline-flex" disabled={!track}>
            <Shuffle size={16} />
          </IconButton>
          <IconButton label="Previous" onClick={prev} disabled={!track}>
            <SkipBack size={18} fill="currentColor" />
          </IconButton>
          <button
            type="button"
            onClick={() => (track ? toggle() : tracks.length && playQueue(tracks.map((t) => t.id), 0, { kind: "library", label: "Library" }))}
            aria-label={p.playing ? "Pause" : "Play"}
            title={p.playing ? "Pause (Space)" : "Play (Space)"}
            className="flex size-9 items-center justify-center rounded-full bg-fg text-canvas transition-transform hover:scale-105 active:scale-95"
          >
            {p.loading ? (
              <Spinner className="size-4" />
            ) : p.playing ? (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                <rect x="3" y="2" width="3.6" height="12" rx="1" />
                <rect x="9.4" y="2" width="3.6" height="12" rx="1" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden className="translate-x-px">
                <path d="M4 2.6v10.8c0 .8.9 1.3 1.6.9l8.6-5.4a1 1 0 0 0 0-1.8L5.6 1.7C4.9 1.3 4 1.8 4 2.6Z" />
              </svg>
            )}
          </button>
          <IconButton label="Next" onClick={() => next()} disabled={!track}>
            <SkipForward size={18} fill="currentColor" />
          </IconButton>
          <IconButton label={`Repeat: ${p.repeat}`} active={p.repeat !== "off"} onClick={cycleRepeat} className="hidden sm:inline-flex" disabled={!track}>
            {p.repeat === "one" ? <Repeat1 size={16} /> : <Repeat size={16} />}
          </IconButton>
        </div>
        <div className="hidden w-full max-w-[560px] items-center gap-2 sm:flex">
          <span className="w-10 text-right font-mono text-[11px] tabular-nums text-fg-3">{fmtDuration(time.current)}</span>
          <input
            type="range"
            aria-label="Seek"
            className="range flex-1"
            min={0}
            max={dur || 1}
            step={0.1}
            value={time.current}
            disabled={!track}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ ["--pct" as string]: `${pct}%` }}
          />
          <span className="w-10 font-mono text-[11px] tabular-nums text-fg-3">{fmtDuration(dur)}</span>
        </div>
      </div>

      {/* right controls */}
      <div className="hidden w-[30%] items-center justify-end gap-1.5 md:flex">
        <span
          title={offline ? "Offline — local library playback keeps working" : "Local playback never uses the network"}
          className={cx(
            "mr-1 inline-flex h-6 items-center gap-1.5 rounded-full border px-2 text-[11px] font-medium",
            offline ? "border-warn/30 bg-warn/10 text-warn" : "border-line text-fg-3",
          )}
        >
          {offline ? <WifiOff size={12} /> : <HardDrive size={12} />}
          {offline ? "Offline · playing locally" : "Offline-ready"}
        </span>
        <Menu
          width={300}
          header={p.context ? `Queue · ${p.context.label}` : "Queue"}
          items={
            p.queue.length
              ? p.queue.slice(0, 14).map((id, i) => {
                  const t = tracks.find((x) => x.id === id);
                  return { label: `${i === p.index ? "▶ " : ""}${t?.title ?? "Unknown"}`, hint: t ? fmtDuration(t.durationSec) : "", onSelect: () => playQueue(p.queue, i, p.context) };
                })
              : [{ label: "Queue is empty", disabled: true }]
          }
          trigger={(props) => (
            <IconButton label="Queue" {...props}>
              <ListMusic size={17} />
            </IconButton>
          )}
        />
        <IconButton label={p.muted ? "Unmute" : "Mute"} onClick={toggleMute}>
          <VolIcon size={17} />
        </IconButton>
        <input
          type="range"
          aria-label="Volume"
          className="range w-24"
          min={0}
          max={1}
          step={0.01}
          value={p.muted ? 0 : p.volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          style={{ ["--pct" as string]: `${volPct}%` }}
        />
      </div>
    </footer>
  );
}
