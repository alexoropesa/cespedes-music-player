import type { Metadata } from "next";
import { Suspense } from "react";
import { UrlIngestView } from "@/components/views/ingest/url";
import { ViewSkeleton } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Ingest from URL" };

export default function Page() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <UrlIngestView />
    </Suspense>
  );
}
