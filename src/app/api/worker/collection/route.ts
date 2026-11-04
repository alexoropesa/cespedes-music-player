import { inspectCollection } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";

/** Songs of a Spotify playlist/album or Apple Music album, for Match (nothing is downloaded). */
export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  if (!body || typeof body.url !== "string") return Response.json({ error: "url is required" }, { status: 400 });
  return Response.json(await inspectCollection(body.url), { headers: noStore });
}
