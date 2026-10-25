import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";
import { receive } from "@/lib/stock/unified/ledger";
import { allocateVariantProcurementBacklog } from "@/lib/stock/unified/variantProcurementBacklog";
import {
  assertQuantityForUnit,
  loadVariantWithUnit,
  requireStockManager,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockReceiveSchema } from "@/lib/stock/unified/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST: register a purchase for one variant (balance + weighted-average cost via the ledger). */
export async function POST(request: NextRequest, { params }: Ctx) {
  return stockRoute("POST /api/admin/stock/variants/[id]/receive", async () => {
    const user = await requireStockManager();
    const { id } = await params;
    const body = stockReceiveSchema.parse(await request.json());
    const variant = await loadVariantWithUnit(id);
    assertQuantityForUnit(body.quantity, variant.unit, "quantity");
    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    const { receiptId } = await prisma.$transaction(async (tx) => {
      const res = await receive(tx, {
        variantId: id,
        quantity: body.quantity,
        totalCostMdl: body.totalCostMdl,
        purchasedAt: body.purchasedAt,
        supplierName: body.supplierName ?? null,
        note: body.note ?? null,
        createdById: user.id,
        amountsIncludeVat,
      });
      // Pen / notebook orders waiting for this variant take their stock now (no-op for other variants).
      await allocateVariantProcurementBacklog(tx, { variantId: id, createdById: user.id });
      return res;
    });
    return NextResponse.json({ ok: true, receiptId }, { status: 201 });
  });
}
