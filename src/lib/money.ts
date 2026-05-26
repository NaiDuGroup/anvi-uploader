import { formatCurrency } from "./invoice/invoiceDisplay";

/**
 * Shared 2-decimal MDL (bani) money utilities for orders and product
 * catalogs. Invoices use `Prisma.Decimal` on the server with a parallel
 * set of UI helpers in `NewInvoicePageClient.tsx`; this module
 * generalises the same string ↔ number ↔ display flow so the rest of
 * the app can share a single source of truth.
 *
 * Math runs in plain JS `number`s (sufficient precision for MDL amounts
 * up to billions × 100). Server-side writes wrap the resulting value in
 * `new Prisma.Decimal(value.toFixed(2))` before persistence, which keeps
 * the database column free of float drift.
 */

/**
 * Round to 2 decimal places (bani precision). Matches the server-side
 * `Prisma.Decimal.toDecimalPlaces(2, ROUND_HALF_UP)` policy used by the
 * invoice totals calculator.
 */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Parse a money amount from a user input string. Accepts comma or dot as
 * the decimal separator (Romanian/Russian locale habit). Returns `null`
 * for empty/invalid input, otherwise a non-negative number rounded to 2
 * decimal places.
 */
export function parseAmountMdl(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(",", ".");
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return round2(n);
}

/**
 * Format a numeric MDL amount for use as the initial value of a money
 * input. Always emits 2 decimal places (`"15.00"`) so the field round-
 * trips cleanly through `parseAmountMdl`.
 */
export function formatAmountInput(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return round2(n).toFixed(2);
}

/**
 * Format a numeric MDL amount for read-only display with the locale-
 * aware thousands separator and the trailing currency code. Wraps
 * `formatCurrency` (invoice utilities) so orders, catalog cards and
 * cabinet screens share the same `"1.234,50 MDL"` / `"1,234.50 MDL"`
 * rendering as invoices.
 */
export function formatAmountMdl(
  amount: number | string | null | undefined,
  currency: string,
): string {
  if (amount == null) return `— ${currency}`;
  return formatCurrency(amount, currency);
}

/**
 * Restrict an input string to a money-shaped value: digits plus a
 * single decimal separator (dot or comma) and at most 2 fractional
 * digits. Used inline in `onChange` handlers to mirror the integer
 * `replace(/\D/g, "")` pattern these admin forms used before decimals
 * were allowed.
 */
export function sanitizeMoneyInput(
  raw: string,
  options: { maxIntegerDigits?: number } = {},
): string {
  const maxIntegerDigits = options.maxIntegerDigits ?? 9;
  const allowedChars = raw.replace(/[^\d.,]/g, "");
  const normalized = allowedChars.replace(",", ".");
  const firstDot = normalized.indexOf(".");
  if (firstDot === -1) {
    return normalized.slice(0, maxIntegerDigits);
  }
  const intPart = normalized.slice(0, firstDot).slice(0, maxIntegerDigits);
  const fracPart = normalized.slice(firstDot + 1).replace(/\./g, "").slice(0, 2);
  return `${intPart}.${fracPart}`;
}
