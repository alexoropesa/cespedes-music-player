"use client";

import { FileUp, Pause, Play, Plus, SearchCheck } from "lucide-react";
import { actions, authStatus, isAwaitingReview, useStore } from "@/lib/store";
import { useNow } from "@/lib/clock";
import { Button, ButtonLink } from "@/components/ui/button";
import { PageHeader, SubNav } from "@/components/ui/layout";

export function IngestHeader() {
  const reviews = useStore((s) => s.reviews);
  const n = reviews.filter((r) => r.status === "needs-review").length;
  return (
    <PageHeader
      eyebrow="Ingest"
      title="Bring in authorized tracks"
      description="Inspect before downloading, record the authorization basis and provenance, and let the worker validate every file. Nothing is purchased or bulk-downloaded automatically."
      actions={
        <>
          <ButtonLink href="/ingest/import" variant="secondary" icon={<FileUp size={16} />}>
            Import file
          </ButtonLink>
          <ButtonLink href="/ingest/search" variant="secondary" icon={<SearchCheck size={16} />}>
            Search by text
          </ButtonLink>
        </>
      }
    >
      <SubNav
        items={[
          { href: "/ingest", label: "From URL", exact: true },
          { href: "/ingest/search", label: "Text search" },
          { href: "/ingest/review", label: "Match review", count: n },
          { href: "/ingest/import", label: "Import from disk" },
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
            New ingest
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
  const refs = useStore((s) => s.references);
  const dups = useStore((s) => s.duplicates);
  return (
    <PageHeader
      eyebrow="Library"
      title="Operational library"
      description="Only validated, ready tracks live here — local files with their original, provenance and authorization. References to online providers are kept apart and never play as local audio."
      actions={
        <ButtonLink href="/ingest" variant="primary" icon={<Plus size={16} />}>
          Add tracks
        </ButtonLink>
      }
    >
      <SubNav
        items={[
          { href: "/library", label: "Tracks", exact: true, count: tracks.length },
          { href: "/library/artists", label: "Artists", count: artists.length },
          { href: "/library/references", label: "References", count: refs.length },
          { href: "/library/duplicates", label: "Duplicates", count: dups.filter((d) => !d.dismissed).length },
        ]}
      />
    </PageHeader>
  );
}

export function BenchmarkHeader() {
  const runs = useStore((s) => s.benchRuns);
  const samples = useStore((s) => s.samples);
  return (
    <PageHeader
      eyebrow="Engine benchmark"
      title="yt-dlp vs spotDL vs FreyrJS"
      description="The same authorized samples, run through each engine, to compare response time, metadata accuracy, download success and match quality before choosing an ingestion tool."
    >
      <SubNav
        items={[
          { href: "/benchmark", label: "Comparison", exact: true },
          { href: "/benchmark/runs", label: "Runs", count: runs.length },
          { href: "/benchmark/samples", label: "Sample set", count: samples.length },
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
    <PageHeader eyebrow="Settings" title="Settings" description="Pilot limits and policies. Changes apply to new jobs; running jobs keep the limits they were created with.">
      <SubNav
        items={[
          { href: "/settings", label: "Ingestion", exact: true },
          { href: "/settings/engines", label: "Engines" },
          { href: "/settings/validation", label: "Validation & storage" },
          { href: "/settings/workspace", label: "Workspace" },
        ]}
      />
    </PageHeader>
  );
}
