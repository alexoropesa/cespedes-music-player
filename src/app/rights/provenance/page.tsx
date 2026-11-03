import type { Metadata } from "next";
import { ProvenanceView } from "@/components/views/rights";

export const metadata: Metadata = { title: "Provenance register" };

export default function Page() {
  return <ProvenanceView />;
}
