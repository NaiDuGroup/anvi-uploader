import { dtfPrintFitsItem } from "@/lib/dtf/dtfLineCalc";
import type { PublicDtfLineInput } from "@/lib/publicQuote/publicQuoteSchema";
import { shopDtfItemPrintLimit, shopDtfItemProductForSku } from "@/lib/storefront/catalogConfig";

/** Why a storefront bag / toy line asks for a print its item cannot take. */
export type ShopDtfItemLimitCode = "dtf_zone_too_large_for_item" | "dtf_zone_side_unavailable";

export interface ShopDtfItemRow {
  sku: string;
  attributes: unknown;
}

/**
 * Storefront check of a DTF line on a bag / toy (`garment: "item"` products):
 * every zone must be one of the product's sides and fit its largest print —
 * the stock item's print area when filled in, else the product's fallback
 * (`maxPrintCm`). Other items (T-shirts, caps — the engine limits caps) and
 * SKUs the storefront does not sell pass. Pure.
 */
export function shopDtfItemLimitError(
  line: Pick<PublicDtfLineInput, "zones">,
  item: ShopDtfItemRow | null,
  presetSize: (presetId: string) => { widthCm: number; heightCm: number } | null,
): ShopDtfItemLimitCode | null {
  if (!item) return null;
  const config = shopDtfItemProductForSku(item.sku);
  if (!config) return null;
  const sides: string[] = (config.zones ?? []).map((z) => z.side);
  const limit = shopDtfItemPrintLimit(config, item.attributes);
  for (const z of line.zones) {
    if (!sides.includes(z.id)) return "dtf_zone_side_unavailable";
    const size = z.presetId != null ? presetSize(z.presetId) : z.widthCm && z.heightCm ? { widthCm: z.widthCm, heightCm: z.heightCm } : null;
    if (!size) continue; // unknown preset: the engine refuses it
    if (!dtfPrintFitsItem(size.widthCm, size.heightCm, limit)) return "dtf_zone_too_large_for_item";
  }
  return null;
}

/** Stock item id of a public DTF garment id (`<stockItemId>:<colorKey>`). */
export function dtfGarmentStockItemId(garmentId: string): string {
  const i: number = garmentId.indexOf(":");
  return i > 0 ? garmentId.slice(0, i) : garmentId;
}
