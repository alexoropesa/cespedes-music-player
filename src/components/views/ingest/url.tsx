"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Link2, ScanSearch, TriangleAlert } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { codecLabel } from "@/lib/seed";
import type { EngineId } from "@/lib/types";
import { ENGINES } from "@/lib/types";
import type { CollectionResponse, HealthResponse, InspectResponse, MatchFlag } from "@/lib/worker-types";
import { cx, fmtBytes, fmtDuration, hostOf } from "@/lib/util";
import { Button, ButtonLink } from "@/components/ui/button";
import { CodecBadge, Pill } from "@/components/ui/badges";
import { Input, Segmented } from "@/components/ui/form";
import { Body, Card, Cover, KV, Notice, Skeleton } from "@/components/ui/layout";
import { AuthorizationFields, IdentityFields, PlaylistSelect, authValid, commitAuthorization, commitIdentity, emptyAuth, emptyIdentity, identityValid, type AuthValue, type IdentityValue } from "./shared";
import { BASIS_LABEL } from "@/components/tracks";
import { CollectionIngest } from "./collection";

const STEPS = ["Source", "Identity", "Authorization", "Review"] as const;
const ENGINE_LABEL: Record<EngineId, string> = { "yt-dlp": "yt-dlp", spotdl: "spotDL", freyrjs: "FreyrJS", match: "Match" };
const ENGINE_INPUT: Record<EngineId, string> = {
  "yt-dlp": "Direct source URL (YouTube, SoundCloud, Bandcamp, Commons…)",
  spotdl: "Spotify track link — audio matched on YouTube Music",
  freyrjs: "Spotify, Apple Music or Deezer track link — matched on YouTube Music",
  match: "Spotify song, playlist or album, or Apple Music song or album — best-matching YouTube upload with the highest-quality audio, picked automatically (no credentials needed)",
};
const FLAG_TEXT: Record<MatchFlag, string> = {
  live: "Live",
  cover: "Cover",
  remix: "Remix / edit",
  "other-artist": "Credits another artist",
  altered: "Sped up / slowed",
  karaoke: "Karaoke",
  instrumental: "Instrumental",
  acapella: "Vocals only",
  extended: "Extended",
  "lyric-video": "Lyric video",
  "low-quality": "Low quality",
  "duration-mismatch": "Duration differs",
};

/** Picks the engine that can take this link. */
function engineFor(url: string): EngineId | null {
  const h = hostOf(url);
  if (!h) return null;
  if (h === "open.spotify.com" || h === "spotify.link") return "match";
  if (h === "music.apple.com") return "match";
  if (h.endsWith("deezer.com")) return "freyrjs";
  return "yt-dlp";
}

/** Spotify playlist/album or Apple Music album/playlist: Match expands it into songs. */
function isCollectionLink(url: string) {
  try {
    const u = new URL(url.trim());
    const h = u.hostname.replace(/^www\./, "");
    if (h === "open.spotify.com") return /\/(playlist|album)\//.test(u.pathname);
    if (h === "music.apple.com") return /\/(album|playlist)\//.test(u.pathname) && !u.searchParams.has("i");
  } catch {
    // not a URL yet
  }
  return false;
}

export function UrlIngestView() {
  const settings = useStore((s) => s.settings);
  const artists = useStore((s) => s.artists);
  const auths = useStore((s) => s.authorizations);
  const playlists = useStore((s) => s.playlists);
  const [step, setStep] = useState(0);
  const params = useSearchParams();
  const [url, setUrl] = useState(() => params.get("url") ?? "");
  const [engine, setEngine] = useState<EngineId>(() => engineFor(params.get("url") ?? "") ?? "yt-dlp");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [inspecting, setInspecting] = useState(false);
  const [result, setResult] = useState<InspectResponse | null>(null);
  const [formatId, setFormatId] = useState("");
  const [identity, setIdentity] = useState<IdentityValue>(emptyIdentity());
  const [auth, setAuth] = useState<AuthValue>(emptyAuth());
  const [playlistId, setPlaylistId] = useState("");
  const [queued, setQueued] = useState<{ code: string; id: string } | null>(null);
  const [collection, setCollection] = useState<Extract<CollectionResponse, { ok: true }> | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/worker/health", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<HealthResponse>) : Promise.reject(new Error(String(r.status)))))
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealthError(true));
    return () => {
      alive = false;
    };
  }, []);

  const installed = (e: EngineId) => !!health?.engines[e].version;
  const meta = result?.ok ? result.meta : null;
  const fmt = meta?.formats.find((f) => f.id === formatId) ?? meta?.formats[0];
  /** Match engine: the YouTube upload chosen automatically (best match, then best audio). */
  const pick = meta?.matched;
  const durOk = meta ? meta.durationSec <= settings.maxDurationMin * 60 : false;
  const sizeOk = fmt ? !fmt.sizeBytes || fmt.sizeBytes <= settings.maxSizeMB * 1048576 : false;

  const reset = () => {
    setStep(0);
    setUrl("");
    setResult(null);
    setFormatId("");
    setIdentity(emptyIdentity());
    setAuth(emptyAuth());
    setPlaylistId("");
    setQueued(null);
    setCollection(null);
  };

  const inspect = async (target = url, eng = engine) => {
    if (!target.trim()) return;
    setInspecting(true);
    setResult(null);
    try {
      if (eng === "match" && isCollectionLink(target)) {
        const r = await fetch("/api/worker/collection", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target.trim() }), cache: "no-store" });
        const data = (await r.json()) as CollectionResponse | { error: string };
        if ("error" in data) setResult({ ok: false, engine: eng, code: "ENGINE_ERROR", message: data.error });
        else if (!data.ok) setResult({ ok: false, engine: eng, code: data.code, message: data.message });
        else {
          setCollection(data);
          actions.logEvent("ingest.collection.read", `Read ${data.collection.tracks.length} songs (no download) · ${data.collection.kind} “${data.collection.name}”`, "info", data.collection.url);
        }
        return;
      }
      const r = await fetch("/api/worker/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: target.trim(), engine: eng, toleranceSec: settings.durationToleranceSec }), cache: "no-store" });
      const data = (await r.json()) as InspectResponse | { error: string };
      const res: InspectResponse = "error" in data ? { ok: false, engine: eng, code: "ENGINE_ERROR", message: data.error } : data;
      setResult(res);
      if (res.ok) {
        setFormatId(res.meta.formats[0]?.id ?? "");
        setIdentity(emptyIdentity(res.meta.title, res.meta.artistGuess, res.meta.album));
        actions.logEvent("ingest.source.inspected", `Inspected metadata (no download) · ${ENGINE_LABEL[eng]} ${res.toolVersion} · ${hostOf(res.meta.url)} · “${res.meta.title || "untitled"}”`, "info", res.meta.url);
      } else {
        actions.logEvent("ingest.source.inspect_failed", `Inspect failed · ${ENGINE_LABEL[eng]} · ${res.code} · ${target}`, res.code === "INVALID_URL" || res.code === "WRONG_ENGINE" ? "info" : "warning", target);
      }
    } catch {
      setResult({ ok: false, engine: eng, code: "ENGINE_ERROR", message: "The local worker is not reachable. Is the app server running on this PC?" });
    } finally {
      setInspecting(false);
    }
  };

  const queue = () => {
    if (!meta || !fmt || !result?.ok) return;
    const authorizationId = commitAuthorization(auth);
    const ident = commitIdentity(identity);
    const { thumbnailUrl: _t, license: _l, reference, metadataAfterDownload: _m, matched: _c, ...base } = meta;
    void _t;
    void _l;
    void _m;
    void _c;
    // Match: provenance records the upload that was actually downloaded; the
    // Spotify link stays as the source URL and the request as the reference.
    const source = pick ? { ...base, sourceId: pick.id, channel: pick.channel } : base;
    const job = actions.createJob({
      mode: "worker",
      tool: engine,
      toolVersion: result.toolVersion,
      source,
      formatId: fmt.id,
      identity: ident,
      authorizationId,
      playlistId: playlistId || undefined,
      scenario: "ok",
      review: reference
        ? { reasons: pick ? pick.flags.map((f) => FLAG_TEXT[f]) : [], requested: { title: reference.title, artist: reference.artist, durationSec: reference.durationSec }, decision: "accepted", decidedAt: Date.now() }
        : undefined,
    });
    setQueued({ code: job.code, id: job.id });
    toast({ tone: "success", title: `${job.code} queued`, description: `${ENGINE_LABEL[engine]} downloads it on this PC; FFmpeg validates it before it reaches the library.` });
  };

  const canNext = step === 0 ? !!meta && durOk && !!fmt : step === 1 ? identityValid(identity) : step === 2 ? authValid(auth) : true;
  const selectedAuth = auth.mode === "existing" ? auths.find((a) => a.id === auth.authorizationId) : undefined;

  if (collection) return <CollectionIngest data={collection} onBack={reset} />;

  if (queued) {
    return (
      <Body>
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface-2/70 px-8 py-12 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-st-ready/12 text-st-ready">
            <Check size={26} strokeWidth={2.6} />
          </div>
          <h2 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em]">Queued as {queued.code}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
            Authorization and provenance were recorded before the download. The worker runs one job at a time in an isolated staging folder on this PC; you&apos;ll get a notification when it reaches Ready or Failed.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <ButtonLink href={`/queue?job=${queued.id}`} variant="primary">
              Open in queue monitor
            </ButtonLink>
            <Button variant="secondary" onClick={reset}>
              Ingest another URL
            </Button>
          </div>
        </div>
      </Body>
    );
  }

  return (
    <Body>
      <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={cx("flex h-8 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] font-semibold transition-colors", i === step ? "bg-fg text-canvas" : i < step ? "bg-white/[0.07] text-fg hover:bg-white/[0.11]" : "text-fg-3")}
            >
              <span className={cx("flex size-6 items-center justify-center rounded-full text-[11px]", i === step ? "bg-canvas text-fg" : i < step ? "bg-st-ready/20 text-st-ready" : "border border-line-strong")}>
                {i < step ? <Check size={12} strokeWidth={3} /> : i + 1}
              </span>
              {s}
            </button>
            {i < STEPS.length - 1 && <span className="h-px w-6 bg-line-strong" />}
          </li>
        ))}
      </ol>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-5">
          {step === 0 && (
            <>
              {healthError && (
                <Notice tone="danger" title="Local worker not reachable">
                  The app server could not report its engines. Restart it on this PC and reload the page.
                </Notice>
              )}
              <Card title="Source URL" description={engine === "match" ? "Spotify metadata, then a short sample of the closest YouTube uploads is analyzed to pick the best audio — nothing is kept." : "Metadata and formats are read without downloading anything."}>
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void inspect();
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      className="flex-1"
                      icon={<Link2 size={16} />}
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        const suggested = engineFor(e.target.value);
                        if (suggested && suggested !== engine && (!health || installed(suggested))) setEngine(suggested);
                        setResult(null);
                      }}
                      placeholder="https://… link to a track you are authorized to keep"
                      aria-label="Source URL"
                      inputMode="url"
                    />
                    <Button type="submit" variant="primary" size="lg" icon={<ScanSearch size={17} />} loading={inspecting} disabled={!url.trim() || !installed(engine)}>
                      Inspect metadata
                    </Button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[12.5px] font-semibold text-fg-2">Engine</span>
                    <Segmented
                      size="sm"
                      label="Ingestion engine"
                      value={engine}
                      onChange={(e) => {
                        setEngine(e);
                        setResult(null);
                      }}
                      options={ENGINES.map((e) => ({ value: e, label: health ? `${ENGINE_LABEL[e]}${health.engines[e].version ? ` ${health.engines[e].version}` : " · not installed"}` : ENGINE_LABEL[e], disabled: !!health && !installed(e) }))}
                    />
                  </div>
                  <p className="text-[12px] text-fg-3">{ENGINE_INPUT[engine]}</p>
                </form>
                {health && !health.ffmpeg.version && (
                  <Notice tone="warning" className="mt-4" title="FFmpeg not found">
                    Downloads can&apos;t be validated without FFmpeg and ffprobe on this PC.
                  </Notice>
                )}
              </Card>

              {inspecting && (
                <Card>
                  <div className="flex gap-4">
                    <Skeleton className="size-24 rounded-xl" />
                    <div className="flex-1 space-y-2.5">
                      <Skeleton className="h-4 w-40" />
                      <Skeleton className="h-6 w-72" />
                      <Skeleton className="h-4 w-56" />
                    </div>
                  </div>
                  <p className="mt-4 text-[12.5px] text-fg-3">
                    {engine === "match" ? "Match is reading Spotify, finding the right version on YouTube and measuring the audio of the closest uploads — this takes a few seconds…" : `${ENGINE_LABEL[engine]} is reading metadata from ${hostOf(url)} — nothing is downloaded…`}
                  </p>
                </Card>
              )}

              {result && !result.ok && (
                <Notice
                  tone={result.code === "INVALID_URL" || result.code === "WRONG_ENGINE" || result.code === "PLAYLIST" ? "warning" : "danger"}
                  title={
                    { INVALID_URL: "Invalid URL", WRONG_ENGINE: "Wrong engine for this link", PLAYLIST: "Not a single track", ACCESS_REQUIRED: "Additional access required", UNSUPPORTED: "Source not available", NETWORK: "Network problem", ENGINE_MISSING: "Engine not installed", ENGINE_ERROR: "The engine reported an error" }[result.code]
                  }
                  action={
                    (result.code === "WRONG_ENGINE" || result.code === "PLAYLIST") && result.suggest?.length ? (
                      <div className="flex gap-2">
                        {result.suggest.filter(installed).map((e) => (
                          <Button
                            key={e}
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setEngine(e);
                              void inspect(url, e);
                            }}
                          >
                            Use {ENGINE_LABEL[e]}
                          </Button>
                        ))}
                      </div>
                    ) : result.code === "ACCESS_REQUIRED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          actions.logEvent("ingest.source.limitation", `Limitation recorded · source requires sign-in or payment · ${url}`, "warning", url);
                          toast({ title: "Limitation recorded", description: "Logged in the audit trail. No alternative version was substituted." });
                        }}
                      >
                        Record limitation
                      </Button>
                    ) : undefined
                  }
                >
                  {result.message}
                </Notice>
              )}

              {meta && fmt && result?.ok && (
                <Card title="Metadata preview" description={`${meta.platform} · read with ${ENGINE_LABEL[engine]} ${result.toolVersion}`}>
                  <div className="flex flex-col gap-5 sm:flex-row">
                    {meta.thumbnailUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element -- remote thumbnail reported by the engine, preview only
                      <img src={meta.thumbnailUrl} alt="" width={112} height={112} referrerPolicy="no-referrer" className="size-28 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <Cover seed={meta.coverSeed} size={112} rounded="rounded-xl" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-[19px] font-extrabold leading-tight tracking-[-0.02em]">{meta.title || "Title known after the download"}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
                        <span>
                          {meta.reference ? "Audio" : "Channel"}: <span className="text-fg">{meta.channel}</span>
                        </span>
                        {pick && (
                          <a href={pick.url} target="_blank" rel="noreferrer noopener" title={pick.title} className="font-semibold text-fg-2 underline underline-offset-2 hover:text-fg">
                            Listen on YouTube
                          </a>
                        )}
                        {pick?.quality &&
                          (pick.quality.full ? (
                            <Pill tone="success" title="Treble reaches the top of the spectrum: not re-encoded from a low-bitrate MP3">
                              Full-range audio
                            </Pill>
                          ) : (
                            <Pill tone="warning" title="The treble is cut off: this upload was re-encoded from a compressed copy">
                              Cut at ≈{pick.quality.cutoffKHz} kHz
                            </Pill>
                          ))}
                        {!meta.reference && <Pill title="The uploader/channel does not identify the artist">Not a confirmed artist</Pill>}
                      </div>
                      {meta.reference && (
                        <div className="mt-1 text-[12.5px] text-fg-3">
                          Reference: {meta.reference.title} — {meta.reference.artist}
                          {meta.reference.album ? ` · ${meta.reference.album}` : ""}
                        </div>
                      )}
                      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                        <div>
                          <div className="text-[11.5px] text-fg-3">Duration</div>
                          <div className="font-mono font-semibold">{meta.durationSec ? fmtDuration(meta.durationSec) : "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11.5px] text-fg-3">Best audio</div>
                          <div className="font-mono font-semibold">{meta.bitrateKbps ? `${meta.bitrateKbps} kbps` : "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11.5px] text-fg-3">Album</div>
                          <div className="truncate font-semibold">{meta.album ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11.5px] text-fg-3">Source ID</div>
                          <div className="truncate font-mono text-[12px]">{meta.sourceId || "—"}</div>
                        </div>
                      </div>
                      {meta.license && <div className="mt-2 text-[12px] text-fg-3">License stated at source: {meta.license}</div>}
                    </div>
                  </div>

                  {result.warnings.map((w) => (
                    <Notice key={w} tone="info" className="mt-4">
                      {w}
                    </Notice>
                  ))}

                  <div className="mt-5">
                    <div className="mb-2 text-[12.5px] font-semibold">{engine === "yt-dlp" ? "Available audio formats" : engine === "match" ? "Audio to download" : "Output"}</div>
                    <div role="radiogroup" aria-label="Format" className="overflow-hidden rounded-xl border border-line">
                      {meta.formats.map((f, i) => {
                        const over = !!f.sizeBytes && f.sizeBytes > settings.maxSizeMB * 1048576;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            role="radio"
                            aria-checked={fmt.id === f.id}
                            onClick={() => setFormatId(f.id)}
                            className={cx("flex w-full items-center gap-3 border-b border-line px-4 py-2.5 text-left text-[13px] last:border-b-0", fmt.id === f.id ? "bg-white/[0.06]" : "hover:bg-white/[0.03]")}
                          >
                            <span className={cx("flex size-4 items-center justify-center rounded-full border", fmt.id === f.id ? "border-accent" : "border-line-strong")}>{fmt.id === f.id && <span className="size-2 rounded-full bg-accent" />}</span>
                            <span className="w-24 truncate font-mono text-[12px] text-fg-3">id {f.id}</span>
                            {f.codec !== "unknown" ? <CodecBadge codec={f.codec} kbps={f.abrKbps || undefined} /> : <Pill>codec read after download</Pill>}
                            <span className="text-fg-2">
                              {f.container.toUpperCase()}
                              {f.asrHz ? ` · ${(f.asrHz / 1000).toFixed(1)} kHz` : ""}
                            </span>
                            <span className={cx("ml-auto font-mono text-[12px]", over ? "text-warn" : "text-fg-2")}>{f.sizeBytes ? `≈ ${fmtBytes(f.sizeBytes)}` : "size unknown"}</span>
                            {i === 0 && (engine === "yt-dlp" || engine === "match") && <Pill tone="accent">Best audio · as published</Pill>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[12px] text-fg-3">The original stream is kept as received — no conversion by default. A higher bitrate or a WAV/FLAC container never means better than the source.</p>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <LimitRow ok={durOk} label="Duration limit" detail={meta.durationSec ? `${fmtDuration(meta.durationSec)} of max ${settings.maxDurationMin}:00` : `measured after download · max ${settings.maxDurationMin}:00`} />
                    <LimitRow ok={sizeOk} warnOnly label="Size limit" detail={fmt.sizeBytes ? `≈ ${fmtBytes(fmt.sizeBytes)} of max ${settings.maxSizeMB} MB${sizeOk ? "" : " — download will be aborted at the limit"}` : `enforced while downloading · max ${settings.maxSizeMB} MB`} />
                  </div>
                  {!durOk && (
                    <Notice tone="danger" className="mt-4" title="Exceeds the duration limit">
                      This source is longer than {settings.maxDurationMin} minutes and can&apos;t be queued. Limits are set in Settings › Ingestion.
                    </Notice>
                  )}
                </Card>
              )}
            </>
          )}

          {step === 1 && meta && (
            <Card title="Track identity" description="What this file is, confirmed by you. The source channel is kept separately in provenance.">
              <IdentityFields value={identity} onChange={setIdentity} channel={meta.reference ? undefined : meta.channel} />
            </Card>
          )}

          {step === 2 && (
            <Card title="Authorization basis" description="Required before any download starts (RF-ING-02). Without it the job can't be created.">
              <AuthorizationFields value={auth} onChange={setAuth} />
            </Card>
          )}

          {step === 3 && meta && fmt && result?.ok && (
            <Card title="Review and queue" description="Nothing has been downloaded yet.">
              <KV
                items={[
                  { k: "Source", v: <span className="break-all font-mono text-[12px]">{meta.url}</span> },
                  { k: "Engine", v: `${ENGINE_LABEL[engine]} ${result.toolVersion}` },
                  ...(pick ? [{ k: "Matched upload", v: <span className="break-all">{pick.title} · {pick.channel} · <span className="font-mono text-[12px]">{pick.id}</span></span> }] : []),
                  { k: "Format", v: fmt.codec !== "unknown" ? `${codecLabel(fmt.codec)}${fmt.abrKbps ? ` ${fmt.abrKbps} kbps` : ""} · ${fmt.container.toUpperCase()}${fmt.sizeBytes ? ` · ≈ ${fmtBytes(fmt.sizeBytes)}` : ""}` : `id ${fmt.id} · codec read after download` },
                  { k: "Track", v: `${identity.title} — ${identity.artistId ? artists.find((a) => a.id === identity.artistId)?.name : `${identity.newArtist.name} (new, ${identity.newArtist.tier})`}` },
                  { k: "Authorization", v: auth.mode === "existing" ? `${selectedAuth?.code} · ${selectedAuth?.holder}` : `New · ${BASIS_LABEL[auth.draft.basis]} · ${auth.draft.holder}` },
                  { k: "Staging", v: "Isolated folder per job on this PC · removed after validation", mono: true },
                  { k: "Limits", v: `${settings.maxSizeMB} MB · ${settings.maxDurationMin} min · ±${settings.durationToleranceSec} s vs source · up to ${settings.maxRetries} retries` },
                ]}
              />
              <div className="mt-5 max-w-md">
                <PlaylistSelect value={playlistId} onChange={setPlaylistId} />
              </div>
            </Card>
          )}

          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" icon={<ArrowLeft size={16} />} disabled={step === 0} onClick={() => setStep(step - 1)}>
              Back
            </Button>
            {step < 3 ? (
              <Button variant="primary" iconRight={<ArrowRight size={16} />} disabled={!canNext} onClick={() => setStep(step + 1)}>
                Continue
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={queue}>
                Queue download
              </Button>
            )}
          </div>
        </div>

        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card title="Summary">
            <ul className="space-y-3 text-[13px]">
              <SummaryRow done={!!meta} label="Metadata inspected" detail={meta ? `${meta.platform}${meta.durationSec ? ` · ${fmtDuration(meta.durationSec)}` : ""}` : "Paste an authorized URL"} />
              <SummaryRow done={!!meta && durOk} label="Within limits" detail={meta ? `${durOk ? "Duration OK" : "Duration exceeded"} · ${sizeOk ? "size OK" : "size over limit"}` : `${settings.maxSizeMB} MB · ${settings.maxDurationMin} min`} />
              <SummaryRow done={step > 1 && identityValid(identity)} label="Identity confirmed" detail={identity.title || "Title and artist"} />
              <SummaryRow done={authValid(auth)} label="Authorization recorded" detail={auth.mode === "existing" ? (selectedAuth?.code ?? "Select or record") : auth.draft.holder || "New record"} />
              <SummaryRow done={false} label="Destination" detail={`Library${playlistId ? ` + ${playlists.find((p) => p.id === playlistId)?.name}` : ""}`} neutral />
            </ul>
          </Card>
          <Card title="Engines on this PC">
            {health ? (
              <ul className="space-y-1.5 text-[12.5px]">
                {[...ENGINES.map((e) => health.engines[e]), health.ffmpeg, health.atomicparsley].map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{t.name}</span>
                    <span className={cx("font-mono", t.version ? "text-fg-2" : "text-warn")}>{t.version ?? "not installed"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-fg-3">{healthError ? "Worker not reachable." : "Checking installed engines…"}</p>
            )}
          </Card>
        </aside>
      </div>
    </Body>
  );
}

function LimitRow({ ok, label, detail, warnOnly }: { ok: boolean; label: string; detail: string; warnOnly?: boolean }) {
  return (
    <div className={cx("flex items-center gap-2.5 rounded-lg border px-3 py-2 text-[12.5px]", ok ? "border-st-ready/20 bg-st-ready/[0.05]" : warnOnly ? "border-warn/25 bg-warn/[0.06]" : "border-st-failed/25 bg-st-failed/[0.06]")}>
      {ok ? <CircleCheck size={15} className="text-st-ready" /> : warnOnly ? <TriangleAlert size={15} className="text-warn" /> : <CircleX size={15} className="text-st-failed" />}
      <span className="font-semibold">{label}</span>
      <span className="text-fg-2">{detail}</span>
    </div>
  );
}

function SummaryRow({ done, label, detail, neutral }: { done: boolean; label: string; detail: string; neutral?: boolean }) {
  return (
    <li className="flex gap-3">
      <span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", done ? "border-st-ready/50 bg-st-ready/15 text-st-ready" : neutral ? "border-line-strong text-fg-3" : "border-line-strong")}>{done && <Check size={11} strokeWidth={3} />}</span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block truncate text-[12px] text-fg-3">{detail}</span>
      </span>
    </li>
  );
}
