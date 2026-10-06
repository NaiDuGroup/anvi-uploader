/**
 * Weighted-average purchase cost for sheet paper stock (MDL per sheet).
 * Mirrors the roll-stock basis in `lfRollWeightedAverage.ts`, counted in sheets.
 */

export function weightedAverageCostPerSheet(opts: {
  currentStockSheets: number;
  /** Null before the first receipt — fall back to the catalog hint as the prior rate. */
  currentAvgPerSheet: number | null;
  catalogCostPerSheet: number;
  purchasedSheets: number;
  purchaseTotalCostMdl: number;
}): { newAvgPerSheet: number; newStockSheets: number } {
  const boughtSheets = opts.purchasedSheets;
  if (!(boughtSheets > 0) || !Number.isFinite(boughtSheets)) {
    throw new Error("purchasedSheets must be positive");
  }
  const purchaseRate = opts.purchaseTotalCostMdl / boughtSheets;
  if (!Number.isFinite(purchaseRate) || purchaseRate < 0) {
    throw new Error("invalid purchase total or quantity");
  }

  const stockBefore = Math.max(0, opts.currentStockSheets);
  const impliedOldAvg =
    opts.currentAvgPerSheet != null && Number.isFinite(opts.currentAvgPerSheet)
      ? opts.currentAvgPerSheet
      : opts.catalogCostPerSheet;

  const newStockSheets = stockBefore + boughtSheets;
  if (!(newStockSheets > 0)) {
    return { newAvgPerSheet: purchaseRate, newStockSheets: 0 };
  }

  return {
    newAvgPerSheet:
      (stockBefore * impliedOldAvg + boughtSheets * purchaseRate) / newStockSheets,
    newStockSheets,
  };
}
