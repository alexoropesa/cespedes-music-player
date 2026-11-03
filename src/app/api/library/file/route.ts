import { deleteManaged, serveFile } from "@/server/library";
import { localOnly } from "@/server/guard";

/** Streams a library file (Range-capable, for the player). */
export async function GET(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const p = new URL(request.url).searchParams.get("p");
  if (!p) return Response.json({ error: "p is required" }, { status: 400 });
  return serveFile(p, request.headers.get("range"));
}

/** Deletes a file of the managed library (never a file in a scanned folder). */
export async function DELETE(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const p = new URL(request.url).searchParams.get("p");
  if (!p) return Response.json({ error: "p is required" }, { status: 400 });
  const r = await deleteManaged(p);
  if (!r.ok) return Response.json({ error: r.message }, { status: 409 });
  return new Response(null, { status: 204 });
}
