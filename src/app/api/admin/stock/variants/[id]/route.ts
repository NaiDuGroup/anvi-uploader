import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { toStockVariantJson } from "@/lib/stock/unified/adminJson";
import {
  assertSkusFree,
  categoryUnit,
  requireStockManager,
  StockApiError,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockVariantUpdateSchema } from "@/lib/stock/unified/schemas";
import { variantUpdateData } from "@/lib/stock/unified/variantWrite";

type Ctx = { params: Promise<{ id: string }> };

/** PATCH: SKU, label, options, prices, cost hint, reorder level, order, active. Never the balance. */
export async function PATCH(request: NextRequest, { params }: Ctx) {
  return stockRoute("PATCH /api/admin/stock/variants/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const body = stockVariantUpdateSchema.parse(await request.json());
    const current = await prisma.stockVariant.findUnique({
      where: { id },
      select: { id: true, item: { select: { category: { select: { unit: true } } } } },
    });
    if (!current) throw new StockApiError(404, "not_found");
    const data = variantUpdateData(body, categoryUnit(current.item.category.unit));
    if (body.sku !== undefined) await assertSkusFree({ variantSkus: [body.sku], excludeVariantIds: [id] });
    const variant = await prisma.stockVariant.update({ where: { id }, data });
    return NextResponse.json({ variant: toStockVariantJson(variant) });
  });
}

/** DELETE: only a variant without movements, and never the last one of its item. */
export async function DELETE(_request: NextRequest, { params }: Ctx) {
  return stockRoute("DELETE /api/admin/stock/variants/[id]", async () => {
    await requireStockManager();
    const { id } = await params;
    const current = await prisma.stockVariant.findUnique({
      where: { id },
      select: { id: true, itemId: true, _count: { select: { movements: true, receipts: true } } },
    });
    if (!current) throw new StockApiError(404, "not_found");
    if (current._count.movements > 0 || current._count.receipts > 0) {
      throw new StockApiError(409, "has_movements", { suggest: "deactivate" });
    }
    const siblings: number = await prisma.stockVariant.count({ where: { itemId: current.itemId } });
    if (siblings <= 1) throw new StockApiError(409, "last_variant");
    await prisma.stockVariant.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
