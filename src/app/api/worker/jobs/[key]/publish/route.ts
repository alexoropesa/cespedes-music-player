import { publishJob } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";

/** Moves a validated download into library/originals (called after every check passed). */
export async function POST(request: Request, ctx: RouteContext<"/api/worker/jobs/[key]/publish">) {
  const denied = localOnly(request);
  if (denied) return denied;
  const { key } = await ctx.params;
  const b = (await request.json().catch(() => null)) as { artist?: unknown; title?: unknown } | null;
  if (!b || typeof b.artist !== "string" || typeof b.title !== "string") return Response.json({ error: "artist and title are required" }, { status: 400 });
  const r = await publishJob(key, b.artist, b.title);
  if (!r.ok) return Response.json({ error: r.message }, { status: r.status });
  return Response.json({ path: r.path }, { headers: noStore });
}
