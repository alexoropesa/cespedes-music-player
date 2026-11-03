import type { Metadata } from "next";
import { ReviewView } from "@/components/views/ingest/review";

export const metadata: Metadata = { title: "Match review" };

export default function Page() {
  return <ReviewView />;
}
