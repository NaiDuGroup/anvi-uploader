import { PassThrough } from "node:stream";
import archiver from "archiver";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { loadImportArchive } from "@/lib/imports/importArchive";
import { importRoute, requireImportManager } from "@/lib/imports/importRoute";
import { getDictionary, LOCALES, type Locale } from "@/lib/i18n";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * GET: every document of the import in one ZIP, one folder per document kind —
 * for the accountant. Refused while a required document is missing, so an
 * incomplete set is never handed over.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("GET /api/admin/imports/[id]/archive", async () => {
    await requireImportManager();
    const { id } = await params;
    const param: string | null = request.nextUrl.searchParams.get("locale");
    const locale: Locale = (LOCALES as readonly string[]).includes(param ?? "") ? (param as Locale) : "ru";
    const { root, entries } = await loadImportArchive(prisma, id, getDictionary(locale).imports.docKinds);

    const out = new PassThrough();
    const zip = archiver("zip", { zlib: { level: 5 } });
    zip.on("error", (e) => out.destroy(e));
    zip.pipe(out);
    for (const e of entries) zip.append(e.data, { name: e.name });
    void zip.finalize();

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        out.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)));
        out.on("end", () => controller.close());
        out.on("error", (e) => controller.error(e));
      },
    });
    const fileName = `Import_${root}.zip`;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${fileName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
        "Cache-Control": "private, no-store",
      },
    });
  });
}
