import { Prisma } from "@prisma/client";
import type { Prisma as PrismaNs } from "@prisma/client";
import {
  getOrCreateInkInventory,
  invalidateInkInventory,
} from "@/lib/ink/inkInventory";
import { weightedAverageInkCostPerMl } from "@/lib/ink/inkWeightedAverage";
import type { PrintProcess } from "@/lib/printProcess";
import { DEFAULT_PRINT_PROCESS, isPrintProcess } from "@/lib/printProcess";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";

export type Tx = PrismaNs.TransactionClient;

/**
 * Replays remaining receipts in chronological order to obtain weighted-average
 * cost per ml (same result as posting each receipt sequentially from an empty tank).
 */
export async function replayInkReceiptsWeightedAverage(
  tx: Tx,
  printProcess: PrintProcess,
): Promise<{ stockMl: number; avgCostPerMl: number }> {
  const rows = await tx.inkStockReceipt.findMany({
    where: { inkInventoryId: printProcess },
    orderBy: [{ purchasedAt: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  let stockMl = 0;
  let avgCostPerMl = 0;
  for (const row of rows) {
    const purchasedMl = Number(row.quantityMl);
    const wa = weightedAverageInkCostPerMl({
      currentStockMl: stockMl,
      currentAvgCostPerMl: avgCostPerMl,
      purchasedMl,
      purchaseTotalCostMdl: row.totalCostMdl,
    });
    stockMl = wa.newStockMl;
    avgCostPerMl = wa.newAvgCostPerMl;
  }
  return { stockMl, avgCostPerMl };
}

export type DeleteInkStockReceiptCode =
  | "not_found"
  | "invalid_tank"
  | "would_go_negative";

export class DeleteInkStockReceiptError extends Error {
  readonly code: DeleteInkStockReceiptCode;

  constructor(code: DeleteInkStockReceiptCode) {
    super(code);
    this.name = "DeleteInkStockReceiptError";
    this.code = code;
  }
}

/**
 * Removes one receipt row, subtracts its ml from the tank balance, and recomputes
 * weighted-average cost from the remaining receipts (same WA rule as {@link recordInkStockReceipt}).
 */
export async function deleteInkStockReceiptById(
  tx: Tx,
  receiptId: string,
): Promise<{ printProcess: PrintProcess }> {
  const rec = await tx.inkStockReceipt.findUnique({ where: { id: receiptId } });
  if (!rec) {
    throw new DeleteInkStockReceiptError("not_found");
  }
  if (!isPrintProcess(rec.inkInventoryId)) {
    throw new DeleteInkStockReceiptError("invalid_tank");
  }
  const printProcess = rec.inkInventoryId;

  const inv = await tx.inkInventory.findUnique({ where: { id: printProcess } });
  if (!inv) {
    throw new DeleteInkStockReceiptError("invalid_tank");
  }

  const takeQty = Number(rec.quantityMl);
  const nextStock = Number(inv.stockMl) - takeQty;
  if (nextStock < -1e-5) {
    throw new DeleteInkStockReceiptError("would_go_negative");
  }

  await tx.inkStockReceipt.delete({ where: { id: receiptId } });

  const replay = await replayInkReceiptsWeightedAverage(tx, printProcess);

  await tx.inkInventory.update({
    where: { id: printProcess },
    data: {
      stockMl: new Prisma.Decimal(Math.max(0, nextStock).toFixed(3)),
      avgCostPerMl: new Prisma.Decimal(replay.avgCostPerMl.toFixed(8)),
    },
  });
  invalidateInkInventory(printProcess);

  return { printProcess };
}

export async function recordInkStockReceipt(
  tx: Tx,
  params: {
    printProcess?: PrintProcess;
    quantityMl: number;
    totalCostMdl: number;
    purchasedAt: Date;
    note?: string | null;
    createdById?: string | null;
  },
): Promise<void> {
  const printProcess = params.printProcess ?? DEFAULT_PRINT_PROCESS;
  await getOrCreateInkInventory(tx, printProcess);
  const inv = await tx.inkInventory.findUniqueOrThrow({
    where: { id: printProcess },
  });

  const wa = weightedAverageInkCostPerMl({
    currentStockMl: Number(inv.stockMl),
    currentAvgCostPerMl: Number(inv.avgCostPerMl),
    purchasedMl: params.quantityMl,
    purchaseTotalCostMdl: params.totalCostMdl,
  });

  const qtyMl = new Prisma.Decimal(params.quantityMl.toFixed(3));
  const stockMl = new Prisma.Decimal(wa.newStockMl.toFixed(3));
  const avgMl = new Prisma.Decimal(wa.newAvgCostPerMl.toFixed(8));
  const purchasedAt = toDatabaseDateOnly(params.purchasedAt);

  await tx.inkStockReceipt.create({
    data: {
      inkInventoryId: printProcess,
      quantityMl: qtyMl,
      totalCostMdl: params.totalCostMdl,
      purchasedAt,
      note: params.note?.trim() ? params.note.trim() : null,
      createdById: params.createdById ?? null,
    },
  });

  await tx.inkInventory.update({
    where: { id: printProcess },
    data: {
      stockMl,
      avgCostPerMl: avgMl,
    },
  });
  invalidateInkInventory(printProcess);
}
