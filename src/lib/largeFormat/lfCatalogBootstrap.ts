/**
 * Bootstrap a roll's cost hint per linear metre (the unified stock variant's
 * `purchaseCost`) from a one-off "full roll purchase" total (MDL) and nominal
 * roll length (m). Used until the weighted average takes over from receipts.
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
