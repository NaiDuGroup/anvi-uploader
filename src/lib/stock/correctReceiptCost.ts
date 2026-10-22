/**
 * New weighted-average unit cost after a past receipt's total cost changes by
 * `deltaTotalMdl` (e.g. a provisional price replaced by the supplier invoice).
 *
 * The receipt's units are blended into the pool, so the per-unit correction
 * applies to the share of current stock that came from that receipt — capped
 * at the whole stock when less than the receipt remains.
 */
export function correctedAverageCost(params: {
  currentStock: number;
  currentAvgCost: number;
  receiptQuantity: number;
  deltaTotalMdl: number;
}): number {
  const { currentStock, currentAvgCost, receiptQuantity, deltaTotalMdl } = params;
  if (!(currentStock > 0) || !(receiptQuantity > 0)) return currentAvgCost;
  const perUnitDelta: number = deltaTotalMdl / receiptQuantity;
  const shareOfStock: number = Math.min(1, receiptQuantity / currentStock);
  return Math.max(0, currentAvgCost + perUnitDelta * shareOfStock);
}
