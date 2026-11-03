import type { Metadata } from "next";
import { DuplicatesView } from "@/components/views/library";

export const metadata: Metadata = { title: "Duplicates" };

export default function Page() {
  return <DuplicatesView />;
}
