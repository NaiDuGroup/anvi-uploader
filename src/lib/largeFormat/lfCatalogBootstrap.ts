/**
 * Bootstrap catalog `costPerLinearMeter` from a one-off "full roll purchase" total (MDL)
 * and nominal roll length (m). Used until weighted-average takes over from stock receipts.
 */
export function catalogCostPerLinearMeterFromInitialRollPurchase(params: {
  rollLengthMeters: string;
  initialRollPurchaseMdl: number;
}): number {
  const rl = Number(params.rollLengthMeters);
  if (
    !(params.initialRollPurchaseMdl > 0) ||
    !(rl > 0) ||
    !Number.isFinite(rl)
  ) {
    return 0;
  }
  return Math.round(params.initialRollPurchaseMdl / rl);
}
