import { createJob } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";
import { ENGINES, type EngineId } from "@/lib/types";

/** Starts a download for an accepted job; idempotent per key (RNF-FIA-02/03). */
export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { key?: unknown; engine?: unknown; url?: unknown; formatId?: unknown; maxSizeMB?: unknown } | null;
  const engine = b?.engine as EngineId;
  if (!b || typeof b.key !== "string" || typeof b.url !== "string" || !ENGINES.includes(engine) || typeof b.maxSizeMB !== "number") {
    return Response.json({ error: "key, engine, url and maxSizeMB are required" }, { status: 400 });
  }
  const r = await createJob({ key: b.key, engine, url: b.url, formatId: typeof b.formatId === "string" ? b.formatId : undefined, maxSizeMB: Math.max(1, Math.min(2000, b.maxSizeMB)) });
  if (!r.ok) return Response.json({ error: r.message }, { status: r.status });
  return Response.json(r.state, { status: 201, headers: noStore });
}
