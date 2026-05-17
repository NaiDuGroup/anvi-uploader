/**
 * Weighted-average purchase cost for roll stock (MDL per linear meter).
 */

export function weightedAverageCostPerLinearMeter(opts: {
  currentStockLinearMeters: number;
  /** Null before first receipt — use `legacyCatalogCostPerLm` as prior implied rate when stock was manual. */
  currentAvgPerLinearMeter: number | null;
  legacyCatalogCostPerLm: number;
  purchasedLinearMeters: number;
  purchaseTotalCostMdl: number;
}): { newAvgPerLinearMeter: number; newStockLinearMeters: number } {
  const boughtLm = opts.purchasedLinearMeters;
  if (!(boughtLm > 0) || !Number.isFinite(boughtLm)) {
    throw new Error("purchasedLinearMeters must be positive");
  }
  const purchaseRate = opts.purchaseTotalCostMdl / boughtLm;
  if (!Number.isFinite(purchaseRate) || purchaseRate < 0) {
    throw new Error("invalid purchase total or quantity");
  }

  const stockBefore = Math.max(0, opts.currentStockLinearMeters);
  const impliedOldAvg =
    opts.currentAvgPerLinearMeter != null && Number.isFinite(opts.currentAvgPerLinearMeter)
      ? opts.currentAvgPerLinearMeter
      : opts.legacyCatalogCostPerLm;

  const newStock = stockBefore + boughtLm;
  if (!(newStock > 0)) {
    return { newAvgPerLinearMeter: purchaseRate, newStockLinearMeters: 0 };
  }

  const newAvg =
    (stockBefore * impliedOldAvg + boughtLm * purchaseRate) / newStock;
  return {
    newAvgPerLinearMeter: newAvg,
    newStockLinearMeters: newStock,
  };
}
