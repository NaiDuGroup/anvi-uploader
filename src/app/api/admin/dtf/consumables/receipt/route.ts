import { NextRequest, NextResponse } from "next/server";
import { dtfConsumableReceiptSchema } from "@/lib/dtf/dtfAdminSchemas";
import type { DtfConsumable } from "@/lib/dtf/dtfConstants";
import { recordDtfConsumableReceipt } from "@/lib/dtf/dtfConsumableLedger";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { prisma } from "@/lib/prisma";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

export async function POST(request: NextRequest) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const body = dtfConsumableReceiptSchema.parse(await readJsonBody(request));
    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    await prisma.$transaction(async (tx) => {
      await recordDtfConsumableReceipt(tx, {
        consumable: body.consumable as DtfConsumable,
        quantity: body.quantity,
        totalCostMdl: body.totalCostMdl,
        purchasedAt: body.purchasedAt,
        supplier: body.supplier ?? null,
        note: body.note ?? null,
        createdById: user.id,
        amountsIncludeVat,
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dtfRouteError(error, "consumable receipt");
  }
}
