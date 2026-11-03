import type { Metadata } from "next";
import { PlaylistsView } from "@/components/views/playlists";

export const metadata: Metadata = { title: "Playlists" };

export default function Page() {
  return <PlaylistsView />;
}
