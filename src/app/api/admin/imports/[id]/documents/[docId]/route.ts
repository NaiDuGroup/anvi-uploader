import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { ImportApiError, importDocumentSchema, importRoute, requireImportManager } from "@/lib/imports/importRoute";

type Ctx = { params: Promise<{ id: string; docId: string }> };

async function ownDoc(id: string, docId: string): Promise<void> {
  const d = await prisma.importDocument.findUnique({ where: { id: docId }, select: { importId: true } });
  if (!d || d.importId !== id) throw new ImportApiError(404, "not_found");
}

export async function PATCH(request: NextRequest, { params }: Ctx) {
  return importRoute("PATCH /api/admin/imports/[id]/documents/[docId]", async () => {
    await requireImportManager();
    const { id, docId } = await params;
    await ownDoc(id, docId);
    const b = importDocumentSchema.pick({ kind: true, note: true }).partial().parse(await request.json());
    await prisma.importDocument.update({
      where: { id: docId },
      data: { kind: b.kind, note: b.note === undefined ? undefined : b.note || null },
    });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}

/** DELETE: remove the document from the import (the file itself stays in storage). */
export async function DELETE(_r: NextRequest, { params }: Ctx) {
  return importRoute("DELETE /api/admin/imports/[id]/documents/[docId]", async () => {
    await requireImportManager();
    const { id, docId } = await params;
    await ownDoc(id, docId);
    await prisma.importDocument.delete({ where: { id: docId } });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}
