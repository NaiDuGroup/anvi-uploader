import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decimalPatch, requireStockManager, StockApiError, stockRoute } from "@/lib/stock/unified/apiRoute";
import { stockBulkPriceSchema } from "@/lib/stock/unified/bulkEdit";

export const maxDuration = 60;

/** POST: retail / dealer prices of many variants in one transaction («Цены»). Never touches the balance. */
export async function POST(request: NextRequest) {
  return stockRoute("POST /api/admin/stock/prices", async () => {
    await requireStockManager();
    const body = stockBulkPriceSchema.parse(await request.json());
    const ids: string[] = [...new Set(body.updates.map((u) => u.variantId))];
    if (ids.length !== body.updates.length) throw new StockApiError(400, "duplicate_variant");
    const variants = await prisma.stockVariant.findMany({
      where: { id: { in: ids } },
      select: { id: true, priceTiers: true },
    });
    if (variants.length !== ids.length) throw new StockApiError(400, "unknown_variant");
    // Printed apparel with run-size prices: the retail price lives in the tiers (edited on the item).
    const tiered = new Set(variants.filter((v) => v.priceTiers != null).map((v) => v.id));
    if (body.updates.some((u) => u.sellPrice !== undefined && tiered.has(u.variantId))) {
      throw new StockApiError(400, "has_price_tiers");
    }
    await prisma.$transaction(
      async (tx) => {
        for (const u of body.updates) {
          await tx.stockVariant.update({
            where: { id: u.variantId },
            data: { sellPrice: decimalPatch(u.sellPrice, 2), dealerPrice: decimalPatch(u.dealerPrice, 2) },
          });
        }
      },
      { timeout: 55_000, maxWait: 10_000 },
    );
    return NextResponse.json({ ok: true, updated: body.updates.length });
  });
}
