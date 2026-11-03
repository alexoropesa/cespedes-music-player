/** The worker spawns local tools: only accept requests addressed to this PC (RI-COM-04). */
export function localOnly(request: Request): Response | null {
  const host = (request.headers.get("host") ?? "").replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return null;
  return Response.json({ error: "The ingestion worker only accepts requests from this PC." }, { status: 403 });
}

export const noStore = { "Cache-Control": "no-store" };
