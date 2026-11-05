import { DTF_ONE_SIZE, parseDtfGarmentId } from "@/lib/dtf/stockGarments";
import type { PublicQuoteLineInput } from "@/lib/publicQuote/publicQuoteSchema";

/**
 * Storefront checkout stock check: every cart line must fit in the balance of
 * its stock variant (`StockVariant.stockQuantity`, whole pieces). Lines of the
 * same variant (two cart lines of one mug, one size in two T-shirt lines) add
 * up, in cart order: the line that goes over is the one reported.
 *
 * Only checks — the order pipeline deducts stock as before (and not at all
 * for test orders, which are still checked so testers see the real answer).
 * A variant the check cannot find (legacy product id, unknown size) is left to
 * the order resolver; a balance that is null counts as not tracked.
 *
 * The functions here are pure; `checkShopStock` in `checkout.ts` loads rows.
 */

/** Pieces one cart line takes from one variant. */
export interface StockDemand {
  index: number;
  variantId: string;
  quantity: number;
  /** DTF: the size, for the message. */
  size?: string;
}

/** The first line that asks for more than is left. */
export interface StockShortage {
  index: number;
  /** Whole pieces left for this line (after earlier lines of the same variant). */
  available: number;
  size?: string;
}

/** Active variants of a DTF stock item (what `resolveDtfLine` picks sizes from). */
export interface DtfStockVariant {
  id: string;
  itemId: string;
  options: unknown;
  label: string | null;
  sortOrder: number;
}

function optionString(options: unknown, key: "color" | "size"): string {
  if (options == null || typeof options !== "object" || Array.isArray(options)) return "";
  const v: unknown = (options as Record<string, unknown>)[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Stock item ids of the DTF lines (to load their variants). */
export function dtfStockItemIds(lines: readonly PublicQuoteLineInput[]): string[] {
  const ids = new Set<string>();
  for (const l of lines) {
    if (l.kind !== "dtf") continue;
    const g = parseDtfGarmentId(l.garmentId);
    if (g) ids.add(g.stockItemId);
  }
  return [...ids];
}

/** Variant of a DTF colour + size: same match as the engine (colour key, size or label, first by sort order). */
export function dtfSizeVariantId(
  garmentId: string,
  size: string,
  variants: readonly DtfStockVariant[],
): string | null {
  const g = parseDtfGarmentId(garmentId);
  if (!g) return null;
  const want: string = size.trim().toUpperCase();
  const match = variants
    .filter((v) => v.itemId === g.stockItemId && optionString(v.options, "color").toLowerCase() === g.colorKey)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((v) => (optionString(v.options, "size") || v.label?.trim() || DTF_ONE_SIZE).toUpperCase() === want);
  return match?.id ?? null;
}

/** What each priced cart line takes from stock. */
export function shopStockDemands(
  lines: readonly PublicQuoteLineInput[],
  dtfVariants: readonly DtfStockVariant[] = [],
): StockDemand[] {
  const out: StockDemand[] = [];
  lines.forEach((l, index) => {
    switch (l.kind) {
      case "mug":
      case "notebook":
      case "pen":
        out.push({ index, variantId: l.productId, quantity: l.quantity });
        break;
      case "uv":
        if (l.source === "stock" && l.variantId) out.push({ index, variantId: l.variantId, quantity: l.quantity });
        break;
      case "sublimation":
        out.push({ index, variantId: l.variantId, quantity: l.quantity });
        break;
      case "stockItem":
        out.push({ index, variantId: l.variantId, quantity: l.quantity });
        break;
      case "dtf":
        for (const s of l.sizes) {
          const id = dtfSizeVariantId(l.garmentId, s.size, dtfVariants);
          if (id) out.push({ index, variantId: id, quantity: s.quantity, size: s.size });
        }
        break;
      case "businessCard":
        break;
    }
  });
  return out;
}

/** Whole pieces of a balance (never negative); null stays null (= not tracked). */
function whole(n: number | null): number | null {
  return n == null || !Number.isFinite(n) ? null : Math.max(0, Math.floor(n + 1e-9));
}

/**
 * First demand over the balance, or null. `balances`: variant id → stock
 * (a variant missing from the map, or null, is not checked).
 */
export function findStockShortage(
  demands: readonly StockDemand[],
  balances: ReadonlyMap<string, number | null>,
): StockShortage | null {
  const used = new Map<string, number>();
  for (const d of demands) {
    if (!balances.has(d.variantId)) continue;
    const stock: number | null = whole(balances.get(d.variantId) ?? null);
    if (stock == null) continue;
    const before: number = used.get(d.variantId) ?? 0;
    if (before + d.quantity > stock) {
      return { index: d.index, available: Math.max(0, stock - before), ...(d.size ? { size: d.size } : {}) };
    }
    used.set(d.variantId, before + d.quantity);
  }
  return null;
}
