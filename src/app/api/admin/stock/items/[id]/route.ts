import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  STOCK_USER_NAME_SELECT,
  STOCK_VARIANTS_ORDER,
  toStockItemJson,
  toStockReceiptJson,
} from "@/lib/stock/unified/adminJson";
import {
  assertSkusFree,
  requireStockManager,
  StockApiError,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockItemUpdateSchema } from "@/lib/stock/unified/schemas";
import { parseStockItemDescription } from "@/lib/stock/unified/itemDescription";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

const RECENT_RECEIPTS = 20;

/** GET: item with variants and its latest receipts (all variants). */
export async function GET(_request: NextRequest, { params }: Ctx) {
  return stockRoute("GET /api/admin/stock/items/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const item = await prisma.stockItem.findUnique({
      where: { id },
      include: { variants: { orderBy: STOCK_VARIANTS_ORDER } },
    });
    if (!item) throw new StockApiError(404, "not_found");
    const receipts = await prisma.stockReceipt.findMany({
      where: { variant: { itemId: id } },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
      take: RECENT_RECEIPTS,
      include: { variant: { select: { sku: true, label: true } }, createdBy: STOCK_USER_NAME_SELECT },
    });
    return NextResponse.json({ item: toStockItemJson(item), receipts: receipts.map(toStockReceiptJson) });
  });
}

/** PATCH: item fields only (variants have their own routes). */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return stockRoute("PATCH /api/admin/stock/items/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const body = stockItemUpdateSchema.parse(await request.json());
    const exists = await prisma.stockItem.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new StockApiError(404, "not_found");
    if (body.sku !== undefined) await assertSkusFree({ itemSkus: [body.sku], excludeItemId: id });
    const item = await prisma.stockItem.update({
      where: { id },
      data: {
        sku: body.sku,
        nameRo: body.nameRo,
        nameRu: body.nameRu,
        nameEn: body.nameEn,
        imageUrl: body.imageUrl === undefined ? undefined : body.imageUrl?.trim() || null,
        galleryImages: body.galleryImages,
        description:
          body.description === undefined
            ? undefined
            : (parseStockItemDescription(body.description) ?? Prisma.DbNull),
        internalNotes: body.internalNotes === undefined ? undefined : body.internalNotes?.trim() || null,
        isActive: body.isActive,
        isSellable: body.isSellable,
        sortOrder: body.sortOrder,
        attributes: body.attributes === undefined ? undefined : (body.attributes as object),
        printMethods: body.printMethods,
      },
      include: { variants: { orderBy: STOCK_VARIANTS_ORDER } },
    });
    return NextResponse.json({ item: toStockItemJson(item) });
  });
}

/** DELETE: only an item whose variants never moved; otherwise the client offers to deactivate it. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  return stockRoute("DELETE /api/admin/stock/items/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const exists = await prisma.stockItem.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw new StockApiError(404, "not_found");
    const [movements, receipts] = await Promise.all([
      prisma.stockMovement.count({ where: { variant: { itemId: id } } }),
      prisma.stockReceipt.count({ where: { variant: { itemId: id } } }),
    ]);
    if (movements > 0 || receipts > 0) {
      throw new StockApiError(409, "has_movements", { movements, receipts, suggest: "deactivate" });
    }
    await prisma.stockItem.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
