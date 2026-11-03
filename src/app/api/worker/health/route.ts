import { connection } from "next/server";
import { health } from "@/server/worker";
import { localOnly, noStore } from "@/server/guard";

/** Installed engines, FFmpeg and their versions (RNF-MAN-01). */
export async function GET(request: Request) {
  await connection();
  const denied = localOnly(request);
  if (denied) return denied;
  return Response.json(await health(), { headers: noStore });
}
