import type { Metadata } from "next";
import { Suspense } from "react";
import { BenchmarkView } from "@/components/views/benchmark";
import { ViewSkeleton } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Engine benchmark" };

export default function Page() {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <BenchmarkView />
    </Suspense>
  );
}
