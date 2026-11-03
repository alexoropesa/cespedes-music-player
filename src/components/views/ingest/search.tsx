"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Bookmark, Check, Download, Search, TriangleAlert, X } from "lucide-react";
import { ENGINE_INFO, FLAG_LABEL, PROVIDER_LABEL, searchEngine, artistByKey, songByKey, VARIANTS } from "@/lib/catalog";
import { actions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { EngineId, MatchFlag, SearchResult } from "@/lib/types";
import { ENGINES } from "@/lib/types";
import { cx, fmtDuration, fmtMs } from "@/lib/util";
import { Button, ButtonLink, Spinner } from "@/components/ui/button";
import { CodecBadge, Pill } from "@/components/ui/badges";
import { Chip, Input } from "@/components/ui/form";
import { Body, Cover, EmptyState, Notice } from "@/components/ui/layout";
import { Drawer } from "@/components/ui/overlay";
import { AuthorizationFields, IdentityFields, PlaylistSelect, authValid, commitAuthorization, commitIdentity, emptyAuth, emptyIdentity, identityValid, type AuthValue, type IdentityValue } from "./shared";

const DOUBTFUL: MatchFlag[] = ["duration-mismatch", "live", "cover", "remix", "lyric-video"];
const isDoubtful = (r: SearchResult) => r.flags.some((f) => DOUBTFUL.includes(f));

type EngineState = { status: "idle" | "loading" | "done"; results: SearchResult[]; note?: string; latencyMs?: number };

const SUGGESTIONS = ["Paper Satellites", "Cuarto Azul Paloma Cruz", "Espejismo", "Midnight Ferry Nova Lindqvist", "Fieldnotes"];

export function SearchView() {
  const settings = useStore((s) => s.settings);
  const tracks = useStore((s) => s.tracks);
  const params = useSearchParams();
  const [q, setQ] = useState(() => params.get("q") ?? "");
  const [lastQ, setLastQ] = useState("");
  const [enabled, setEnabled] = useState<EngineId[]>(ENGINES.filter((e) => settings.engines[e].enabled));
  const [state, setState] = useState<Record<EngineId, EngineState>>({ "yt-dlp": { status: "idle", results: [] }, spotdl: { status: "idle", results: [] }, freyrjs: { status: "idle", results: [] } });
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [keep, setKeep] = useState<SearchResult | null>(null);

  const run = (query = q) => {
    const term = query.trim();
    if (!term) return;
    setLastQ(term);
    setDismissed([]);
    const next = { ...state };
    for (const e of ENGINES) next[e] = enabled.includes(e) ? { status: "loading", results: [] } : { status: "idle", results: [] };
    setState(next);
    actions.logEvent("ingest.search.run", `Text search “${term}” · ${enabled.join(", ")} · results only, nothing downloaded`, "info", term);
    for (const e of enabled) {
      const res = searchEngine(term, e, settings.durationToleranceSec);
      setTimeout(() => setState((s) => ({ ...s, [e]: { status: "done", results: res.results, note: res.note, latencyMs: res.latencyMs } })), res.latencyMs * 0.6);
    }
  };

  const libraryUrls = new Set(tracks.map((t) => t.provenance.sourceUrl));
  const anyRun = ENGINES.some((e) => state[e].status !== "idle");

  return (
    <Body>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
        className="rounded-[14px] border border-line bg-surface-2/70 p-5"
      >
        <div className="flex flex-col gap-3 md:flex-row">
          <Input className="flex-1" icon={<Search size={16} />} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Song title, artist… e.g. Paper Satellites The Hollow Arcade" aria-label="Search query" />
          <Button type="submit" variant="primary" size="lg" disabled={!q.trim() || !enabled.length}>
            Search engines
          </Button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[12.5px] font-semibold text-fg-2">Run in parallel</span>
          {ENGINES.map((e) => (
            <Chip key={e} active={enabled.includes(e)} onClick={() => setEnabled(enabled.includes(e) ? enabled.filter((x) => x !== e) : [...enabled, e])}>
              {enabled.includes(e) && <Check size={13} strokeWidth={3} />}
              {ENGINE_INFO[e].name}
            </Chip>
          ))}
          <span className="ml-auto text-[12px] text-fg-3">Results only — nothing is downloaded until you keep a result and record its authorization.</span>
        </div>
        {!anyRun && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-[12px] text-fg-3">Try a pilot sample:</span>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setQ(s);
                  run(s);
                }}
                className="rounded-full bg-white/[0.06] px-3 py-1 text-[12.5px] text-fg-2 hover:bg-white/[0.1] hover:text-fg"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      {anyRun ? (
        <>
          <div className="mb-3 mt-7 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[18px] font-extrabold tracking-[-0.02em]">Results for “{lastQ}”</h2>
            <span className="text-[12.5px] text-fg-3">Same query, three engines · doubtful matches are flagged and never auto-accepted</span>
          </div>
          <div className="grid items-start gap-4 xl:grid-cols-3">
            {ENGINES.filter((e) => state[e].status !== "idle").map((e) => {
              const st = state[e];
              const visible = st.results.filter((r) => !dismissed.includes(r.id));
              return (
                <section key={e} className="min-w-0 rounded-[14px] border border-line bg-surface-2/50">
                  <header className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
                    <div>
                      <div className="text-[14px] font-bold">{ENGINE_INFO[e].name}</div>
                      <div className="text-[11.5px] text-fg-3">{ENGINE_INFO[e].upstream}</div>
                    </div>
                    <div className="text-right text-[11.5px] text-fg-3">
                      {st.status === "loading" ? (
                        <span className="inline-flex items-center gap-1.5">
                          <Spinner className="size-3.5" /> Searching
                        </span>
                      ) : (
                        <>
                          <div className="font-mono text-fg-2">{fmtMs(st.latencyMs)}</div>
                          <div>{st.results.length} result(s)</div>
                        </>
                      )}
                    </div>
                  </header>
                  <div className="space-y-2 p-3">
                    {st.status === "loading" &&
                      [0, 1, 2].map((i) => (
                        <div key={i} className="flex gap-3 rounded-xl p-2">
                          <div className="skeleton size-14 rounded-lg" />
                          <div className="flex-1 space-y-2 py-1">
                            <div className="skeleton h-3.5 w-3/4 rounded" />
                            <div className="skeleton h-3 w-1/2 rounded" />
                          </div>
                        </div>
                      ))}
                    {st.status === "done" && st.note && <Notice tone="warning">{st.note}</Notice>}
                    {st.status === "done" && !visible.length && !st.note && <p className="px-2 py-6 text-center text-[12.5px] text-fg-3">No results to show.</p>}
                    {visible.map((r) => (
                      <ResultCard
                        key={r.id}
                        r={r}
                        inLibrary={libraryUrls.has(r.url)}
                        onKeep={() => setKeep(r)}
                        onDismiss={() => setDismissed([...dismissed, r.id])}
                        onReference={() => {
                          actions.saveReference({
                            provider: r.reference?.provider ?? r.provider,
                            title: r.reference?.title ?? r.title,
                            artistName: r.reference?.artist,
                            channel: r.channel,
                            durationSec: r.reference?.durationSec ?? r.durationSec,
                            url: r.url,
                            origin: "search",
                            note: `Saved from ${ENGINE_INFO[r.engine].name} search “${r.query}”`,
                          });
                          toast({ tone: "success", title: "Saved as reference", description: "No audio — listed under Library › References." });
                        }}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <EmptyState
          className="mt-7"
          icon={<Search size={22} />}
          title="Search by text across engines"
          description="yt-dlp searches sources directly; spotDL and FreyrJS resolve a streaming-catalog reference and then match audio on another source. Compare what each returns before deciding to keep, reference or dismiss."
        />
      )}
      <KeepDrawer result={keep} onClose={() => setKeep(null)} />
    </Body>
  );
}

function ResultCard({ r, inLibrary, onKeep, onDismiss, onReference }: { r: SearchResult; inLibrary: boolean; onKeep: () => void; onDismiss: () => void; onReference: () => void }) {
  const doubtful = isDoubtful(r);
  const refDur = r.reference?.durationSec;
  const delta = refDur != null ? r.durationSec - refDur : null;
  return (
    <article className={cx("rounded-xl border p-3 transition-colors", doubtful ? "border-warn/20 bg-warn/[0.03]" : "border-line bg-surface-1/50 hover:border-white/12")}>
      {r.reference && (
        <div className="mb-2.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-fg-2">
          <span className="text-fg-3">Reference · {PROVIDER_LABEL[r.reference.provider]}:</span> <span className="font-semibold text-fg">{r.reference.title}</span> — {r.reference.artist} · {fmtDuration(r.reference.durationSec)}
        </div>
      )}
      <div className="flex gap-3">
        <Cover seed={r.coverSeed + r.provider} size={52} rounded="rounded-lg" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] font-semibold" title={r.title}>
            {r.title}
          </div>
          <div className="truncate text-[12px] text-fg-2" title="Channel / uploader — not a confirmed artist">
            Channel: {r.channel}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-fg-3">
            <span>{r.reference ? "Matched on " : ""}{PROVIDER_LABEL[r.provider]}</span>·<span className="font-mono">{fmtDuration(r.durationSec)}</span>
            {delta != null && delta !== 0 && <span className={cx("font-mono", Math.abs(delta) > 2 ? "text-warn" : "")}>({delta > 0 ? "+" : ""}{delta}s)</span>}
            <CodecBadge codec={r.codec} kbps={r.bitrateKbps} />
          </div>
        </div>
        <button type="button" aria-label="Dismiss result" title="Dismiss" onClick={onDismiss} className="self-start rounded-full p-1 text-fg-3 hover:bg-white/[0.08] hover:text-fg">
          <X size={15} />
        </button>
      </div>
      {(r.flags.length > 0 || inLibrary) && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {inLibrary && <Pill tone="success" title="A file from this exact source URL is already in the library">Source already in library</Pill>}
          {r.flags.map((f) => (
            <Pill key={f} tone={DOUBTFUL.includes(f) ? "warning" : "neutral"}>
              {FLAG_LABEL[f]}
            </Pill>
          ))}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2" title="Match confidence (heuristic)">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.08]">
            <div className="h-full rounded-full" style={{ width: `${r.confidence * 100}%`, background: r.confidence > 0.8 ? "var(--color-st-ready)" : r.confidence > 0.5 ? "var(--color-warn)" : "var(--color-st-failed)" }} />
          </div>
          <span className="font-mono text-[11px] text-fg-3">{Math.round(r.confidence * 100)}%</span>
        </div>
        <Button size="xs" variant="ghost" icon={<Bookmark size={13} />} onClick={onReference}>
          Reference
        </Button>
        <Button size="xs" variant={doubtful ? "secondary" : "primary"} icon={doubtful ? <TriangleAlert size={13} /> : <Download size={13} />} onClick={onKeep}>
          {doubtful ? "Keep · review" : "Keep"}
        </Button>
      </div>
    </article>
  );
}

function KeepDrawer({ result, onClose }: { result: SearchResult | null; onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const [identity, setIdentity] = useState<IdentityValue>(emptyIdentity());
  const [auth, setAuth] = useState<AuthValue>(emptyAuth());
  const [playlistId, setPlaylistId] = useState("");
  const [forId, setForId] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; code: string } | null>(null);

  if (result && forId !== result.id) {
    setForId(result.id);
    setDone(null);
    setIdentity(emptyIdentity(result.reference?.title ?? result.title.replace(/\s*\(.*\)\s*$/, "").replace(/^.* [-—] /, ""), result.reference?.artist ?? undefined, result.reference?.album));
    setAuth(emptyAuth());
    setPlaylistId("");
  }
  const close = () => {
    setForId(null);
    onClose();
  };
  if (!result) return <Drawer open={false} onClose={close} title="" />;
  const doubtful = isDoubtful(result);
  const variant = VARIANTS.find((v) => v.url === result.url);
  const song = variant ? songByKey(variant.songKey) : undefined;

  const submit = () => {
    const authorizationId = commitAuthorization(auth);
    const ident = commitIdentity(identity);
    const reasons = result.flags.filter((f) => DOUBTFUL.includes(f)).map((f) => FLAG_LABEL[f]);
    const formats = variant?.formats ?? [{ id: "best", ext: "webm", codec: result.codec, container: "webm", abrKbps: result.bitrateKbps, asrHz: 48000, sizeBytes: Math.round((result.bitrateKbps * 1000 * result.durationSec) / 8) }];
    const job = actions.createJob({
      mode: "simulated",
      tool: result.engine,
      toolVersion: settings.engines[result.engine].version,
      source: {
        url: result.url,
        platform: PROVIDER_LABEL[result.provider],
        sourceId: result.url.split(/[=/]/).pop() ?? "",
        title: result.title,
        channel: result.channel,
        durationSec: result.durationSec,
        bitrateKbps: result.bitrateKbps,
        album: song?.album,
        artistGuess: song ? artistByKey(song.artist).name : undefined,
        formats,
        coverSeed: result.coverSeed,
      },
      formatId: formats[0].id,
      identity: ident,
      authorizationId,
      playlistId: playlistId || undefined,
      scenario: result.scenario,
      review: doubtful
        ? {
            reasons: [...reasons, ...(result.reference && Math.abs(result.durationSec - result.reference.durationSec) > 0 ? [`Duration ${result.durationSec - result.reference.durationSec > 0 ? "+" : ""}${result.durationSec - result.reference.durationSec}s vs reference`] : [])],
            requested: { title: result.reference?.title ?? ident.title, artist: result.reference?.artist ?? identity.newArtist.name, durationSec: result.reference?.durationSec ?? song?.dur ?? result.durationSec },
          }
        : undefined,
    });
    setDone({ id: job.id, code: job.code });
    toast({ tone: "success", title: `${job.code} queued`, description: doubtful ? "Doubtful match — it will wait for your review after validation." : "Track it in the queue monitor." });
  };

  return (
    <Drawer
      open
      onClose={close}
      width="lg"
      title="Keep this result"
      subtitle={`${ENGINE_INFO[result.engine].name} · ${PROVIDER_LABEL[result.provider]} · ${fmtDuration(result.durationSec)}`}
      footer={
        done ? (
          <>
            <ButtonLink href={`/queue?job=${done.id}`} variant="primary" size="sm">
              Open {done.code}
            </ButtonLink>
            <Button size="sm" variant="ghost" onClick={close}>
              Back to results
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <div className="flex-1" />
            <Button size="md" variant="primary" disabled={!identityValid(identity) || !authValid(auth)} onClick={submit}>
              Queue download
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6 p-5">
        {done ? (
          <Notice tone="success" title={`${done.code} queued`}>
            Authorization recorded before the download. {doubtful ? "After validation the job waits in Match review — it is never accepted automatically." : "You'll be notified when it is ready."}
          </Notice>
        ) : (
          <>
            {doubtful && (
              <Notice tone="warning" title="Doubtful match">
                {result.flags.filter((f) => DOUBTFUL.includes(f)).map((f) => FLAG_LABEL[f]).join(" · ")}. The file will be downloaded and validated, then held for your review. If you reject it, no other version is substituted.
              </Notice>
            )}
            <section>
              <h3 className="mb-3 text-[14px] font-bold">Identity</h3>
              <IdentityFields value={identity} onChange={setIdentity} channel={result.channel} />
            </section>
            <section>
              <h3 className="mb-3 text-[14px] font-bold">Authorization basis</h3>
              <AuthorizationFields value={auth} onChange={setAuth} />
            </section>
            <section className="max-w-md">
              <PlaylistSelect value={playlistId} onChange={setPlaylistId} />
            </section>
          </>
        )}
      </div>
    </Drawer>
  );
}
