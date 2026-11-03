import type { Metadata } from "next";
import { ReferencesView } from "@/components/views/library";

export const metadata: Metadata = { title: "References" };

export default function Page() {
  return <ReferencesView />;
}
