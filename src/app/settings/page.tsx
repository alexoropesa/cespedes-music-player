import type { Metadata } from "next";
import { IngestionSettings } from "@/components/views/settings";

export const metadata: Metadata = { title: "Ingestion settings" };

export default function Page() {
  return <IngestionSettings />;
}
