import type { Metadata } from "next";
import { Suspense } from "react";
import { SearchView } from "@/components/views/ingest/search";
import { ViewSkeleton } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Text search" };

export default function Page() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <SearchView />
    </Suspense>
  );
}
