import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readImportDocument } from "@/lib/imports/importStorage";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";

/** GET: the document file, opened in the browser (PDF / image) or downloaded. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; docId: string }> }) {
  return importRoute("GET /api/admin/imports/[id]/documents/[docId]/file", async () => {
    await requireImportManager();
    const { id, docId } = await params;
    const d = await prisma.importDocument.findUnique({ where: { id: docId } });
    if (!d || d.importId !== id) throw new ImportApiError(404, "not_found");
    const data = await readImportDocument(d.fileKey);
    if (!data) throw new ImportApiError(404, "file_missing");
    const download: boolean = request.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": d.contentType || "application/octet-stream",
        "Content-Length": String(data.byteLength),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(d.fileName)}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  });
}
