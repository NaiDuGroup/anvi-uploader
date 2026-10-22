import { Prisma } from "@prisma/client";

type DecimalLike = Prisma.Decimal | number | null | undefined;

function toFiniteNumber(value: DecimalLike): number | null {
  if (value == null) return null;
  const n: number = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(n) ? n : null;
}

/**
 * Unit COGS for catalog SKUs: weighted-average receipt cost, falling back to the
 * manual catalog `purchaseCost` until the first detailed receipt is recorded.
 * Rounded to bani so snapshots and reports stay in MDL precision.
 */
export function effectiveUnitCost(
  avgPurchaseCost: DecimalLike,
  purchaseCost: DecimalLike,
): number | null {
  const unit: number | null =
    toFiniteNumber(avgPurchaseCost) ?? toFiniteNumber(purchaseCost);
  return unit == null ? null : Math.round(unit * 100) / 100;
}

/** Cost of `quantity` units at the effective unit cost (MDL, 2 decimals). */
export function stockValueMdl(
  quantity: number,
  avgPurchaseCost: DecimalLike,
  purchaseCost: DecimalLike,
): number | null {
  const unit: number | null =
    toFiniteNumber(avgPurchaseCost) ?? toFiniteNumber(purchaseCost);
  return unit == null ? null : Math.round(unit * quantity * 100) / 100;
}

export type UnitCostSource = {
  avgPurchaseCost: Prisma.Decimal | null;
  purchaseCost: Prisma.Decimal | null;
};

/** Ledger `costMdl` for a stock movement of `quantity` units; null when the SKU has no cost yet. */
export function stockValueDecimal(
  quantity: number,
  product: UnitCostSource | null,
): Prisma.Decimal | null {
  if (!product) return null;
  const value: number | null = stockValueMdl(
    quantity,
    product.avgPurchaseCost,
    product.purchaseCost,
  );
  return value == null ? null : new Prisma.Decimal(value.toFixed(2));
}
