import { connection } from "next/server";
import { LIBRARY_ROOT, ORIGINALS_DIR, listFolders } from "@/server/library";
import { localOnly, noStore } from "@/server/guard";
import type { LibraryInfo } from "@/lib/library-types";

/** Where the library lives on disk and which folders are registered for scanning. */
export async function GET(request: Request) {
  await connection();
  const denied = localOnly(request);
  if (denied) return denied;
  const info: LibraryInfo = { libraryRoot: LIBRARY_ROOT, originalsDir: ORIGINALS_DIR, folders: await listFolders() };
  return Response.json(info, { headers: noStore });
}
