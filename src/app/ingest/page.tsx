import type { Metadata } from "next";
import { ImportView } from "@/components/views/ingest/import";

export const metadata: Metadata = { title: "Import track" };

export default function Page() {
  return <ImportView />;
}
