"use client";

/**
 * Playlist / album ingest (Match). The list is read from Spotify or Apple
 * Music; every selected song becomes its own job, which picks its YouTube
 * upload when it runs and is validated like any other download. One
 * authorization covers the whole selection.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
import { actions, getState, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { ArtistTier } from "@/lib/types";
import type { CollectionResponse, CollectionTrack } from "@/lib/worker-types";
import { cx, fmtDuration } from "@/lib/util";
import { Button, ButtonLink } from "@/components/ui/button";
import { Pill } from "@/components/ui/badges";
import { Checkbox, Field, Segmented, Select } from "@/components/ui/form";
import { Body, Card, KV, Notice } from "@/components/ui/layout";
import { AuthorizationFields, authValid, commitAuthorization, emptyAuth, type AuthValue } from "./shared";
import { BASIS_LABEL } from "@/components/tracks";

const STEPS = ["Songs", "Authorization", "Review"] as const;
const PROVIDER = { spotify: "Spotify", "apple-music": "Apple Music" } as const;

type Ready = Extract<CollectionResponse, { ok: true }>;

export function CollectionIngest({ data, onBack }: { data: Ready; onBack: () => void }) {
  const { collection: c, toolVersion } = data;
  const settings = useStore((s) => s.settings);
  const tracks = useStore((s) => s.tracks);
  const jobs = useStore((s) => s.jobs);
  const artists = useStore((s) => s.artists);
  const playlists = useStore((s) => s.playlists);
  const auths = useStore((s) => s.authorizations);
  const provider = PROVIDER[c.provider];

  // Songs already in the library or queued (by their catalog link) are not queued twice.
  const status = useMemo(() => {
    const inLibrary = new Set(tracks.map((t) => t.provenance.sourceUrl));
    const queued = new Set(jobs.filter((j) => j.status !== "failed").map((j) => j.source.url));
    const maxSec = settings.maxDurationMin * 60;
    return new Map(
      c.tracks.map((t) => [t.url, inLibrary.has(t.url) ? ("library" as const) : queued.has(t.url) ? ("queued" as const) : t.durationSec > maxSec ? ("too-long" as const) : ("ok" as const)]),
    );
  }, [c.tracks, tracks, jobs, settings.maxDurationMin]);
  const eligible = c.tracks.filter((t) => status.get(t.url) === "ok");

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState(() => new Set(eligible.map((t) => t.url)));
  const [auth, setAuth] = useState<AuthValue>(emptyAuth());
  const [destination, setDestination] = useState<string>("__new");
  const [tier, setTier] = useState<ArtistTier>("established");
  const [queued, setQueued] = useState<number | null>(null);

  const chosen = c.tracks.filter((t) => selected.has(t.url) && status.get(t.url) === "ok");
  const known = new Set(artists.map((a) => a.name.toLowerCase()));
  const newArtists = new Set(chosen.map((t) => primaryArtist(t)).filter((n) => !known.has(n.toLowerCase())));
  const totalSec = chosen.reduce((n, t) => n + t.durationSec, 0);
  const selectedAuth = auth.mode === "existing" ? auths.find((a) => a.id === auth.authorizationId) : undefined;
  const canNext = step === 0 ? chosen.length > 0 : step === 1 ? authValid(auth) : true;

  const toggle = (url: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(url);
      else next.delete(url);
      return next;
    });

  const queue = () => {
    const authorizationId = commitAuthorization(auth);
    const playlistId =
      destination === "__new" ? actions.createPlaylist({ name: c.name || `${provider} ${c.kind}`, description: `From ${provider}: ${c.url}`, color: "iris" }).id : destination || undefined;
    queueSongs(chosen, { provider, toolVersion, authorizationId, playlistId, tier });
    actions.logEvent("ingest.collection.queued", `Queued ${chosen.length} song(s) from ${provider} ${c.kind} “${c.name}”`, "info", c.url);
    setQueued(chosen.length);
    toast({ tone: "success", title: `${chosen.length} songs queued`, description: "They download one at a time; each is validated before it reaches the library." });
  };

  if (queued != null) {
    return (
      <Body>
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-surface-2/70 px-8 py-12 text-center">
          <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-st-ready/12 text-st-ready">
            <Check size={26} strokeWidth={2.6} />
          </div>
          <h2 className="mt-5 text-[22px] font-extrabold tracking-[-0.02em]">{queued} songs queued</h2>
          <p className="mt-2 text-[13.5px] leading-relaxed text-fg-2">
            Each song picks its YouTube upload when its turn comes, downloads and is validated with FFmpeg. If YouTube asks this PC to confirm it is not a bot, the queue pauses itself — resume it later from the Queue.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-2">
            <ButtonLink href="/queue" variant="primary">
              Open the queue
            </ButtonLink>
            <Button variant="secondary" onClick={onBack}>
              Ingest another link
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

      <div className="space-y-5">
        <Card>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            {c.coverUrl && (
              // eslint-disable-next-line @next/next/no-img-element -- remote cover reported by the catalog, preview only
              <img src={c.coverUrl} alt="" width={96} height={96} referrerPolicy="no-referrer" className="size-24 shrink-0 rounded-xl object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold uppercase tracking-wide text-fg-3">
                {provider} {c.kind}
              </div>
              <div className="mt-0.5 truncate text-[20px] font-extrabold tracking-[-0.02em]">{c.name}</div>
              <div className="mt-1 text-[13px] text-fg-2">
                {c.owner ? `${c.owner} · ` : ""}
                {c.tracks.length} songs · Match {toolVersion}
              </div>
            </div>
            <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={onBack}>
              Change link
            </Button>
          </div>
          {data.warnings.map((w) => (
            <Notice key={w} tone="warning" className="mt-4">
              {w}
            </Notice>
          ))}
        </Card>

        {step === 0 && (
          <Card
            title="Songs to download"
            description={`${chosen.length} of ${eligible.length} selected · ${fmtDuration(totalSec)} in total. Songs already in the library, already queued or longer than ${settings.maxDurationMin} min are skipped.`}
            actions={
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(eligible.map((t) => t.url)))}>
                  Select all
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  None
                </Button>
              </div>
            }
          >
            <ul className="max-h-[520px] divide-y divide-line overflow-y-auto rounded-xl border border-line">
              {c.tracks.map((t, i) => {
                const st = status.get(t.url);
                return (
                  <li key={t.url} className="flex items-center gap-3 px-4 py-2.5 text-[13px]">
                    <span className="w-6 shrink-0 text-right font-mono text-[11.5px] text-fg-3">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <Checkbox
                        checked={st === "ok" && selected.has(t.url)}
                        disabled={st !== "ok"}
                        onChange={(on) => toggle(t.url, on)}
                        label={<span className="block truncate font-semibold">{t.title}</span>}
                        description={<span className="block truncate">{t.artists.join(", ")}</span>}
                      />
                    </div>
                    {st === "library" && <Pill tone="success">In library</Pill>}
                    {st === "queued" && <Pill tone="info">Already queued</Pill>}
                    {st === "too-long" && <Pill tone="warning">Over {settings.maxDurationMin} min</Pill>}
                    <span className="w-12 shrink-0 text-right font-mono text-[12.5px] text-fg-2">{fmtDuration(t.durationSec)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {step === 1 && (
          <Card title="Authorization basis" description={`Required before any download starts (RF-ING-02). This one record covers all ${chosen.length} selected songs.`}>
            <AuthorizationFields value={auth} onChange={setAuth} />
          </Card>
        )}

        {step === 2 && (
          <Card title="Review and queue" description="Nothing has been downloaded yet.">
            <KV
              items={[
                { k: "Source", v: <span className="break-all font-mono text-[12px]">{c.url}</span> },
                { k: "Songs", v: `${chosen.length} · ${fmtDuration(totalSec)} of music` },
                { k: "Engine", v: `Match ${toolVersion} — each song picks the right version with the best measured audio when it runs` },
                { k: "Authorization", v: auth.mode === "existing" ? `${selectedAuth?.code} · ${selectedAuth?.holder}` : `New · ${BASIS_LABEL[auth.draft.basis]} · ${auth.draft.holder}` },
                { k: "Limits", v: `${settings.maxSizeMB} MB · ${settings.maxDurationMin} min · ±${settings.durationToleranceSec} s vs ${provider} · up to ${settings.maxRetries} retries` },
              ]}
            />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <Field label="Add the songs to" hint="Each song joins the playlist once it is validated and Ready.">
                <Select value={destination} onChange={(e) => setDestination(e.target.value)}>
                  <option value="__new">New playlist “{c.name}”</option>
                  <option value="">Library only</option>
                  {playlists.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </Field>
              {newArtists.size > 0 && (
                <Field label={`${newArtists.size} new artist(s) will be created as`} hint="Taken from the catalog's first credited artist; editable later in Library › Artists.">
                  <Segmented
                    label="Tier for new artists"
                    value={tier}
                    onChange={setTier}
                    options={[
                      { value: "established", label: "Established" },
                      { value: "independent", label: "Independent" },
                    ]}
                  />
                </Field>
              )}
            </div>
            <Notice tone="info" className="mt-5">
              Songs run one at a time: each searches YouTube, measures the closest uploads and downloads the best one (about a minute per song). Searches are spaced out to avoid YouTube&apos;s bot check; if it still triggers, the queue pauses itself until you resume it.
            </Notice>
          </Card>
        )}

        <div className="flex items-center justify-between gap-3">
          <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => (step === 0 ? onBack() : setStep(step - 1))}>
            Back
          </Button>
          {step < 2 ? (
            <Button variant="primary" iconRight={<ArrowRight size={16} />} disabled={!canNext} onClick={() => setStep(step + 1)}>
              Continue
            </Button>
          ) : (
            <Button variant="primary" size="lg" onClick={queue}>
              Queue {chosen.length} songs
            </Button>
          )}
        </div>
      </div>
    </Body>
  );
}

/** First credited artist: the one the library files the track under. */
function primaryArtist(t: CollectionTrack) {
  return t.artists[0]?.trim() || "Unknown artist";
}

/** One Match job per song; each picks its YouTube upload when it runs ("auto"). */
function queueSongs(chosen: CollectionTrack[], o: { provider: string; toolVersion: string; authorizationId: string; playlistId?: string; tier: ArtistTier }) {
  const { provider, toolVersion, authorizationId, playlistId, tier } = o;
  const decidedAt = Date.now();
  for (const t of chosen) {
    const name = primaryArtist(t);
    const artistId = getState().artists.find((a) => a.name.toLowerCase() === name.toLowerCase())?.id ?? actions.createArtist({ name, tier, country: undefined, notes: undefined }).id;
    actions.createJob({
      mode: "worker",
      tool: "match",
      toolVersion,
      source: {
        url: t.url,
        platform: `YouTube · matched to ${provider}`,
        sourceId: "",
        title: t.title,
        channel: "Picked when the job runs",
        durationSec: Math.round(t.durationSec),
        bitrateKbps: 0,
        album: t.album,
        artistGuess: name,
        formats: [{ id: "auto", ext: "auto", codec: "unknown", container: "auto", abrKbps: 0, asrHz: 0, sizeBytes: 0 }],
        coverSeed: t.url,
      },
      formatId: "auto",
      identity: { title: t.title, artistId, album: t.album },
      authorizationId,
      playlistId,
      scenario: "ok",
      review: { reasons: [], requested: { title: t.title, artist: t.artists.join(", "), durationSec: Math.round(t.durationSec) }, decision: "accepted", decidedAt },
    });
  }
}
