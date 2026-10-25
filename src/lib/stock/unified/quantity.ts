import { StockUnit, unitAllowsFractions } from "./kinds";

/** Fractional units (m, ml, g) keep 3 decimals, matching `Decimal(14, 3)`. */
export const QUANTITY_DECIMALS = 3;
export const MAX_STOCK_QUANTITY = 99_999_999;

export type QuantityProblem = "not_a_number" | "not_positive" | "negative" | "must_be_whole" | "too_many_decimals" | "too_large";

/**
 * Why `value` is not a valid quantity for `unit`, or null when it is.
 * `allowZero` is for counted stock (inventory) where 0 is a real answer.
 */
export function quantityProblem(
  value: number,
  unit: StockUnit,
  opts: { allowZero?: boolean } = {},
): QuantityProblem | null {
  if (!Number.isFinite(value)) return "not_a_number";
  if (value < 0) return "negative";
  if (value === 0 && !opts.allowZero) return "not_positive";
  if (value > MAX_STOCK_QUANTITY) return "too_large";
  if (!unitAllowsFractions(unit)) {
    return Number.isInteger(value) ? null : "must_be_whole";
  }
  const scaled: number = value * 10 ** QUANTITY_DECIMALS;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6 ? null : "too_many_decimals";
}

export function isValidQuantity(value: number, unit: StockUnit, opts: { allowZero?: boolean } = {}): boolean {
  return quantityProblem(value, unit, opts) === null;
}

/** Keep only what can be typed for the unit: digits, plus one separator and 3 decimals for m/ml/g. */
export function sanitizeQuantityInput(raw: string, unit: StockUnit): string {
  if (!unitAllowsFractions(unit)) return raw.replace(/\D/g, "").slice(0, 8);
  const normalized: string = raw.replace(/[^\d.,]/g, "").replace(",", ".");
  const dot: number = normalized.indexOf(".");
  if (dot === -1) return normalized.slice(0, 8);
  const intPart: string = normalized.slice(0, dot).slice(0, 8);
  const frac: string = normalized.slice(dot + 1).replace(/\./g, "").slice(0, QUANTITY_DECIMALS);
  return `${intPart}.${frac}`;
}

/** Parse a typed quantity; null when empty or invalid for the unit. */
export function parseQuantityInput(
  raw: string,
  unit: StockUnit,
  opts: { allowZero?: boolean } = {},
): number | null {
  const s: string = raw.trim().replace(",", ".");
  if (s === "" || s === ".") return null;
  const n: number = Number(s);
  return isValidQuantity(n, unit, opts) ? n : null;
}

/** Display a quantity: integers as is, fractions with up to 3 decimals. */
export function formatQuantity(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}
