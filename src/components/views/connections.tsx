"use client";

import { useState } from "react";
import { ArrowRight, Check, CircleSlash, HardDrive, Lock, Plug, Radio, Wifi } from "lucide-react";
import { actions, useStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/ui/badges";
import { Switch } from "@/components/ui/form";
import { Body, Card, Notice, PageHeader } from "@/components/ui/layout";
import { Modal } from "@/components/ui/overlay";

const SPOTIFY_NOTICE = "Connect your Spotify account to browse your playlists and listen online. Subject to access availability and provider terms. Does not include file downloads or rebroadcast rights.";
const APPLE_NOTICE = "Connect your Apple Music account to browse your library and playlists and listen online with MusicKit. Subject to provider terms. Does not include file downloads or rebroadcast rights.";

const PROVIDERS = {
  spotify: {
    name: "Spotify",
    test: "Test B",
    color: "#1ed760",
    notice: SPOTIFY_NOTICE,
    flow: ["Connect", "Official authorization (OAuth + PKCE)", "Browse playlists", "Listen with Web Playback SDK", "Disconnect & revoke"],
    scopes: [
      ["playlist-read-private", "Read your private playlists"],
      ["streaming", "Play in this browser (Premium required)"],
      ["user-read-private", "Check subscription level"],
    ],
    blocked: "Requires Spotify Developer Dashboard access with a Premium app owner (TBD-04). No account data is requested until then.",
  },
  "apple-music": {
    name: "Apple Music",
    test: "Test C",
    color: "#fa2d48",
    notice: APPLE_NOTICE,
    flow: ["Connect", "MusicKit authorization (developer + user token)", "Browse catalog & library", "Listen with MusicKit JS", "Disconnect"],
    scopes: [
      ["Catalog", "Search the Apple Music catalog"],
      ["Library & playlists", "Read your library and playlists"],
      ["Playback", "Play with MusicKit JS (subscription required)"],
    ],
    blocked: "Requires Apple Developer Program keys and MusicKit configuration. Only evaluated if the client asks for it (TBD-05).",
  },
} as const;

type P = keyof typeof PROVIDERS;

export function ConnectionsView() {
  const connections = useStore((s) => s.connections);
  const [connect, setConnect] = useState<P | null>(null);
  const apple = connections.find((c) => c.provider === "apple-music");

  return (
    <>
      <PageHeader
        eyebrow="Connections"
        title="Online providers"
        description="Optional online listening with the client's own accounts through official SDKs. Kept completely separate from the local library: no files, no processing, no mixing."
      />
      <Body className="space-y-6">
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title={<span className="inline-flex items-center gap-2"><HardDrive size={16} /> Local path</span>} description="Pilot A · works offline">
            <p className="text-[13px] leading-relaxed text-fg-2">Authorized source → ingest with states and validation (hash, ffprobe) → local library (original + derivatives, provenance, permission) → local playback without internet.</p>
          </Card>
          <Card title={<span className="inline-flex items-center gap-2"><Wifi size={16} /> Online path</span>} description="Tests B and C · needs internet, no files">
            <p className="text-[13px] leading-relaxed text-fg-2">Client account → official OAuth authorization with minimal scopes → provider SDK → listening in the browser. Provider audio never enters the library or the processor.</p>
          </Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {(Object.keys(PROVIDERS) as P[]).map((p) => {
            const meta = PROVIDERS[p];
            const conn = connections.find((c) => c.provider === p);
            const enabled = p === "spotify" ? true : !!apple?.enabled;
            return (
              <section key={p} className="flex flex-col rounded-[14px] border border-line bg-surface-2/70 p-5">
                <div className="flex items-start gap-4">
                  <div className="flex size-12 items-center justify-center rounded-xl" style={{ background: `color-mix(in oklab, ${meta.color} 18%, transparent)`, color: meta.color }}>
                    <Radio size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-extrabold tracking-[-0.02em]">{meta.name}</h3>
                      <Pill>{meta.test}</Pill>
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12.5px] text-fg-3">
                      <CircleSlash size={13} /> Not connected
                    </div>
                  </div>
                  {p === "apple-music" && (
                    <label className="flex items-center gap-2 text-[12px] text-fg-2">
                      Evaluate
                      <Switch checked={enabled} onChange={(v) => actions.setAppleMusicEvaluation(v)} label="Evaluate Apple Music (Test C)" />
                    </label>
                  )}
                </div>
                <p className="mt-4 rounded-xl border border-line bg-surface-1/60 p-3.5 text-[12.5px] leading-relaxed text-fg-2">{meta.notice}</p>
                <ol className="mt-4 space-y-1.5 text-[12.5px] text-fg-2">
                  {meta.flow.map((step, i) => (
                    <li key={step} className="flex items-center gap-2">
                      <span className="flex size-5 items-center justify-center rounded-full bg-white/[0.06] text-[10.5px] font-bold">{i + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <div className="mt-auto pt-5">
                  {conn?.note && <p className="mb-3 text-[12px] text-fg-3">{conn.note}</p>}
                  <div className="flex flex-wrap gap-2">
                    <Button variant="primary" icon={<Plug size={15} />} disabled={!enabled} onClick={() => setConnect(p)}>
                      Connect {meta.name}
                    </Button>
                    <Button variant="ghost" disabled title="Nothing to disconnect">
                      Disconnect
                    </Button>
                  </div>
                </div>
              </section>
            );
          })}
        </div>

        <Notice title="What these connections never do">
          No provider password or Apple ID form in this app (sign-in happens on the provider&apos;s own page). No downloading, recording or capturing provider audio, no sending it to the local queue, no mixing it with other sources, and no listening statistics before a policy review. Tokens would be stored encrypted and never logged.
        </Notice>
      </Body>

      <Modal
        open={!!connect}
        onClose={() => setConnect(null)}
        title={connect ? `Connect ${PROVIDERS[connect].name}` : ""}
        description="You'll be redirected to the provider's official page to authorize. This app never asks for your password."
        icon={<Plug size={18} />}
        footer={
          connect && (
            <>
              <Button variant="ghost" onClick={() => setConnect(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                iconRight={<ArrowRight size={15} />}
                onClick={() => {
                  actions.logConnectionAttempt(PROVIDERS[connect].name);
                  toast({ tone: "warning", title: "Developer access pending", description: PROVIDERS[connect].blocked });
                  setConnect(null);
                }}
              >
                Continue to {PROVIDERS[connect].name}
              </Button>
            </>
          )
        }
      >
        {connect && (
          <div className="space-y-4">
            <p className="rounded-xl border border-line bg-surface-1/60 p-3.5 text-[13px] leading-relaxed text-fg-2">{PROVIDERS[connect].notice}</p>
            <div>
              <div className="mb-2 text-[12.5px] font-semibold">Minimal permissions requested</div>
              <ul className="space-y-2">
                {PROVIDERS[connect].scopes.map(([scope, desc]) => (
                  <li key={scope} className="flex items-start gap-2.5 text-[13px]">
                    <Check size={15} className="mt-0.5 shrink-0 text-st-ready" />
                    <span>
                      <span className="font-mono text-[12px] text-fg">{scope}</span>
                      <span className="block text-[12px] text-fg-3">{desc}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <Notice tone="warning" title="Blocked in this phase">
              <span className="inline-flex items-start gap-1.5">
                <Lock size={13} className="mt-0.5 shrink-0" /> {PROVIDERS[connect].blocked}
              </span>
            </Notice>
          </div>
        )}
      </Modal>
    </>
  );
}
