import type { Metadata } from "next";
import { Suspense } from "react";
import { QueueView } from "@/components/views/queue";
import { ViewSkeleton } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Queue monitor" };

export default function Page() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <QueueView />
    </Suspense>
  );
}
