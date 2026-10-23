import { NextRequest, NextResponse } from "next/server";
import { garmentReceiptSchema } from "@/lib/dtf/dtfAdminSchemas";
import { DtfAccess, dtfRouteError, readJsonBody, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { recordGarmentReceipt } from "@/lib/dtf/garmentStockLedger";
import { HEAVY_TX_OPTIONS, prisma } from "@/lib/prisma";
import { purchaseCostsIncludeVat } from "@/lib/purchasing/purchaseCostBasis";

/** Receipt without a supplier invoice (own imports): one date, many sizes. */
export async function POST(request: NextRequest) {
  const user = await requireDtfUser(DtfAccess.Manage);
  if (user instanceof NextResponse) return user;
  try {
    const body = garmentReceiptSchema.parse(await readJsonBody(request));
    const ids: string[] = [...new Set(body.lines.map((l) => l.garmentVariantId))];
    const found: number = await prisma.garmentVariant.count({ where: { id: { in: ids } } });
    if (found !== ids.length) {
      return NextResponse.json({ error: "unknown_variant" }, { status: 400 });
    }
    const amountsIncludeVat: boolean = await purchaseCostsIncludeVat();
    await prisma.$transaction(async (tx) => {
      for (const line of body.lines) {
        await recordGarmentReceipt(tx, {
          garmentVariantId: line.garmentVariantId,
          quantity: line.quantity,
          totalCostMdl: line.totalCostMdl,
          purchasedAt: body.purchasedAt,
          supplier: body.supplier ?? null,
          note: body.note ?? null,
          createdById: user.id,
          amountsIncludeVat,
        });
      }
    }, HEAVY_TX_OPTIONS);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return dtfRouteError(error, "garment receipt");
  }
}
