import type { Metadata } from "next";
import { ArtistsView } from "@/components/views/library";

export const metadata: Metadata = { title: "Artists" };

export default function Page() {
  return <ArtistsView />;
}
