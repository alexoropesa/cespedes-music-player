import type { Metadata } from "next";
import { ImportView } from "@/components/views/ingest/import";

export const metadata: Metadata = { title: "Import from disk" };

export default function Page() {
  return <ImportView />;
}
