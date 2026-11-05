import type { PublicUvLineInput } from "@/lib/publicQuote/publicQuoteSchema";
import { shopUvItemProductForSku } from "@/lib/storefront/catalogConfig";
import { stockItemPrintArea } from "@/lib/uv/stockItems";

/**
 * Why a storefront UV item line is refused: a main print size its product does
 * not sell, or a print side it does not offer (a `uvItem` prints one side: the
 * shop's «main» front zone — a bottle's back is not sold).
 */
export type ShopUvItemZoneCode = "uv_zone_size_mismatch" | "uv_zone_side_unavailable";

export interface ShopUvItemRow {
  sku: string;
  attributes: unknown;
}

const near = (a: number | undefined, b: number): boolean => a != null && Math.abs(a - b) < 0.001;

/**
 * Storefront check of a UV stock line (`uvItem` products): while the item card
 * has no print area, the main zone must be the product's fallback zone
 * (`fallbackPrintAreaCm`) — the size the order and the workshop then show.
 * With a print area on the card the engine takes the card's size (the sent
 * one is ignored). Any zone beyond the one front zone the product offers is
 * refused (`uv_zone_side_unavailable`), whatever the card. Other SKUs pass
 * (the public quote prices any UV item). Pure.
 */
export function shopUvItemZoneError(
  line: Pick<PublicUvLineInput, "source" | "zones">,
  item: ShopUvItemRow | null,
): ShopUvItemZoneCode | null {
  if (line.source !== "stock" || !item) return null;
  const config = shopUvItemProductForSku(item.sku);
  if (!config || config.mode !== "simple") return null;
  if (line.zones.length > 1 || line.zones.some((z) => z.placement !== "front")) return "uv_zone_side_unavailable";
  if (stockItemPrintArea(item.attributes)) return null;
  const want = config.fallbackPrintAreaCm;
  const main = line.zones[0];
  if (!want || !main) return "uv_zone_size_mismatch";
  return near(main.widthCm, want.widthCm) && near(main.heightCm, want.heightCm) ? null : "uv_zone_size_mismatch";
}
