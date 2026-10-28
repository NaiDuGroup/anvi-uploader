import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { loadImportDetail, matchVariantsByCode } from "@/lib/imports/importQueries";
import { readImportDocument } from "@/lib/imports/importStorage";
import { pdfTextLines } from "@/lib/imports/pdfTextLines";
import { parseGorFactoryProforma } from "@/lib/imports/parseGorFactoryProforma";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";

export const maxDuration = 60;

const schema = z.object({ documentId: z.string().uuid() });

/**
 * POST: read the item lines from a supplier PDF (Gor Factory proforma /
 * invoice) and replace the import's lines. Codes already known on stock
 * variants are matched automatically; empty header fields are filled in.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/lines/from-document", async () => {
    await requireImportManager();
    const { id } = await params;
    const { documentId } = schema.parse(await request.json());
    const s = await prisma.importShipment.findUnique({
      where: { id },
      select: { postedMode: true, proformaNo: true, supplierOrderNo: true, orderedAt: true, currency: true },
    });
    if (!s) throw new ImportApiError(404, "not_found");
    if (s.postedMode) throw new ImportApiError(409, "import_posted");
    const doc = await prisma.importDocument.findUnique({ where: { id: documentId } });
    if (!doc || doc.importId !== id) throw new ImportApiError(404, "document_not_found");
    const isPdf: boolean = (doc.contentType ?? "").includes("pdf") || doc.fileName.toLowerCase().endsWith(".pdf");
    if (!isPdf) throw new ImportApiError(400, "document_not_pdf");
    const data = await readImportDocument(doc.fileKey);
    if (!data) throw new ImportApiError(404, "file_missing");

    let parsed: ReturnType<typeof parseGorFactoryProforma>;
    try {
      parsed = parseGorFactoryProforma(await pdfTextLines(data));
    } catch (e) {
      console.error("import pdf read:", e);
      throw new ImportApiError(422, "document_unreadable");
    }
    if (parsed.lines.length === 0) {
      throw new ImportApiError(422, "document_no_lines", { warnings: parsed.warnings });
    }

    const matches = await matchVariantsByCode(prisma, parsed.lines.map((l) => l.supplierCode));
    await prisma.$transaction(async (tx) => {
      await tx.importLine.deleteMany({ where: { importId: id } });
      await tx.importLine.createMany({
        data: parsed.lines.map((l, i) => ({
          importId: id,
          position: i + 1,
          supplierCode: l.supplierCode,
          description: l.description,
          quantity: new Prisma.Decimal(l.quantity),
          unitPrice: new Prisma.Decimal(l.unitPrice.toFixed(4)),
          amount: new Prisma.Decimal(l.amount.toFixed(2)),
          variantId: matches.get(l.supplierCode.toUpperCase()) ?? null,
        })),
      });
      await tx.importShipment.update({
        where: { id },
        data: {
          proformaNo: s.proformaNo ?? parsed.proformaNo,
          supplierOrderNo: s.supplierOrderNo ?? parsed.supplierOrderNo,
          orderedAt: s.orderedAt ?? (parsed.date ? new Date(`${parsed.date}T00:00:00.000Z`) : null),
          currency: parsed.currency ?? s.currency,
        },
      });
    });
    return NextResponse.json({
      detail: await loadImportDetail(prisma, id),
      read: {
        lines: parsed.lines.length,
        matched: parsed.lines.filter((l) => matches.has(l.supplierCode.toUpperCase())).length,
        documentAmount: parsed.documentAmount,
        documentPieces: parsed.documentPieces,
        freight: parsed.freight,
        warnings: parsed.warnings,
      },
    });
  });
}
