import { NextResponse } from "next/server";
import { DTF_CONSUMABLES } from "@/lib/dtf/dtfConstants";
import { getOrCreateDtfConsumable } from "@/lib/dtf/dtfConsumableLedger";
import type { DtfConsumableJson } from "@/lib/dtf/dtfDto";
import { DtfAccess, dtfRouteError, requireDtfUser } from "@/lib/dtf/dtfRoute";
import { getOrCreateInkInventory } from "@/lib/ink/inkInventory";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await requireDtfUser(DtfAccess.Read);
  if (user instanceof NextResponse) return user;
  try {
    const items: DtfConsumableJson[] = [];
    for (const id of DTF_CONSUMABLES) {
      const row = await getOrCreateDtfConsumable(prisma, id);
      items.push({
        id,
        stockQuantity: Number(row.stockQuantity),
        avgCostPerUnit: Number(row.avgCostPerUnit),
      });
    }
    const ink = await getOrCreateInkInventory(prisma, "dtf_textile");
    return NextResponse.json({
      items,
      ink: { stockMl: Number(ink.stockMl), avgCostPerMl: Number(ink.avgCostPerMl) },
    });
  } catch (error) {
    return dtfRouteError(error, "consumables list");
  }
}
