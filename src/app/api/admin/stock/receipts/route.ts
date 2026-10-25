import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";
import { receive } from "@/lib/stock/unified/ledger";
import { allocateVariantProcurementBacklog } from "@/lib/stock/unified/variantProcurementBacklog";
import {
  assertQuantityForUnit,
  categoryUnit,
  requireStockManager,
  StockApiError,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockBulkReceiptSchema } from "@/lib/stock/unified/schemas";

/** POST: one supplier delivery for many variants — all lines in one transaction. */
export async function POST(request: NextRequest) {
  return stockRoute("POST /api/admin/stock/receipts", async () => {
    const user = await requireStockManager();
    const body = stockBulkReceiptSchema.parse(await request.json());
    const ids: string[] = [...new Set(body.lines.map((l) => l.variantId))];
    const variants = await prisma.stockVariant.findMany({
      where: { id: { in: ids } },
      select: { id: true, item: { select: { category: { select: { unit: true } } } } },
    });
    if (variants.length !== ids.length) throw new StockApiError(400, "unknown_variant");
    const unitById = new Map(variants.map((v) => [v.id, categoryUnit(v.item.category.unit)]));
    body.lines.forEach((line, i) => {
      assertQuantityForUnit(line.quantity, unitById.get(line.variantId)!, `lines.${i}.quantity`);
    });
    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    const receiptIds: string[] = await prisma.$transaction(async (tx) => {
      const out: string[] = [];
      for (const line of body.lines) {
        const { receiptId } = await receive(tx, {
          variantId: line.variantId,
          quantity: line.quantity,
          totalCostMdl: line.totalCostMdl,
          purchasedAt: body.purchasedAt,
          supplierName: body.supplierName ?? null,
          note: body.note ?? null,
          createdById: user.id,
          amountsIncludeVat,
        });
        out.push(receiptId);
        // Pen / notebook orders waiting for this variant take their stock now (no-op for other variants).
        await allocateVariantProcurementBacklog(tx, { variantId: line.variantId, createdById: user.id });
      }
      return out;
    });
    return NextResponse.json({ ok: true, receiptIds }, { status: 201 });
  });
}
