import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { gorFactoryImageUrl } from "@/lib/imports/gorFactory";
import { copySupplierPhotoToCatalog } from "@/lib/imports/importStorage";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";

export const maxDuration = 30;

const schema = z.object({
  categoryId: z.string().uuid(),
  nameRu: z.string().trim().min(1).max(200),
  nameRo: z.string().trim().max(200).optional(),
  nameEn: z.string().trim().max(200).optional(),
  sku: z.string().trim().min(1).max(80).optional(),
  withPhoto: z.boolean().optional(),
});

/**
 * POST: create a stock item (one variant, SKU = supplier code) for a line not
 * on stock yet, copy the supplier photo into the catalog, and link the line.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/lines/[lineId]/create-item", async () => {
    await requireImportManager();
    const { id, lineId } = await params;
    const b = schema.parse(await request.json());
    const line = await prisma.importLine.findUnique({ where: { id: lineId } });
    if (!line || line.importId !== id) throw new ImportApiError(404, "not_found");
    if (line.receiptId) throw new ImportApiError(409, "import_line_posted");
    const category = await prisma.stockCategory.findUnique({ where: { id: b.categoryId }, select: { id: true } });
    if (!category) throw new ImportApiError(404, "category_not_found");
    const code: string = line.supplierCode.toUpperCase();
    const sku: string = (b.sku ?? code).toUpperCase();
    const taken =
      (await prisma.stockItem.count({ where: { sku } })) + (await prisma.stockVariant.count({ where: { sku } }));
    if (taken > 0) throw new ImportApiError(409, "sku_taken");

    const photoUrl: string | null = b.withPhoto === false ? null : gorFactoryImageUrl(code);
    let imageUrl: string | null = null;
    if (photoUrl) {
      try {
        imageUrl = await copySupplierPhotoToCatalog(photoUrl, code);
      } catch (e) {
        console.error("import supplier photo:", e);
      }
    }
    await prisma.$transaction(async (tx) => {
      const item = await tx.stockItem.create({
        data: {
          categoryId: category.id,
          sku,
          nameRu: b.nameRu,
          nameRo: b.nameRo || b.nameRu,
          nameEn: b.nameEn || b.nameRu,
          imageUrl,
          isActive: true,
          variants: { create: { sku, supplierCode: code, isActive: true, sortOrder: 0 } },
        },
        select: { variants: { select: { id: true } } },
      });
      await tx.importLine.update({ where: { id: lineId }, data: { variantId: item.variants[0]!.id, skip: false } });
    });
    return NextResponse.json({ detail: await loadImportDetail(prisma, id), photo: imageUrl != null }, { status: 201 });
  });
}
