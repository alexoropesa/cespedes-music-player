"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bookmark, Check, CircleCheck, CircleX, Link2, ScanSearch, TriangleAlert } from "lucide-react";
import { inspectUrl, ENGINE_INFO, PILOT_URLS, type InspectResult } from "@/lib/catalog";
import { actions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { codecLabel } from "@/lib/seed";
import type { EngineId, Provider } from "@/lib/types";
import { cx, fmtBytes, fmtDuration, hostOf } from "@/lib/util";
import { Button, ButtonLink } from "@/components/ui/button";
import { CodecBadge, Pill } from "@/components/ui/badges";
import { Input, Segmented } from "@/components/ui/form";
import { Body, Card, Cover, KV, Notice, Skeleton } from "@/components/ui/layout";
import { AuthorizationFields, IdentityFields, PlaylistSelect, authValid, commitAuthorization, commitIdentity, emptyAuth, emptyIdentity, identityValid, type AuthValue, type IdentityValue } from "./shared";
import { BASIS_LABEL } from "@/components/tracks";

const STEPS = ["Source", "Identity", "Authorization", "Review"] as const;

export function UrlIngestView() {
  const settings = useStore((s) => s.settings);
  const artists = useStore((s) => s.artists);
  const auths = useStore((s) => s.authorizations);
  const playlists = useStore((s) => s.playlists);
  const [step, setStep] = useState(0);
  const params = useSearchParams();
  const [url, setUrl] = useState(() => params.get("url") ?? "");
  const [engine, setEngine] = useState<EngineId>(settings.defaultEngine);
  const [inspecting, setInspecting] = useState(false);
  const [result, setResult] = useState<InspectResult | null>(null);
  const [formatId, setFormatId] = useState("");
  const [identity, setIdentity] = useState<IdentityValue>(emptyIdentity());
  const [auth, setAuth] = useState<AuthValue>(emptyAuth());
  const [playlistId, setPlaylistId] = useState("");
  const [queued, setQueued] = useState<{ code: string; id: string } | null>(null);

  const meta = result?.kind === "ok" ? result.meta : null;
  const fmt = meta?.formats.find((f) => f.id === formatId) ?? meta?.formats[0];
  const durOk = meta ? meta.durationSec <= settings.maxDurationMin * 60 : false;
  const sizeOk = fmt ? fmt.sizeBytes <= settings.maxSizeMB * 1048576 : false;

  const reset = () => {
    setStep(0);
    setUrl("");
    setResult(null);
    setFormatId("");
    setIdentity(emptyIdentity());
    setAuth(emptyAuth());
    setPlaylistId("");
    setQueued(null);
  };

  const inspect = (target = url) => {
    if (!target.trim()) return;
    setInspecting(true);
    setResult(null);
    setTimeout(() => {
      const r = inspectUrl(target, engine);
      setResult(r);
      setInspecting(false);
      if (r.kind === "ok") {
        setFormatId(r.meta.formats[0].id);
        setIdentity(emptyIdentity(r.meta.artistGuess ? r.meta.title.replace(/\s*\(.*\)\s*$/, "") : r.meta.title, r.meta.artistGuess, r.meta.album));
        actions.logEvent("ingest.source.inspected", `Inspected metadata (no download) · ${hostOf(r.meta.url)} · “${r.meta.title}”`, "info", r.meta.url);
      } else if (r.kind === "error") {
        actions.logEvent("ingest.source.inspect_failed", `Inspect failed · ${r.code} · ${target}`, r.code === "INVALID_URL" ? "info" : "warning", target);
      }
    }, 900 + Math.random() * 500);
  };

  const saveReference = (provider: Provider, title: string, extra?: { channel?: string; durationSec?: number }) => {
    actions.saveReference({ provider, title, url: meta?.url ?? url, origin: "url", channel: extra?.channel, durationSec: extra?.durationSec, note: "Saved from URL ingest — no audio." });
    toast({ tone: "success", title: "Saved as reference", description: "Listed under Library › References. No audio was downloaded." });
  };

  const queue = () => {
    if (!meta || !fmt) return;
    const authorizationId = commitAuthorization(auth);
    const ident = commitIdentity(identity);
    const job = actions.createJob({
      mode: "simulated",
      tool: engine,
      toolVersion: settings.engines[engine].version,
      source: meta,
      formatId: fmt.id,
      identity: ident,
      authorizationId,
      playlistId: playlistId || undefined,
      scenario: result?.kind === "ok" ? result.scenario : "ok",
    });
    setQueued({ code: job.code, id: job.id });
    toast({ tone: "success", title: `${job.code} queued`, description: "Pending → downloading → validating → ready. Track it in the queue monitor." });
  };

  const canNext = step === 0 ? !!meta && durOk : step === 1 ? identityValid(identity) : step === 2 ? authValid(auth) : true;
  const selectedAuth = auth.mode === "existing" ? auths.find((a) => a.id === auth.authorizationId) : undefined;

  if (queued) {
    return (
      <Body>
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface-2/70 px-8 py-12 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-st-ready/12 text-st-ready">
            <Check size={26} strokeWidth={2.6} />
          </div>
          <h2 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em]">Queued as {queued.code}</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
            Authorization and provenance were recorded before the download. The worker processes one job at a time in an isolated staging folder; you&apos;ll get a notification when it reaches Ready or Failed.
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
      {/* stepper */}
      <ol className="mb-6 flex flex-wrap items-center gap-2" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <button
              type="button"
              disabled={i > step}
              onClick={() => setStep(i)}
              className={cx(
                "flex h-8 items-center gap-2 rounded-full pl-1 pr-3 text-[13px] font-semibold transition-colors",
                i === step ? "bg-fg text-canvas" : i < step ? "bg-white/[0.07] text-fg hover:bg-white/[0.11]" : "text-fg-3",
              )}
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
              <Card title="Source URL" description="Metadata and formats are fetched without downloading anything.">
                <form
                  className="space-y-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    inspect();
                  }}
                >
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                      className="flex-1"
                      icon={<Link2 size={16} />}
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://… URL of an authorized sample"
                      aria-label="Source URL"
                      inputMode="url"
                    />
                    <Button type="submit" variant="primary" size="lg" icon={<ScanSearch size={17} />} loading={inspecting} disabled={!url.trim()}>
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
                      options={(["yt-dlp", "spotdl", "freyrjs"] as EngineId[]).map((e) => ({ value: e, label: ENGINE_INFO[e].name, disabled: !settings.engines[e].enabled }))}
                    />
                    <span className="text-[12px] text-fg-3">{ENGINE_INFO[engine].input}</span>
                  </div>
                </form>
                <details className="group mt-5 border-t border-line pt-4" open={!result && !inspecting}>
                  <summary className="mb-2 cursor-pointer list-none text-[12px] font-semibold text-fg-3 hover:text-fg-2">
                    Authorized pilot samples <span className="font-normal">· {PILOT_URLS.length} test paths</span>
                    <span className="ml-1 inline-block transition-transform group-open:rotate-90">›</span>
                  </summary>
                  <div className="flex flex-wrap gap-2">
                    {PILOT_URLS.map((p) => (
                      <button
                        key={p.url}
                        type="button"
                        title={p.url}
                        onClick={() => {
                          setUrl(p.url);
                          setEngine("yt-dlp");
                          inspect(p.url);
                        }}
                        className="rounded-lg border border-line bg-surface-1/60 px-2.5 py-1.5 text-left transition-colors hover:border-white/15 hover:bg-surface-3"
                      >
                        <span className="block text-[12.5px] font-medium">{p.label}</span>
                        <span className="block text-[11px] text-fg-3">{p.hint}</span>
                      </button>
                    ))}
                  </div>
                </details>
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
                  <p className="mt-4 text-[12.5px] text-fg-3">Fetching metadata and available formats from {hostOf(url)} — nothing is downloaded…</p>
                </Card>
              )}

              {result?.kind === "error" && (
                <Notice
                  tone={result.code === "INVALID_URL" ? "warning" : "danger"}
                  title={result.code === "ACCESS_REQUIRED" ? "Additional access required" : result.code === "INVALID_URL" ? "Invalid URL" : "Source not inspectable with this engine"}
                  action={
                    result.code === "ACCESS_REQUIRED" ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          actions.logEvent("ingest.source.limitation", `Limitation recorded · source requires sign-in · ${url}`, "warning", url);
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

              {result?.kind === "provider-reference" && (
                <Notice
                  tone="warning"
                  title="This is a streaming-provider reference"
                  action={
                    <Button size="sm" variant="secondary" icon={<Bookmark size={14} />} onClick={() => saveReference(result.provider, `Reference ${hostOf(url)}`)}>
                      Save as reference
                    </Button>
                  }
                >
                  {result.message}
                </Notice>
              )}

              {meta && fmt && (
                <Card
                  title="Metadata preview"
                  description={`${meta.platform} · fetched with ${ENGINE_INFO[engine].name} ${settings.engines[engine].version}`}
                  actions={
                    <Button size="sm" variant="ghost" icon={<Bookmark size={14} />} onClick={() => saveReference(meta.platform === "YouTube Music" ? "youtube-music" : meta.platform === "SoundCloud" ? "soundcloud" : meta.platform === "Bandcamp" ? "bandcamp" : meta.platform === "YouTube" ? "youtube" : "web", meta.title, { channel: meta.channel, durationSec: meta.durationSec })}>
                      Save as reference
                    </Button>
                  }
                >
                  <div className="flex flex-col gap-5 sm:flex-row">
                    <Cover seed={meta.coverSeed} size={112} rounded="rounded-xl" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[19px] font-extrabold leading-tight tracking-[-0.02em]">{meta.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-fg-2">
                        <span>
                          Channel: <span className="text-fg">{meta.channel}</span>
                        </span>
                        <Pill title="The uploader/channel does not identify the artist">Not a confirmed artist</Pill>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                        <div>
                          <div className="text-[11.5px] text-fg-3">Duration</div>
                          <div className="font-mono font-semibold">{fmtDuration(meta.durationSec)}</div>
                        </div>
                        <div>
                          <div className="text-[11.5px] text-fg-3">Best audio</div>
                          <div className="font-mono font-semibold">{meta.bitrateKbps} kbps</div>
                        </div>
                        <div>
                          <div className="text-[11.5px] text-fg-3">Album</div>
                          <div className="truncate font-semibold">{meta.album ?? "—"}</div>
                        </div>
                        <div>
                          <div className="text-[11.5px] text-fg-3">Source ID</div>
                          <div className="truncate font-mono text-[12px]">{meta.sourceId}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-2 text-[12.5px] font-semibold">Available audio formats</div>
                    <div role="radiogroup" aria-label="Format" className="overflow-hidden rounded-xl border border-line">
                      {meta.formats.map((f, i) => {
                        const over = f.sizeBytes > settings.maxSizeMB * 1048576;
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
                            <span className="w-28 font-mono text-[12px] text-fg-3">id {f.id}</span>
                            <CodecBadge codec={f.codec} kbps={f.abrKbps} />
                            <span className="text-fg-2">
                              {f.container.toUpperCase()} · {(f.asrHz / 1000).toFixed(1)} kHz
                            </span>
                            <span className={cx("ml-auto font-mono text-[12px]", over ? "text-warn" : "text-fg-2")}>≈ {fmtBytes(f.sizeBytes)}</span>
                            {i === 0 && <Pill tone="accent">Best audio · as published</Pill>}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-2 text-[12px] text-fg-3">The original stream is kept as received — no conversion by default. A higher bitrate or a WAV/FLAC container never means better than the source.</p>
                  </div>

                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <LimitRow ok={durOk} label="Duration limit" detail={`${fmtDuration(meta.durationSec)} of max ${settings.maxDurationMin}:00`} />
                    <LimitRow ok={sizeOk} warnOnly label="Size limit" detail={`≈ ${fmtBytes(fmt.sizeBytes)} of max ${settings.maxSizeMB} MB${sizeOk ? "" : " — download will be aborted at the limit"}`} />
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
              <IdentityFields value={identity} onChange={setIdentity} channel={meta.channel} />
            </Card>
          )}

          {step === 2 && (
            <Card title="Authorization basis" description="Required before any download starts (RF-05). Without it the job can't be created.">
              <AuthorizationFields value={auth} onChange={setAuth} />
            </Card>
          )}

          {step === 3 && meta && fmt && (
            <Card title="Review and queue" description="Nothing has been downloaded yet.">
              <KV
                items={[
                  { k: "Source", v: <span className="break-all font-mono text-[12px]">{meta.url}</span> },
                  { k: "Engine", v: `${ENGINE_INFO[engine].name} ${settings.engines[engine].version}` },
                  { k: "Format", v: `${codecLabel(fmt.codec)} ${fmt.abrKbps} kbps · ${fmt.container.toUpperCase()} · ≈ ${fmtBytes(fmt.sizeBytes)}` },
                  { k: "Track", v: `${identity.title} — ${identity.artistId ? artists.find((a) => a.id === identity.artistId)?.name : `${identity.newArtist.name} (new, ${identity.newArtist.tier})`}` },
                  { k: "Authorization", v: auth.mode === "existing" ? `${selectedAuth?.code} · ${selectedAuth?.holder}` : `New · ${BASIS_LABEL[auth.draft.basis]} · ${auth.draft.holder}` },
                  { k: "Staging", v: `${settings.stagingDir}/<job> · isolated · 1 concurrent job`, mono: true },
                  { k: "Limits", v: `${settings.maxSizeMB} MB · ${settings.maxDurationMin} min · up to ${settings.maxRetries} retries` },
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

        {/* summary */}
        <aside className="space-y-4 xl:sticky xl:top-4">
          <Card title="Summary">
            <ul className="space-y-3 text-[13px]">
              <SummaryRow done={!!meta} label="Metadata inspected" detail={meta ? `${meta.platform} · ${fmtDuration(meta.durationSec)}` : "Paste an authorized URL"} />
              <SummaryRow done={!!meta && durOk} label="Within limits" detail={meta ? `${durOk ? "Duration OK" : "Duration exceeded"} · ${sizeOk ? "size OK" : "size over limit"}` : `${settings.maxSizeMB} MB · ${settings.maxDurationMin} min`} />
              <SummaryRow done={step > 1 && identityValid(identity)} label="Identity confirmed" detail={identity.title || "Title and artist"} />
              <SummaryRow done={authValid(auth)} label="Authorization recorded" detail={auth.mode === "existing" ? (selectedAuth?.code ?? "Select or record") : auth.draft.holder || "New record"} />
              <SummaryRow done={false} label="Destination" detail={`Library${playlistId ? ` + ${playlists.find((p) => p.id === playlistId)?.name}` : ""}`} neutral />
            </ul>
          </Card>
          <Card title="States">
            <p className="text-[12.5px] leading-relaxed text-fg-2">
              Each job moves through <b className="text-st-pending">Pending</b> → <b className="text-st-downloading">Downloading</b> → <b className="text-st-validating">Validating</b> → <b className="text-st-ready">Ready</b> or <b className="text-st-failed">Failed</b>. A pending reference is never shown as ready audio.
            </p>
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
      <span className={cx("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border", done ? "border-st-ready/50 bg-st-ready/15 text-st-ready" : neutral ? "border-line-strong text-fg-3" : "border-line-strong")}>
        {done && <Check size={11} strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{label}</span>
        <span className="block truncate text-[12px] text-fg-3">{detail}</span>
      </span>
    </li>
  );
}
