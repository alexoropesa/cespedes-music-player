import type { Metadata } from "next";
import { RunsView } from "@/components/views/benchmark";

export const metadata: Metadata = { title: "Benchmark runs" };

export default function Page() {
  return <RunsView />;
}
