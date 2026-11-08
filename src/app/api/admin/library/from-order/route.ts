import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { LIBRARY_TAGS_MAX } from "@/lib/library/libraryKeys";
import { SAVE_TO_LIBRARY_ERROR_RU, saveOrderFileToLibrary, type LibraryFileJson } from "@/lib/library/libraryService";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  orderId: z.string().uuid(),
  clientId: z.string().uuid().nullable(),
  tags: z.union([z.array(z.string().max(200)).max(LIBRARY_TAGS_MAX * 2), z.string().max(2000)]).optional(),
});

/**
 * «Сохранить все файлы заказа»: every stored file of the order not yet in the
 * library (titles = file names). Links, files gone from storage and files
 * already saved are skipped and reported.
 */
export async function POST(request: NextRequest) {
  const { user, denied } = await requireLibraryStaff();
  if (denied) return denied;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });

  const files = await prisma.file.findMany({
    where: { orderId: parsed.data.orderId },
    select: { id: true, fileName: true },
    orderBy: [{ orderLine: { sortOrder: "asc" } }, { fileName: "asc" }],
  });
  if (files.length === 0) return NextResponse.json({ error: "В заказе нет файлов" }, { status: 404 });

  const saved: LibraryFileJson[] = [];
  const skipped: Array<{ fileId: string; fileName: string; code: string; reason: string }> = [];
  for (const f of files) {
    try {
      const res = await saveOrderFileToLibrary({
        fileId: f.id,
        clientId: parsed.data.clientId,
        tags: parsed.data.tags,
        actorId: user.id,
      });
      if (res.ok) saved.push(res.item);
      else skipped.push({ fileId: f.id, fileName: f.fileName, code: res.error, reason: SAVE_TO_LIBRARY_ERROR_RU[res.error] });
    } catch (error) {
      console.error("library from-order:", f.id, error);
      skipped.push({ fileId: f.id, fileName: f.fileName, code: "error", reason: "Ошибка копирования" });
    }
  }
  return NextResponse.json({ saved, skipped });
}
