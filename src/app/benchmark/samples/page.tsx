import type { Metadata } from "next";
import { SamplesView } from "@/components/views/benchmark";

export const metadata: Metadata = { title: "Sample set" };

export default function Page() {
  return <SamplesView />;
}
