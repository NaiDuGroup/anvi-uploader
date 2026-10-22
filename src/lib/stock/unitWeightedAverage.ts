/**
 * Weighted-average purchase cost for piece-counted catalog stock (mugs, notebooks, pens).
 * Same basis as sheet paper / roll media: the new average blends the remaining
 * stock at the previous average with the incoming batch at its purchase rate.
 */

export type UnitWeightedAverageInput = {
  currentStock: number;
  /** Null before the first receipt — the catalog hint is used as the prior rate. */
  currentAvgCost: number | null;
  catalogCost: number | null;
  purchasedQty: number;
  purchaseTotalMdl: number;
};

export type UnitWeightedAverageResult = {
  newAvgCost: number;
  newStock: number;
  purchaseUnitCost: number;
};

export function weightedAverageUnitCost(
  input: UnitWeightedAverageInput,
): UnitWeightedAverageResult {
  const { purchasedQty, purchaseTotalMdl } = input;
  if (!Number.isFinite(purchasedQty) || purchasedQty <= 0) {
    throw new Error("purchasedQty must be positive");
  }
  const purchaseUnitCost: number = purchaseTotalMdl / purchasedQty;
  if (!Number.isFinite(purchaseUnitCost) || purchaseUnitCost < 0) {
    throw new Error("invalid purchase total or quantity");
  }

  // Negative / unknown stock carries no value into the blend.
  const stockBefore: number = Math.max(0, input.currentStock);
  const priorAvg: number | null =
    input.currentAvgCost != null && Number.isFinite(input.currentAvgCost)
      ? input.currentAvgCost
      : input.catalogCost;

  const newStock: number = input.currentStock + purchasedQty;
  const blendBase: number = stockBefore + purchasedQty;

  if (priorAvg == null || stockBefore === 0) {
    return { newAvgCost: purchaseUnitCost, newStock, purchaseUnitCost };
  }

  return {
    newAvgCost: (stockBefore * priorAvg + purchaseTotalMdl) / blendBase,
    newStock,
    purchaseUnitCost,
  };
}
