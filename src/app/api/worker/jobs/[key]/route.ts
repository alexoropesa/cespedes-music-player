import { getJob, removeJob } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";

export async function GET(request: Request, ctx: RouteContext<"/api/worker/jobs/[key]">) {
  const denied = localOnly(request);
  if (denied) return denied;
  const { key } = await ctx.params;
  const state = getJob(key);
  if (!state) return Response.json({ error: "No such worker job (the worker may have restarted)" }, { status: 404, headers: noStore });
  return Response.json(state, { headers: noStore });
}

/** Cancels the job if running and removes its staging folder. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/worker/jobs/[key]">) {
  const denied = localOnly(request);
  if (denied) return denied;
  const { key } = await ctx.params;
  await removeJob(key);
  return new Response(null, { status: 204 });
}
