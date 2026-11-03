/**
 * Returns the requesting client's IP so audit entries record the real
 * operator address (RNF Auditability). The back office is meant to run on the
 * client's own PC (RI-COM-04), so this is usually a loopback/LAN address.
 */
export async function GET(request: Request) {
  const h = request.headers;
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "127.0.0.1";
  return Response.json({ ip: ip === "::1" || ip === "::ffff:127.0.0.1" ? "127.0.0.1" : ip }, { headers: { "Cache-Control": "no-store" } });
}
