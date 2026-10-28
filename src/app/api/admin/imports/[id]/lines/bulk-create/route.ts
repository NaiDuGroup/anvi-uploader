import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { gorFactoryImageUrl } from "@/lib/imports/gorFactory";
import { copySupplierPhotoToCatalog } from "@/lib/imports/importStorage";
import { ImportApiError, importRoute, requireImportManager } from "@/lib/imports/importRoute";
import { loadImportDetail } from "@/lib/imports/importQueries";
import { printMethodsSchema } from "@/lib/stock/unified/printMethods";
import { stockSkuSchema, stockVariantOptionsSchema } from "@/lib/stock/unified/schemas";

export const maxDuration = 60;

const name = z.string().trim().min(1).max(200);
const schema = z.object({
  items: z
    .array(
      z.object({
        sku: stockSkuSchema,
        categoryId: z.string().uuid(),
        nameRu: name,
        nameRo: name,
        nameEn: name,
        printMethods: printMethodsSchema,
        photoCode: z.string().trim().max(40).nullable(),
        variants: z
          .array(
            z.object({
              lineId: z.string().uuid(),
              sku: stockSkuSchema,
              label: z.string().trim().max(120).nullable(),
              options: stockVariantOptionsSchema,
            }),
          )
          .min(1)
          .max(50),
      }),
    )
    .min(1)
    .max(150),
});

type Result = { sku: string; ok: boolean; error?: string };

/** Run `fn` over `items`, at most `limit` at a time. */
async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]!);
      }
    }),
  );
  return out;
}

/**
 * POST «Создать все»: create the checked stock items of «Разобрать по моделям»,
 * copy supplier photos and link the import lines. Each item is its own
 * transaction, so one taken SKU doesn't stop the rest; the result lists them.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return importRoute("POST /api/admin/imports/[id]/lines/bulk-create", async () => {
    await requireImportManager();
    const { id } = await params;
    const b = schema.parse(await request.json());

    const lineIds: string[] = b.items.flatMap((i) => i.variants.map((v) => v.lineId));
    if (new Set(lineIds).size !== lineIds.length) throw new ImportApiError(400, "duplicate_lines");
    const lines = await prisma.importLine.findMany({ where: { id: { in: lineIds }, importId: id } });
    if (lines.length !== lineIds.length) throw new ImportApiError(404, "not_found");
    const lineById = new Map(lines.map((l) => [l.id, l]));
    const categoryIds: string[] = [...new Set(b.items.map((i) => i.categoryId))];
    const known = await prisma.stockCategory.count({ where: { id: { in: categoryIds } } });
    if (known !== categoryIds.length) throw new ImportApiError(404, "category_not_found");

    // SKUs already in stock: those items are reported, not created.
    const skus: string[] = b.items.flatMap((i) => [i.sku, ...i.variants.map((v) => v.sku)]).map((s) => s.toUpperCase());
    const [takenItems, takenVariants] = await Promise.all([
      prisma.stockItem.findMany({ where: { sku: { in: skus, mode: "insensitive" } }, select: { sku: true } }),
      prisma.stockVariant.findMany({ where: { sku: { in: skus, mode: "insensitive" } }, select: { sku: true } }),
    ]);
    const taken = new Set([...takenItems, ...takenVariants].map((r) => r.sku.toUpperCase()));

    const results: Result[] = await mapLimit(b.items, 6, async (item): Promise<Result> => {
      const sku: string = item.sku.toUpperCase();
      // An item SKU equal to its only variant's SKU is the same code, not a clash.
      const itemTaken: boolean = taken.has(sku);
      const variantTaken = item.variants.find((v) => taken.has(v.sku.toUpperCase()));
      if (itemTaken || variantTaken) return { sku, ok: false, error: "sku_taken" };
      const busy = item.variants.find((v) => {
        const l = lineById.get(v.lineId)!;
        return l.variantId != null || l.receiptId != null;
      });
      if (busy) return { sku, ok: false, error: "line_already_linked" };

      const photoUrl: string | null = item.photoCode ? gorFactoryImageUrl(item.photoCode) : null;
      let imageUrl: string | null = null;
      if (photoUrl) {
        try {
          imageUrl = await copySupplierPhotoToCatalog(photoUrl, item.photoCode!);
        } catch (e) {
          console.error("import supplier photo:", e);
        }
      }
      try {
        await prisma.$transaction(async (tx) => {
          const created = await tx.stockItem.create({
            data: {
              categoryId: item.categoryId,
              sku,
              nameRu: item.nameRu,
              nameRo: item.nameRo,
              nameEn: item.nameEn,
              imageUrl,
              printMethods: item.printMethods,
              isActive: true,
              variants: {
                create: item.variants.map((v, i) => ({
                  sku: v.sku.toUpperCase(),
                  label: v.label,
                  options: v.options,
                  supplierCode: lineById.get(v.lineId)!.supplierCode.toUpperCase(),
                  isActive: true,
                  sortOrder: i,
                })),
              },
            },
            select: { variants: { select: { id: true, sku: true } } },
          });
          const variantBySku = new Map(created.variants.map((v) => [v.sku, v.id]));
          for (const v of item.variants) {
            await tx.importLine.update({
              where: { id: v.lineId },
              data: { variantId: variantBySku.get(v.sku.toUpperCase())!, skip: false },
            });
          }
        });
        return { sku, ok: true };
      } catch (e) {
        console.error("import bulk create:", sku, e);
        return { sku, ok: false, error: "create_failed" };
      }
    });

    return NextResponse.json({ results, detail: await loadImportDetail(prisma, id) }, { status: 201 });
  });
}
