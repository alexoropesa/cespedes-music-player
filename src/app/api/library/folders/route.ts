import { addFolder, removeFolder } from "@/server/library";
import { localOnly, noStore } from "@/server/guard";

/** Registers a music folder by path (its files are imported in place). */
export async function POST(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const b = (await request.json().catch(() => null)) as { path?: unknown; authorizationId?: unknown } | null;
  if (!b || typeof b.path !== "string" || typeof b.authorizationId !== "string" || !b.authorizationId) return Response.json({ error: "path and authorizationId are required" }, { status: 400 });
  const r = await addFolder(b.path, b.authorizationId);
  if (!r.ok) return Response.json({ error: r.message }, { status: 400 });
  return Response.json(r.folder, { status: 201, headers: noStore });
}

/** Unregisters a folder. Its files on disk are not touched. */
export async function DELETE(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  await removeFolder(id);
  return new Response(null, { status: 204 });
}
