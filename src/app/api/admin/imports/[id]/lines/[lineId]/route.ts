import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";

const schema = z.object({ variantId: z.string().uuid().nullable().optional(), skip: z.boolean().optional() });

/**
 * PATCH: link a line to a stock variant (or unlink) / mark it «не на склад».
 * Linking remembers the supplier code on the variant, so the next import
 * matches it by itself.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  return importRoute("PATCH /api/admin/imports/[id]/lines/[lineId]", async () => {
    await requireImportManager();
    const { id, lineId } = await params;
    const b = schema.parse(await request.json());
    const line = await prisma.importLine.findUnique({ where: { id: lineId } });
    if (!line || line.importId !== id) throw new ImportApiError(404, "not_found");
    if (line.receiptId) throw new ImportApiError(409, "import_line_posted");
    if (b.variantId) {
      const v = await prisma.stockVariant.findUnique({ where: { id: b.variantId }, select: { id: true } });
      if (!v) throw new ImportApiError(404, "variant_not_found");
    }
    await prisma.$transaction(async (tx) => {
      // A line is either linked or «не на склад», never both.
      const data = b.variantId
        ? { variantId: b.variantId, skip: false }
        : b.skip
          ? { variantId: null, skip: true }
          : { variantId: b.variantId, skip: b.skip };
      await tx.importLine.update({ where: { id: lineId }, data });
      if (b.variantId) {
        await tx.stockVariant.updateMany({
          where: { id: b.variantId, supplierCode: null },
          data: { supplierCode: line.supplierCode.toUpperCase() },
        });
      }
    });
    return NextResponse.json(await loadImportDetail(prisma, id));
  });
}
