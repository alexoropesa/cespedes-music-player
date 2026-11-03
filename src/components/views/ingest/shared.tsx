"use client";

import { Building2, FileSignature, Receipt, UserRound } from "lucide-react";
import { actions, authStatus, getState, isUsableStatus, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import type { ArtistTier, AuthBasis, AuthScope } from "@/lib/types";
import { fmtDate } from "@/lib/util";
import { AuthStatusBadge, Pill } from "@/components/ui/badges";
import { Checkbox, Field, Input, RadioCard, Segmented, Select, Textarea } from "@/components/ui/form";
import { Notice } from "@/components/ui/layout";
import { BASIS_LABEL, SCOPE_LABEL } from "@/components/tracks";

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

export interface IdentityValue {
  title: string;
  artistId: string; // "" when creating a new one
  newArtist: { name: string; tier: ArtistTier };
  album: string;
}

export const emptyIdentity = (title = "", artistGuess?: string, album?: string): IdentityValue => {
  const match = artistGuess ? getState().artists.find((a) => a.name.toLowerCase() === artistGuess.toLowerCase()) : undefined;
  return {
    title,
    artistId: match?.id ?? "",
    newArtist: { name: match ? "" : (artistGuess ?? ""), tier: "independent" },
    album: album ?? "",
  };
};

export const identityValid = (v: IdentityValue) => !!v.title.trim() && (!!v.artistId || !!v.newArtist.name.trim());

export function commitIdentity(v: IdentityValue) {
  let artistId = v.artistId;
  if (!artistId) artistId = actions.createArtist({ name: v.newArtist.name.trim(), tier: v.newArtist.tier }).id;
  return { title: v.title.trim(), artistId, album: v.album.trim() || undefined };
}

export function IdentityFields({ value, onChange, channel }: { value: IdentityValue; onChange: (v: IdentityValue) => void; channel?: string }) {
  const artists = useStore((s) => s.artists);
  const creating = !value.artistId;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Track title" className="sm:col-span-2">
        <Input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder="e.g. Harbour Lights" />
      </Field>
      <Field
        label="Artist"
        hint={channel ? <>Source channel: “{channel}”. A channel or uploader is never assumed to be the artist — confirm it here.</> : "Confirmed by the operator."}
      >
        <Select value={value.artistId || "__new"} onChange={(e) => onChange({ ...value, artistId: e.target.value === "__new" ? "" : e.target.value })}>
          <option value="__new">+ New artist…</option>
          {artists.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.tier === "established" ? "Established" : "Independent"}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Album" optional>
        <Input value={value.album} onChange={(e) => onChange({ ...value, album: e.target.value })} />
      </Field>
      {creating && (
        <div className="grid gap-4 rounded-xl border border-line bg-surface-1/50 p-4 sm:col-span-2 sm:grid-cols-[1fr_auto]">
          <Field label="New artist name">
            <Input value={value.newArtist.name} onChange={(e) => onChange({ ...value, newArtist: { ...value.newArtist, name: e.target.value } })} placeholder="Artist name" />
          </Field>
          <Field label="Repertoire">
            <Segmented
              label="Artist tier"
              value={value.newArtist.tier}
              onChange={(tier) => onChange({ ...value, newArtist: { ...value.newArtist, tier } })}
              options={[
                { value: "established", label: "Established" },
                { value: "independent", label: "Independent" },
              ]}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Authorization (RF-05 / RF-ING-02): recorded BEFORE any download      */
/* ------------------------------------------------------------------ */

export interface AuthDraft {
  basis: AuthBasis;
  holder: string;
  scope: AuthScope[];
  territory: string;
  validUntil: string; // yyyy-mm-dd or ""
  evidence: string;
  notes: string;
}

export interface AuthValue {
  mode: "existing" | "new";
  authorizationId: string;
  draft: AuthDraft;
  confirmed: boolean;
}

export const emptyAuth = (basis: AuthBasis = "rights-holder"): AuthValue => ({
  // With no usable record yet (fresh workspace), start on "record new".
  mode: getState().authorizations.some((a) => isUsableStatus(authStatus(a, Date.now()))) ? "existing" : "new",
  authorizationId: "",
  draft: { basis, holder: "", scope: ["copy", "retain"], territory: "ES", validUntil: "", evidence: "", notes: "" },
  confirmed: false,
});

export function authValid(v: AuthValue) {
  if (!v.confirmed) return false;
  if (v.mode === "existing") return !!v.authorizationId;
  const d = v.draft;
  return !!d.holder.trim() && !!d.evidence.trim() && d.scope.includes("copy") && d.scope.includes("retain") && !!d.territory.trim();
}

export function commitAuthorization(v: AuthValue) {
  if (v.mode === "existing") return v.authorizationId;
  const d = v.draft;
  return actions.createAuthorization({
    basis: d.basis,
    holder: d.holder.trim(),
    scope: d.scope,
    territory: d.territory.trim(),
    validFrom: Date.now(),
    validUntil: d.validUntil ? new Date(d.validUntil + "T23:59:59").getTime() : null,
    evidence: d.evidence.trim(),
    notes: d.notes.trim() || undefined,
    review: "approved",
  }).id;
}

const BASIS_ICON: Record<AuthBasis, React.ReactNode> = {
  "own-content": <UserRound size={17} />,
  "rights-holder": <FileSignature size={17} />,
  purchase: <Receipt size={17} />,
  license: <Building2 size={17} />,
};
const BASIS_DESC: Record<AuthBasis, string> = {
  "own-content": "Recordings the client owns.",
  "rights-holder": "Written permission from the artist or label.",
  purchase: "A download purchase that allows keeping a copy.",
  license: "A license whose terms cover copy and retention.",
};

export function AuthorizationFields({ value, onChange }: { value: AuthValue; onChange: (v: AuthValue) => void }) {
  const auths = useStore((s) => s.authorizations);
  const now = useNow();
  const usable = auths.filter((a) => isUsableStatus(authStatus(a, now)));
  const blocked = auths.filter((a) => !isUsableStatus(authStatus(a, now)));
  const selected = auths.find((a) => a.id === value.authorizationId);
  const d = value.draft;
  const setDraft = (p: Partial<AuthDraft>) => onChange({ ...value, draft: { ...d, ...p } });

  return (
    <div className="space-y-5">
      <Segmented
        label="Authorization source"
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode, confirmed: false })}
        options={[
          { value: "existing", label: "Use existing record" },
          { value: "new", label: "Record new authorization" },
        ]}
      />

      {value.mode === "existing" ? (
        <div className="space-y-3">
          <Field label="Authorization record" hint={blocked.length ? `${blocked.length} record(s) hidden: expired, revoked or under review can't authorize a download.` : undefined}>
            <Select value={value.authorizationId} onChange={(e) => onChange({ ...value, authorizationId: e.target.value, confirmed: false })}>
              <option value="">Select a record…</option>
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} · {a.holder} · {BASIS_LABEL[a.basis]}
                </option>
              ))}
            </Select>
          </Field>
          {selected && (
            <div className="rounded-xl border border-line bg-surface-1/50 p-4 text-[13px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{selected.holder}</span>
                <AuthStatusBadge status={authStatus(selected, now)} />
              </div>
              <div className="mt-2 grid gap-1 text-fg-2 sm:grid-cols-2">
                <span>Basis: {BASIS_LABEL[selected.basis]}</span>
                <span>Territory: {selected.territory}</span>
                <span>Valid until: {selected.validUntil ? fmtDate(selected.validUntil) : "No expiry"}</span>
                <span className="flex flex-wrap gap-1">
                  {selected.scope.map((s) => (
                    <Pill key={s}>{SCOPE_LABEL[s]}</Pill>
                  ))}
                </span>
              </div>
              <div className="mt-2 text-[12px] text-fg-3">Evidence: {selected.evidence}</div>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div role="radiogroup" aria-label="Authorization basis" className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(BASIS_LABEL) as AuthBasis[]).map((b) => (
              <RadioCard key={b} checked={d.basis === b} onChange={() => setDraft({ basis: b })} title={BASIS_LABEL[b]} description={BASIS_DESC[b]} icon={BASIS_ICON[b]} />
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rights holder" className="sm:col-span-2">
              <Input value={d.holder} onChange={(e) => setDraft({ holder: e.target.value })} placeholder="Artist, label or the client (own content)" />
            </Field>
            <Field label="Territory">
              <Input value={d.territory} onChange={(e) => setDraft({ territory: e.target.value })} placeholder="e.g. ES, Worldwide" />
            </Field>
            <Field label="Valid until" optional hint="Leave empty for no expiry.">
              <Input type="date" value={d.validUntil} onChange={(e) => setDraft({ validUntil: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
              <div className="mb-2 text-[12.5px] font-semibold">Scope</div>
              <div className="flex flex-wrap gap-5">
                {(Object.keys(SCOPE_LABEL) as AuthScope[]).map((s) => (
                  <Checkbox
                    key={s}
                    checked={d.scope.includes(s)}
                    onChange={(on) => setDraft({ scope: on ? [...d.scope, s] : d.scope.filter((x) => x !== s) })}
                    label={SCOPE_LABEL[s]}
                  />
                ))}
              </div>
              {!(d.scope.includes("copy") && d.scope.includes("retain")) && <p className="mt-2 text-[12px] text-st-failed">Copy and Retain are required to keep a file.</p>}
            </div>
            <Field label="Evidence" className="sm:col-span-2" hint="Document reference, receipt number, email ID or license URL.">
              <Input value={d.evidence} onChange={(e) => setDraft({ evidence: e.target.value })} placeholder="e.g. Signed permission letter AH-PL-0291 (PDF)" />
            </Field>
            <Field label="Notes" optional className="sm:col-span-2">
              <Textarea value={d.notes} onChange={(e) => setDraft({ notes: e.target.value })} rows={2} />
            </Field>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-line bg-surface-1/50 p-4">
        <Checkbox
          checked={value.confirmed}
          onChange={(confirmed) => onChange({ ...value, confirmed })}
          label="I confirm this source is covered by the authorization above"
          description="Recorded with your user and IP before the download starts. A successful download does not prove authorization; use stays limited to personal listening."
        />
      </div>
      <Notice tone="info">Out of scope: account cookies or personal sessions, paid content, DRM and any circumvention of access controls.</Notice>
    </div>
  );
}

export function PlaylistSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const playlists = useStore((s) => s.playlists);
  return (
    <Field label="Also add to playlist" optional hint="Added only after the track reaches Ready. Whole playlists are never downloaded by default.">
      <Select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Library only</option>
        {playlists.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </Select>
    </Field>
  );
}
