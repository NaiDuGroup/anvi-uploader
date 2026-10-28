import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { IMPORT_DOCUMENT_MAX_BYTES } from "@/lib/imports/constants";
import { importDocumentKey, importUploadUrl } from "@/lib/imports/importStorage";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";

const schema = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().max(120).optional(),
  sizeBytes: z.number().int().min(1),
});

/** POST: storage key + URL the browser uploads the file to (straight to storage). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/documents/presign", async () => {
    await requireImportManager();
    const { id } = await params;
    const b = schema.parse(await request.json());
    if (b.sizeBytes > IMPORT_DOCUMENT_MAX_BYTES) throw new ImportApiError(413, "file_too_large");
    if (!(await prisma.importShipment.count({ where: { id } }))) throw new ImportApiError(404, "not_found");
    const fileKey: string = importDocumentKey(id, b.fileName);
    const uploadUrl: string = await importUploadUrl(fileKey, b.contentType ?? "application/octet-stream", request.nextUrl.origin);
    return NextResponse.json({ fileKey, uploadUrl });
  });
}
