import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { canManageLibrary } from "@/lib/roles";
import { isLibraryKey, libraryStatusOf } from "@/lib/library/libraryKeys";

const bodySchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(200) });

/**
 * Which order files are «В библиотеке»: saved from that file, or the file
 * itself points at a library key. `{ inLibrary: { [fileId]: libraryFileId },
 * archived: { [fileId]: libraryFileId } }` — `archived` only for files whose
 * copy sits in the library archive (no active copy), so the UI offers
 * «Восстановить» instead of a second copy. `canManage`: may restore.
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
    where: { OR: [{ sourceFileId: { in: ids } }, ...(libKeys.length ? [{ storageKey: { in: libKeys } }] : [])] },
    select: { id: true, sourceFileId: true, storageKey: true, archivedAt: true },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ ...libraryStatusOf(files, rows), canManage: canManageLibrary(user.role) });
}
