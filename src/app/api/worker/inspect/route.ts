import { inspect } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";
import { ENGINES, type EngineId } from "@/lib/types";

/** Metadata and formats of a source URL, without downloading (RF-BUS-01). */
export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { url?: unknown; engine?: unknown } | null;
  const engine = body?.engine as EngineId;
  if (!body || typeof body.url !== "string" || !ENGINES.includes(engine)) return Response.json({ error: "url and engine are required" }, { status: 400 });
  return Response.json(await inspect(body.url, engine), { headers: noStore });
}
