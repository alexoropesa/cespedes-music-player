import type { Metadata } from "next";
import { Suspense } from "react";
import { TracksView } from "@/components/views/library";
import { ViewSkeleton } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Library" };

export default function Page() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <TracksView />
    </Suspense>
  );
}
