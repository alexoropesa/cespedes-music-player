import type { Metadata } from "next";
import { Suspense } from "react";
import { PlaylistDetail } from "@/components/views/playlists";
import { ViewSkeleton } from "@/components/ui/layout";

export const metadata: Metadata = { title: "Playlist" };

/* Playlist ids are created on the client (local workspace), so params are
   runtime data: the detail streams in behind a Suspense boundary. */
export default function Page({ params }: PageProps<"/playlists/[id]">) {
  return (
    <Suspense fallback={<ViewSkeleton />}>
      <PlaylistDetail params={params} />
    </Suspense>
  );
}
