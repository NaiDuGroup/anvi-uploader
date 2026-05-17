import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { isAdmin } from "@/lib/roles";
import { getOrCreateAccountingSettings } from "@/lib/accounting/accountingSettings";
import {
  inkMlPerSqmForPrintProcess,
  parseProductionCostsJson,
} from "@/lib/accounting/types";
import { getOrCreateInkInventory } from "@/lib/ink/inkInventory";
import { DEFAULT_PRINT_PROCESS, PRINT_PROCESSES } from "@/lib/printProcess";

/** Wizard helpers: ink norms per tank + average ink cost / stock (studio roles that may create orders). */
export async function GET() {
  const user = await getSessionUser();
  if (!user || !isAdmin(user.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const acct = await getOrCreateAccountingSettings();
  const prod = parseProductionCostsJson(acct.productionCosts);

  const tanks = await Promise.all(
    PRINT_PROCESSES.map(async (printProcess) => {
      const tank = await getOrCreateInkInventory(prisma, printProcess);
      return {
        printProcess,
        inkMlPerSqm: inkMlPerSqmForPrintProcess(prod, printProcess),
        avgInkCostPerMlMdl: Number(tank.avgCostPerMl),
        inkStockMl: Number(tank.stockMl),
      };
    }),
  );

  const lfTank =
    tanks.find((t) => t.printProcess === DEFAULT_PRINT_PROCESS) ?? tanks[0]!;

  return NextResponse.json({
    inkMlPerSqmLargeFormatRoll: prod.inkMlPerSqmLargeFormatRoll,
    inkMlPerSqmUvRigid: prod.inkMlPerSqmUvRigid,
    inkMlPerSqmDtfTextile: prod.inkMlPerSqmDtfTextile,
    /** @deprecated use inkMlPerSqmLargeFormatRoll */
    inkMlPerSqm: prod.inkMlPerSqmLargeFormatRoll,
    minimumOrderPriceMdl:
      typeof prod.minimumOrderPriceMdl === "number" ? prod.minimumOrderPriceMdl : null,
    lfInkRetailMarkupMultiplier: prod.lfInkRetailMarkupMultiplier,
    lfInkDealerMarkupMultiplier: prod.lfInkDealerMarkupMultiplier,
    lfMinimumLineTotalMdl: prod.lfMinimumLineTotalMdl,
    avgInkCostPerMlMdl: lfTank.avgInkCostPerMlMdl,
    inkStockMl: lfTank.inkStockMl,
    /** LF roll economics use this tank (`large_format_roll`). */
    inkPrintProcess: DEFAULT_PRINT_PROCESS,
    tanks,
  });
}
