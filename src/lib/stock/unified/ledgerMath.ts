import { correctedAverageCost } from "@/lib/stock/correctReceiptCost";
import { weightedAverageUnitCost } from "@/lib/stock/unitWeightedAverage";

/**
 * Pure calculations behind the unified stock ledger. Kept free of Prisma so they
 * can be unit-tested; `ledger.ts` applies them inside a transaction.
 */

/**
 * Stock quantities are stored with 6 decimals: toner is counted in cartridges and
 * one printed sheet uses ~1/33 000 of one. Inputs are still entered with ≤ 3.
 */
export function roundQty(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/** Money is stored in MDL with 2 decimals. */
export function roundMdl(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Average unit cost is stored with 4 decimals. */
export function roundUnitCost(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function assertPositiveQty(quantity: number): void {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive number");
  }
}

/** Average cost, falling back to the manual hint until the first receipt. */
export function effectiveAvgCost(avgCost: number | null, purchaseCost: number | null): number | null {
  return avgCost ?? purchaseCost;
}

/** Cost of moving `quantity` units at the effective average; null when no cost is known yet. */
export function movementCostMdl(
  quantity: number,
  avgCost: number | null,
  purchaseCost: number | null,
): number | null {
  const unit: number | null = effectiveAvgCost(avgCost, purchaseCost);
  return unit == null ? null : roundMdl(Math.abs(quantity) * unit);
}

export type ReceiptPlan = {
  newStock: number;
  newAvgCost: number;
};

/** Balance and weighted-average cost after receiving `quantity` units for `totalCostMdl`. */
export function planReceipt(params: {
  currentStock: number;
  avgCost: number | null;
  purchaseCost: number | null;
  quantity: number;
  totalCostMdl: number;
}): ReceiptPlan {
  assertPositiveQty(params.quantity);
  const wa = weightedAverageUnitCost({
    currentStock: params.currentStock,
    currentAvgCost: params.avgCost,
    catalogCost: params.purchaseCost,
    purchasedQty: params.quantity,
    purchaseTotalMdl: params.totalCostMdl,
  });
  return { newStock: roundQty(wa.newStock), newAvgCost: roundUnitCost(wa.newAvgCost) };
}

/**
 * Average cost after a receipt is cancelled: take its units and value back out of
 * the pool. When the receipt was the whole pool (or more), the average is kept —
 * there is nothing left to re-price.
 */
export function planReceiptReversal(params: {
  currentStock: number;
  avgCost: number;
  receiptQuantity: number;
  receiptTotalMdl: number;
}): ReceiptPlan {
  assertPositiveQty(params.receiptQuantity);
  const newStock: number = roundQty(params.currentStock - params.receiptQuantity);
  if (newStock <= 0) {
    return { newStock, newAvgCost: params.avgCost };
  }
  const remainingValue: number =
    params.currentStock * params.avgCost - params.receiptTotalMdl;
  const newAvgCost: number = remainingValue > 0 ? remainingValue / newStock : 0;
  return { newStock, newAvgCost: roundUnitCost(newAvgCost) };
}

/** Average cost after a past receipt's total changes (provisional price → invoice price). */
export function planReceiptCostCorrection(params: {
  currentStock: number;
  avgCost: number;
  receiptQuantity: number;
  oldTotalMdl: number;
  newTotalMdl: number;
}): number {
  return roundUnitCost(
    correctedAverageCost({
      currentStock: params.currentStock,
      currentAvgCost: params.avgCost,
      receiptQuantity: params.receiptQuantity,
      deltaTotalMdl: params.newTotalMdl - params.oldTotalMdl,
    }),
  );
}
