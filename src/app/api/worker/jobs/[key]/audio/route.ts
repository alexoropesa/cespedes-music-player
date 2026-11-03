import { openFile } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";

/** Bytes of the validated audio file in staging, for the app to store locally. */
export async function GET(request: Request, ctx: RouteContext<"/api/worker/jobs/[key]/audio">) {
  const denied = localOnly(request);
  if (denied) return denied;
  const { key } = await ctx.params;
  const f = await openFile(key, "audio");
  if (!f) return Response.json({ error: "Not available" }, { status: 404, headers: noStore });
  return new Response(f.stream, { headers: { ...noStore, "Content-Type": f.type, "Content-Length": String(f.size), "Content-Disposition": `inline; filename="${encodeURIComponent(f.name)}"` } });
}
