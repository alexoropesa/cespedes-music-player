"use client";

import { Pause, Play, Plus } from "lucide-react";
import { actions, authStatus, isAwaitingReview, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader, SubNav } from "@/components/ui/layout";

export function IngestHeader() {
  return (
    <PageHeader
      eyebrow="Ingest"
      title="Bring in authorized tracks"
      description="Download from a URL with yt-dlp, spotDL or FreyrJS on this PC, or import a file from disk. Every file is validated for real — full decode, real codec, duration, SHA-256 and duplicates — before it reaches the library."
    >
      <SubNav
        items={[
          { href: "/ingest", label: "Import from disk", exact: true },
          { href: "/ingest/url", label: "From URL" },
        ]}
      />
    </PageHeader>
  );
}

export function QueueHeader() {
  const jobs = useStore((s) => s.jobs);
  const paused = useStore((s) => s.queuePaused);
  const active = jobs.filter((j) => j.status === "pending" || j.status === "downloading" || (j.status === "validating" && !isAwaitingReview(j))).length;
  return (
    <PageHeader
      eyebrow="Queue monitor"
      title="Ingestion queue"
      description="Live state of every job. One job runs at a time in an isolated staging folder; retries are bounded."
      actions={
        <>
          <Button variant={paused ? "primary" : "secondary"} icon={paused ? <Play size={15} /> : <Pause size={15} />} onClick={() => actions.setQueuePaused(!paused)}>
            {paused ? "Resume queue" : "Pause queue"}
          </Button>
          <ButtonLink href="/ingest" variant="primary" icon={<Plus size={16} />}>
            Import track
          </ButtonLink>
        </>
      }
    >
      <SubNav
        items={[
          { href: "/queue", label: "Jobs", exact: true, count: active },
          { href: "/queue/worker", label: "Worker & sandbox" },
        ]}
      />
    </PageHeader>
  );
}

export function LibraryHeader() {
  const tracks = useStore((s) => s.tracks);
  const artists = useStore((s) => s.artists);
  const dups = useStore((s) => s.duplicates);
  return (
    <PageHeader
      eyebrow="Library"
      title="Operational library"
      description="Only validated, ready tracks live here — local files with their original, provenance and authorization."
      actions={
        <ButtonLink href="/ingest" variant="primary" icon={<Plus size={16} />}>
          Import track
        </ButtonLink>
      }
    >
      <SubNav
        items={[
          { href: "/library", label: "Tracks", exact: true, count: tracks.length },
          { href: "/library/artists", label: "Artists", count: artists.length },
          { href: "/library/duplicates", label: "Duplicates", count: dups.filter((d) => !d.dismissed).length },
          { href: "/library/folders", label: "Folders" },
        ]}
      />
    </PageHeader>
  );
}

export function RightsHeader() {
  const auths = useStore((s) => s.authorizations);
  const now = useNow();
  const alerts = now ? auths.filter((a) => ["expired", "expiring", "under-review"].includes(authStatus(a, now))).length : 0;
  return (
    <PageHeader
      eyebrow="Rights & provenance"
      title="Authorizations and provenance"
      description="Every file keeps its authorization basis (own content, permission, purchase or license) and its origin. A working download does not prove authorization."
    >
      <SubNav
        items={[
          { href: "/rights", label: "Authorizations", exact: true, count: alerts },
          { href: "/rights/provenance", label: "Provenance register" },
        ]}
      />
    </PageHeader>
  );
}

export function SettingsHeader() {
  return (
    <PageHeader eyebrow="Settings" title="Settings" description="Limits and policies for imports. Changes apply to new jobs; running jobs keep the limits they were created with.">
      <SubNav
        items={[
          { href: "/settings", label: "Ingestion", exact: true },
          { href: "/settings/validation", label: "Validation & storage" },
          { href: "/settings/workspace", label: "Workspace" },
        ]}
      />
    </PageHeader>
  );
}
