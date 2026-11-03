import { embeddedPicture } from "@/server/library";
import { localOnly, noStore } from "@/server/guard";

/** Embedded artwork of a library file, if it has one. */
export async function GET(request: Request) {
  const denied = localOnly(request);
  if (denied) return denied;
  const p = new URL(request.url).searchParams.get("p");
  if (!p) return Response.json({ error: "p is required" }, { status: 400 });
  const img = await embeddedPicture(p);
  if (!img) return Response.json({ error: "No embedded picture" }, { status: 404, headers: noStore });
  const type = img[0] === 0x89 ? "image/png" : "image/jpeg";
  return new Response(new Uint8Array(img), { headers: { ...noStore, "Content-Type": type } });
}
