import { inspect } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";
import { ENGINES, type EngineId } from "@/lib/types";

/** Metadata and formats of a source URL, without downloading (RF-BUS-01). */
export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const body = (await request.json().catch(() => null)) as { url?: unknown; engine?: unknown; toleranceSec?: unknown } | null;
  const engine = body?.engine as EngineId;
  if (!body || typeof body.url !== "string" || !ENGINES.includes(engine)) return Response.json({ error: "url and engine are required" }, { status: 400 });
  // Match picks only uploads the duration check will accept (Settings › Validation tolerance).
  const tol = typeof body.toleranceSec === "number" && Number.isFinite(body.toleranceSec) ? Math.min(60, Math.max(0, body.toleranceSec)) : 2;
  return Response.json(await inspect(body.url, engine, tol), { headers: noStore });
}
