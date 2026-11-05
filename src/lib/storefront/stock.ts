import type { ShopQuoteLine } from "./types";

/**
 * Stock on the storefront. `StockVariant.stockQuantity` (cached sum of the
 * movements) is the balance; the shop sells whole pieces. The schema has no
 * «not tracked» flag (the balance is never null), but a missing balance is
 * treated as available so a gap in the data never hides a product.
 *
 * Pure (client-safe, unit-tested). The checkout re-checks on the server
 * (`src/lib/shop/stockCheck.ts`).
 */

/** At or below this many pieces the product page says «Disponibil: N buc.». */
export const SHOP_LOW_STOCK = 5;

/** Whole pieces in stock (never negative); null stays null (= not tracked). */
export function wholeStock(quantity: number | null | undefined): number | null {
  if (quantity == null || !Number.isFinite(quantity)) return null;
  return Math.max(0, Math.floor(quantity + 1e-9));
}

/**
 * Extra working days of an option with a balance of 0: it stays orderable
 * and shows «La comandă · +N zile» (owner 2026-11-05; N «уточнить»). A label
 * only — independent of the stock-check switch (`SHOP_STOCK_CHECK`).
 */
export const SHOP_MADE_TO_ORDER_DAYS = 5;

/** A balance of exactly 0 whole pieces (null / missing = not tracked, not made to order). */
export function isMadeToOrder(stockQuantity: number | null | undefined): boolean {
  return wholeStock(stockQuantity) === 0;
}

/** Whether an option can be ordered at all. */
export function inStock(stock: number | null | undefined): boolean {
  return stock == null || stock > 0;
}

/** Largest quantity the steppers allow: the stock, at most `cap`. */
export function maxOrderQty(stock: number | null | undefined, cap: number): number {
  return stock == null ? cap : Math.max(0, Math.min(cap, stock));
}

/** «Disponibil: N buc.» shows for a tracked balance of 1…{@link SHOP_LOW_STOCK}. */
export function showsLowStock(stock: number | null | undefined): stock is number {
  return stock != null && stock > 0 && stock <= SHOP_LOW_STOCK;
}

/** A DTF colour with at least one size that can be ordered. */
export function colorInStock(color: { sizes: readonly string[]; sizeStock: Readonly<Record<string, number>> }): boolean {
  return color.sizes.some((s) => inStock(color.sizeStock[s]));
}

/** A stored / sent UV stock-item line as the shop builds it (one included main zone). */
export function isShopUvLine(v: Record<string, unknown>): boolean {
  if (v.kind !== "uv" || v.source !== "stock") return false;
  if (typeof v.variantId !== "string" || typeof v.quantity !== "number" || v.quantity < 1) return false;
  if (!Array.isArray(v.zones) || v.zones.length !== 1) return false;
  const z: unknown = v.zones[0];
  return z != null && typeof z === "object" && (z as { id?: unknown }).id === "main";
}

/** A stored / sent sublimation blank line as the shop builds it. */
export function isShopSublimationLine(v: Record<string, unknown>): boolean {
  return v.kind === "sublimation" && typeof v.variantId === "string" && typeof v.quantity === "number" && v.quantity >= 1;
}

/** Stock variant id of a simple / UV / sublimation quote line (null for DTF). */
export function quoteVariantId(quote: ShopQuoteLine): string | null {
  if (quote.kind === "dtf" || quote.kind === "businessCard" || quote.kind === "print" || quote.kind === "sheetShop") return null;
  if (quote.kind === "uv") return quote.source === "stock" ? quote.variantId : null;
  if (quote.kind === "sublimation") return quote.variantId;
  return quote.productId;
}
