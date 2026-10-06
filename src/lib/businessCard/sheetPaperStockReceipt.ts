import { Prisma } from "@prisma/client";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";
import type { Tx } from "@/lib/largeFormat/lfRollStockLedger";
import { weightedAverageCostPerSheet } from "./sheetPaperWeightedAverage";
import { SHEET_PAPER_STOCK_KIND } from "./sheetPaperStockKinds";

/**
 * Record a paper purchase: append the receipt, roll the weighted-average cost
 * forward and raise the sheet balance, with a matching ledger movement.
 */
export async function recordSheetPaperStockReceipt(
  tx: Tx,
  params: {
    sheetPaperId: string;
    quantitySheets: number;
    totalCostMdl: number;
    purchasedAt: Date;
    supplier?: string | null;
    note?: string | null;
    createdById?: string | null;
  },
): Promise<void> {
  const paper = await tx.sheetPaper.findUniqueOrThrow({
    where: { id: params.sheetPaperId },
  });

  const wa = weightedAverageCostPerSheet({
    currentStockSheets: Number(paper.stockSheets),
    currentAvgPerSheet:
      paper.avgPurchaseCostPerSheet != null
        ? Number(paper.avgPurchaseCostPerSheet)
        : null,
    catalogCostPerSheet: paper.costPerSheet,
    purchasedSheets: params.quantitySheets,
    purchaseTotalCostMdl: params.totalCostMdl,
  });

  await tx.sheetPaperStockReceipt.create({
    data: {
      sheetPaperId: params.sheetPaperId,
      quantitySheets: new Prisma.Decimal(params.quantitySheets.toFixed(2)),
      totalCostMdl: params.totalCostMdl,
      purchasedAt: toDatabaseDateOnly(params.purchasedAt),
      supplier: params.supplier?.trim() ? params.supplier.trim() : null,
      note: params.note?.trim() ? params.note.trim() : null,
      createdById: params.createdById ?? null,
    },
  });

  await tx.sheetPaper.update({
    where: { id: params.sheetPaperId },
    data: {
      stockSheets: new Prisma.Decimal(wa.newStockSheets.toFixed(2)),
      avgPurchaseCostPerSheet: new Prisma.Decimal(wa.newAvgPerSheet.toFixed(4)),
    },
  });

  await tx.sheetPaperStockMovement.create({
    data: {
      sheetPaperId: params.sheetPaperId,
      quantitySheets: new Prisma.Decimal(params.quantitySheets.toFixed(2)),
      kind: SHEET_PAPER_STOCK_KIND.RECEIPT,
      paperCostMdl: params.totalCostMdl,
      createdById: params.createdById ?? null,
    },
  });
}
