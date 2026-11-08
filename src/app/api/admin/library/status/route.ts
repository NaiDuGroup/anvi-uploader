import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { canManageLibrary } from "@/lib/roles";
import { isLibraryKey } from "@/lib/library/libraryKeys";

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

/**
 * Which order files are «В библиотеке»: saved from that file, or the file
 * itself points at a library key. `{ inLibrary: { [fileId]: libraryFileId } }`.
 */
export async function POST(request: NextRequest) {
  const { user, denied } = await requireLibraryStaff();
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const ids = [...new Set(parsed.data.ids)];

  const files = await prisma.file.findMany({ where: { id: { in: ids } }, select: { id: true, fileUrl: true } });
  const libKeys = files.filter((f) => isLibraryKey(f.fileUrl)).map((f) => f.fileUrl);
  const rows = await prisma.libraryFile.findMany({
    where: {
      archivedAt: null,
      OR: [{ sourceFileId: { in: ids } }, ...(libKeys.length ? [{ storageKey: { in: libKeys } }] : [])],
    },
    select: { id: true, sourceFileId: true, storageKey: true },
  });
  const byKey = new Map(rows.map((r) => [r.storageKey, r.id]));
  const inLibrary: Record<string, string> = {};
  for (const r of rows) if (r.sourceFileId) inLibrary[r.sourceFileId] = r.id;
  for (const f of files) {
    const hit = byKey.get(f.fileUrl);
    if (hit) inLibrary[f.id] = hit;
  }
  return NextResponse.json({ inLibrary, canManage: canManageLibrary(user.role) });
}
