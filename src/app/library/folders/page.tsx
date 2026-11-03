import type { Metadata } from "next";
import { FoldersView } from "@/components/views/folders";

export const metadata: Metadata = { title: "Music folders" };

export default function Page() {
  return <FoldersView />;
}
