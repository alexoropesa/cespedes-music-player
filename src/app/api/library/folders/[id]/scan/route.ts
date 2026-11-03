import { scanFolder } from "@/server/library";
import { localOnly, noStore } from "@/server/guard";

/** Lists the audio files of a registered folder with their tags (nothing is modified). */
export async function POST(request: Request, ctx: RouteContext<"/api/library/folders/[id]/scan">) {
  const denied = localOnly(request);
  if (denied) return denied;
  const { id } = await ctx.params;
  const r = await scanFolder(id);
  if (!r.ok) return Response.json({ error: r.message }, { status: 404 });
  return Response.json(r, { headers: noStore });
}
