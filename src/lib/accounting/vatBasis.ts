/** Standard Moldovan VAT rate (20%). */
export const STANDARD_VAT_RATE = 0.2;

export const VAT_MULTIPLIER: number = 1 + STANDARD_VAT_RATE;

/**
 * How money is compared in the profit report.
 * - `exVat: false` (legacy): VAT-inclusive revenue vs VAT-inclusive purchase costs.
 * - `exVat: true`: both sides without VAT. Cost snapshots frozen on orders created
 *   before `cutoverAt` were VAT-inclusive and are converted on the fly.
 */
export type ProfitVatBasis = {
  exVat: boolean;
  cutoverAt: Date | null;
};

export const LEGACY_VAT_BASIS: ProfitVatBasis = { exVat: false, cutoverAt: null };

export function profitVatBasisFromSettings(settings: {
  purchaseCostsIncludeVat: boolean;
  vatCutoverAt: Date | null;
}): ProfitVatBasis {
  return { exVat: !settings.purchaseCostsIncludeVat, cutoverAt: settings.vatCutoverAt };
}

/** Revenue on the report basis (`Order.price` is always VAT-inclusive). */
export function revenueOnBasis(priceInclVat: number, basis: ProfitVatBasis): number {
  return basis.exVat ? priceInclVat / VAT_MULTIPLIER : priceInclVat;
}

/**
 * Divisor for cost values frozen on an order (snapshots): VAT-inclusive
 * snapshots from before the cutover are brought to the ex-VAT basis.
 */
export function snapshotCostDivisor(orderCreatedAt: Date, basis: ProfitVatBasis): number {
  if (!basis.exVat) return 1;
  if (basis.cutoverAt == null || orderCreatedAt < basis.cutoverAt) return VAT_MULTIPLIER;
  return 1;
}

export function exVat(amountInclVat: number): number {
  return amountInclVat / VAT_MULTIPLIER;
}

/** Word the superadmin types to confirm the one-way switch to ex-VAT costs. */
export const VAT_CUTOVER_CONFIRMATION = "EX_VAT";

/**
 * Customer sell totals are VAT-inclusive. To compare them with purchase costs,
 * bring them to the same basis: ex-VAT once costs are kept without VAT.
 */
export function sellOnCostBasis(sellInclVat: number, costsIncludeVat: boolean): number {
  return costsIncludeVat ? sellInclVat : sellInclVat / VAT_MULTIPLIER;
}

/** Margin % of a VAT-inclusive sell total over a cost on the current cost basis. */
export function marginPercentOnCostBasis(
  sellInclVat: number,
  cost: number,
  costsIncludeVat: boolean,
): number {
  const sell: number = sellOnCostBasis(sellInclVat, costsIncludeVat);
  return sell > 0 ? Math.round(((sell - cost) / sell) * 10000) / 100 : 0;
}
