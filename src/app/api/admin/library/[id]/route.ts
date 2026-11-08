import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireLibraryStaff } from "@/lib/library/libraryAuth";
import { LIBRARY_TAGS_MAX, LIBRARY_TITLE_MAX, normalizeLibraryTags } from "@/lib/library/libraryKeys";
import {
  LIBRARY_CLIENT_SELECT,
  hardDeleteLibraryFile,
  librarySourceOrderNumber,
  serializeLibraryFile,
} from "@/lib/library/libraryService";

const patchSchema = z.object({
  title: z.string().trim().min(1).max(LIBRARY_TITLE_MAX).optional(),
  tags: z.union([z.array(z.string().max(200)).max(LIBRARY_TAGS_MAX * 2), z.string().max(2000)]).optional(),
  /** New owner: a client id or null («Общий»). The stored key does not move. */
  clientId: z.string().uuid().nullable().optional(),
  /** true = «В архив», false = restore. */
  archived: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Ctx) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { id } = await params;
  const row = await prisma.libraryFile.findUnique({ where: { id }, include: { client: { select: LIBRARY_CLIENT_SELECT } } });
  if (!row) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  return NextResponse.json({ item: serializeLibraryFile(row, await librarySourceOrderNumber(row.sourceOrderId)) });
}

/** Edit title / tags / owner, archive or restore. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { id } = await params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные данные" }, { status: 400 });
  const body = parsed.data;

  const existing = await prisma.libraryFile.findUnique({ where: { id }, select: { id: true, archivedAt: true } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  if (body.clientId) {
    const c = await prisma.studioCustomer.findUnique({ where: { id: body.clientId }, select: { id: true } });
    if (!c) return NextResponse.json({ error: "Клиент не найден" }, { status: 400 });
  }

  const row = await prisma.libraryFile.update({
    where: { id },
    data: {
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.tags !== undefined ? { tags: normalizeLibraryTags(body.tags) } : {}),
      ...(body.clientId !== undefined ? { clientId: body.clientId } : {}),
      ...(body.archived !== undefined
        ? { archivedAt: body.archived ? (existing.archivedAt ?? new Date()) : null }
        : {}),
    },
    include: { client: { select: LIBRARY_CLIENT_SELECT } },
  });
  // Keep «из заказа #…» on the card after an edit.
  return NextResponse.json({ item: serializeLibraryFile(row, await librarySourceOrderNumber(row.sourceOrderId)) });
}

/**
 * Hard delete (object + row) — only when no order file uses the key; an
 * order made from it still needs the file, so the UI offers «В архив» instead.
 */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  const { denied } = await requireLibraryStaff();
  if (denied) return denied;
  const { id } = await params;
  try {
    const res = await hardDeleteLibraryFile(id);
    if (!res.ok) {
      if (res.error === "not_found") return NextResponse.json({ error: "Не найдено" }, { status: 404 });
      return NextResponse.json(
        { error: `Файл используется в заказах (${res.references}) — его можно только отправить в архив`, code: "in_use" },
        { status: 409 },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/admin/library/[id]:", error);
    return NextResponse.json({ error: "Не удалось удалить" }, { status: 500 });
  }
}
