import { probeLocal } from "@/server/library";
import { localOnly, noStore } from "@/server/guard";

/** Validates a file already on disk: ffprobe, full FFmpeg decode, SHA-256. */
export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { path?: unknown } | null;
  if (!b || typeof b.path !== "string") return Response.json({ error: "path is required" }, { status: 400 });
  const r = await probeLocal(b.path);
  if (!r.ok) return Response.json({ error: r.message }, { status: r.status });
  return Response.json(r.result, { headers: noStore });
}
