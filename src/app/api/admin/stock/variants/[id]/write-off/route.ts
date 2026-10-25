import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeOff } from "@/lib/stock/unified/ledger";
import {
  assertQuantityForUnit,
  loadVariantWithUnit,
  requireStockManager,
  stockRoute,
} from "@/lib/stock/unified/apiRoute";
import { stockWriteOffSchema } from "@/lib/stock/unified/schemas";

type Ctx = { params: Promise<{ id: string }> };

/** POST: write off damaged / lost units. 409 `insufficient_stock` when there are fewer on hand. */
export async function POST(request: NextRequest, { params }: Ctx) {
  return stockRoute("POST /api/admin/stock/variants/[id]/write-off", async () => {
    const user = await requireStockManager();
    const { id } = await params;
    const body = stockWriteOffSchema.parse(await request.json());
    const variant = await loadVariantWithUnit(id);
    assertQuantityForUnit(body.quantity, variant.unit, "quantity");
    await prisma.$transaction((tx) =>
      writeOff(tx, { variantId: id, quantity: body.quantity, note: body.note ?? null, createdById: user.id }),
    );
    return NextResponse.json({ ok: true });
  });
}
