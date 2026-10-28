import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { isImportDocumentKey } from "@/lib/imports/importStorage";
import { ImportApiError, importDocumentSchema, importRoute, requireImportManager } from "@/lib/imports/importRoute";

/** POST: register an uploaded file with its type. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/documents", async () => {
    const user = await requireImportManager();
    const { id } = await params;
    const b = importDocumentSchema.parse(await request.json());
    if (!isImportDocumentKey(id, b.fileKey)) throw new ImportApiError(400, "invalid_file_key");
    if (!(await prisma.importShipment.count({ where: { id } }))) throw new ImportApiError(404, "not_found");
    await prisma.importDocument.create({
      data: {
        importId: id,
        kind: b.kind,
        fileKey: b.fileKey,
        fileName: b.fileName,
        contentType: b.contentType ?? null,
        sizeBytes: b.sizeBytes ?? null,
        note: b.note || null,
        uploadedById: user.id,
      },
    });
    return NextResponse.json(await loadImportDetail(prisma, id), { status: 201 });
  });
}
