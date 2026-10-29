import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { STOCK_VARIANTS_ORDER } from "@/lib/stock/unified/adminJson";
import {
  assertQuantityForUnit,
  categoryUnit,
  requireStockManager,
  StockApiError,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stocktakeSchema, stocktakeTarget, type StocktakeRowJson } from "@/lib/stock/unified/bulkEdit";
import { adjustToActual } from "@/lib/stock/unified/ledger";

export const maxDuration = 60;

/**
 * GET `?category=<code>` (or none = every active category): the count sheet —
 * every active variant, plus inactive ones that still hold stock.
 */
export async function GET(request: NextRequest) {
  return stockRoute("GET /api/admin/stock/stocktake", async () => {
    await requireStockManager();
    const code: string = request.nextUrl.searchParams.get("category")?.trim() ?? "";
    const where: Prisma.StockCategoryWhereInput = code ? { code } : { isActive: true };
    const categories = await prisma.stockCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        items: {
          orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
          include: { variants: { orderBy: STOCK_VARIANTS_ORDER } },
        },
      },
    });
    if (code && categories.length === 0) throw new StockApiError(404, "category_not_found");
    const rows: StocktakeRowJson[] = [];
    for (const c of categories) {
      for (const item of c.items) {
        for (const v of item.variants) {
          const qty: number = Number(v.stockQuantity.toString());
          const active: boolean = item.isActive && v.isActive;
          if (!active && qty === 0) continue;
          rows.push({
            variantId: v.id,
            categoryCode: c.code,
            categoryNameRo: c.nameRo,
            categoryNameRu: c.nameRu,
            categoryNameEn: c.nameEn,
            unit: c.unit,
            itemSku: item.sku,
            nameRo: item.nameRo,
            nameRu: item.nameRu,
            nameEn: item.nameEn,
            label: v.label,
            sku: v.sku,
            stockQuantity: qty,
            isActive: active,
          });
        }
      }
    }
    return NextResponse.json({ rows });
  });
}

/** POST: apply a count sheet — one «Инвентаризация» movement per variant that differs, all in one transaction. */
export async function POST(request: NextRequest) {
  return stockRoute("POST /api/admin/stock/stocktake", async () => {
    const user = await requireStockManager();
    const body = stocktakeSchema.parse(await request.json());
    const ids: string[] = [...new Set(body.counts.map((c) => c.variantId))];
    if (ids.length !== body.counts.length) throw new StockApiError(400, "duplicate_variant");
    const variants = await prisma.stockVariant.findMany({
      where: { id: { in: ids } },
      select: { id: true, item: { select: { category: { select: { unit: true } } } } },
    });
    if (variants.length !== ids.length) throw new StockApiError(400, "unknown_variant");
    const unitById = new Map(variants.map((v) => [v.id, categoryUnit(v.item.category.unit)]));
    body.counts.forEach((c, i) => {
      assertQuantityForUnit(c.countedQuantity, unitById.get(c.variantId)!, `counts.${i}.countedQuantity`, {
        allowZero: true,
      });
    });

    const adjusted: number = await prisma.$transaction(
      async (tx) => {
        let changed = 0;
        for (const c of body.counts) {
          if (c.countedQuantity === c.expectedQuantity) continue;
          const row = await tx.stockVariant.findUniqueOrThrow({
            where: { id: c.variantId },
            select: { stockQuantity: true },
          });
          const current: number = Number(row.stockQuantity.toString());
          const { delta } = await adjustToActual(tx, {
            variantId: c.variantId,
            actualQuantity: stocktakeTarget(current, c.countedQuantity, c.expectedQuantity),
            note: body.note ?? null,
            createdById: user.id,
          });
          if (delta !== 0) changed += 1;
        }
        return changed;
      },
      { timeout: 55_000, maxWait: 10_000 },
    );
    return NextResponse.json({ ok: true, adjusted, counted: body.counts.length });
  });
}
