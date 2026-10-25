import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { adjustToActual } from "@/lib/stock/unified/ledger";
import {
  assertQuantityForUnit,
  loadVariantWithUnit,
  requireStockManager,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockAdjustSchema } from "@/lib/stock/unified/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST: stocktake — set the balance to the counted quantity (writes an INVENTORY_ADJUSTMENT movement). */
export async function POST(request: NextRequest, { params }: Ctx) {
  return stockRoute("POST /api/admin/stock/variants/[id]/inventory", async () => {
    const user = await requireStockManager();
    const { id } = await params;
    const body = stockAdjustSchema.parse(await request.json());
    const variant = await loadVariantWithUnit(id);
    assertQuantityForUnit(body.actualQuantity, variant.unit, "actualQuantity", { allowZero: true });
    const { delta } = await prisma.$transaction((tx) =>
      adjustToActual(tx, {
        variantId: id,
        actualQuantity: body.actualQuantity,
        note: body.note ?? null,
        createdById: user.id,
      }),
    );
    return NextResponse.json({ ok: true, delta });
  });
}
