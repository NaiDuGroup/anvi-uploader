/** Weighted-average ink cost (MDL per millilitre). */

export function weightedAverageInkCostPerMl(opts: {
  currentStockMl: number;
  currentAvgCostPerMl: number;
  purchasedMl: number;
  purchaseTotalCostMdl: number;
}): { newAvgCostPerMl: number; newStockMl: number } {
  const bought = opts.purchasedMl;
  if (!(bought > 0) || !Number.isFinite(bought)) {
    throw new Error("purchasedMl must be positive");
  }
  const rate = opts.purchaseTotalCostMdl / bought;
  if (!Number.isFinite(rate) || rate < 0) {
    throw new Error("invalid ink purchase");
  }

  const before = Math.max(0, opts.currentStockMl);
  const oldAvg = opts.currentAvgCostPerMl;
  const newStock = before + bought;

  if (before <= 0) {
    return { newAvgCostPerMl: rate, newStockMl: newStock };
  }

  const newAvg = (before * oldAvg + bought * rate) / newStock;
  return { newAvgCostPerMl: newAvg, newStockMl: newStock };
}
