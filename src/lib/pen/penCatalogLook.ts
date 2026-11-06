import { shopSimpleOptionForSku } from "@/lib/storefront/catalogConfig";
import { studioPenZoneCm } from "@/lib/studio/penZone";
import { stockItemPrintArea } from "@/lib/uv/stockItems";
import type { PenAttributes } from "./penVariantAttributes";

/**
 * Body colour and print zone of a pen as `/api/pen-products` serves them,
 * matching what the shop and ANVI Studio show:
 * - colour: the shop option's colour (`catalogConfig` / `catalogStock`) —
 *   pen cards store the form default `#1f1f1f` whatever the pen's colour;
 *   the card's own colour only when no shop option sells the SKU;
 * - zone: the Studio's one rule (`studioPenZoneCm`) from the card's own print
 *   area (not the 4×1.5 default filled in when it has none) and the product's
 *   fallback zone; pens the shop does not sell keep the card values.
 * Pure.
 */
export function penCatalogLook(
  sku: string,
  attributes: unknown,
  parsed: Pick<PenAttributes, "bodyColorHex" | "printWidthCm" | "printHeightCm">,
): { bodyColorHex: string; printWidthCm: number; printHeightCm: number } {
  const hit = shopSimpleOptionForSku(sku);
  if (!hit) return { bodyColorHex: parsed.bodyColorHex, printWidthCm: parsed.printWidthCm, printHeightCm: parsed.printHeightCm };
  const card = stockItemPrintArea(attributes);
  const shape = hit.product.mode === "simple" ? (hit.product.studioPenShape ?? "pen") : "pen";
  const zone =
    hit.product.kind === "uvItem" || card
      ? studioPenZoneCm(shape, card, hit.product.fallbackPrintAreaCm)
      : { widthCm: parsed.printWidthCm, heightCm: parsed.printHeightCm };
  const hex: string = /^#[0-9a-fA-F]{6}$/.test(hit.option.hex) ? hit.option.hex.toLowerCase() : parsed.bodyColorHex;
  return { bodyColorHex: hex, printWidthCm: zone.widthCm, printHeightCm: zone.heightCm };
}
