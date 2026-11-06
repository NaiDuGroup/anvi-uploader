import { designLineVariantId, isStudioQuoteKind, type ShopEditorKind } from "@/lib/storefront/design";
import { simpleQuoteLine } from "@/lib/storefront/quoteLine";
import type { ShopProduct, ShopQuoteLine, ShopVariant } from "@/lib/storefront/types";
import { SHOP_BC_DEFAULT_PACK } from "@/lib/storefront/businessCards";
import { STUDIO_DEFAULT_PRINT } from "./surfaces";

/**
 * What an ANVI Studio design is sold as. Most Studio products are the
 * editor's own kind (a `mug` / `pen` line, priced by `productId`); UV mugs and
 * pens (`uvItem`) are a public `uv` stock line (`simpleQuoteLine`) whose main
 * print is exactly the zone the checkout accepts — the item card's print
 * area, else the product's fallback zone (`shopUvItemZoneError`). The Studio
 * canvas is drawn at that size. Pure (client-safe, unit-tested).
 */

/** A UV stock product (`uvItem`) designed in the Studio. */
export function isStudioUvProduct(product: Pick<ShopProduct, "simpleKind">): boolean {
  return product.simpleKind === "uvItem";
}

/** Quote line of a Studio design on this product / variant. */
export function studioQuoteLine(
  kind: ShopEditorKind,
  product: Pick<ShopProduct, "simpleKind">,
  variant: Pick<ShopVariant, "id" | "uvNorms" | "uvZone">,
  quantity: number,
): ShopQuoteLine {
  const q: number = Math.max(1, Math.round(quantity));
  // Business cards: the default pack, front only (the card verify step builds the real line, `cardLine.ts`).
  if (kind === "card") return { kind: "businessCard", pricing: "shopPack", sides: "one", quantity: SHOP_BC_DEFAULT_PACK };
  if (isStudioUvProduct(product)) return simpleQuoteLine("uvItem", variant, q);
  return { kind, productId: variant.id, quantity: q };
}

/** A cart line the Studio of `kind` may reopen («Editează designul»): Studio-made, its own kind or a UV stock line. */
export function isStudioCartLine(
  line: { quote: ShopQuoteLine; design?: { editor: ShopEditorKind; studio?: unknown } | null },
  kind: ShopEditorKind,
): boolean {
  return !!line.design?.studio && line.design.editor === kind && isStudioQuoteKind(kind, line.quote);
}

/** Pieces of a Studio line (every kind it may be has a `quantity`). */
export function studioLineQuantity(quote: ShopQuoteLine): number {
  return "quantity" in quote && typeof quote.quantity === "number" ? quote.quantity : 1;
}

export { designLineVariantId };

/**
 * Print size (cm) the Studio draws and prints for a UV variant: a pen's one
 * zone (`studioPrintCm`, `penZone.ts`), else the size the UV engine prices
 * (card area, else the fallback zone); null for other products (their size
 * comes from the catalog item, `/api/<kind>-products`). The checkout accepts
 * it: a card area is priced whatever the line says, and without one the zone
 * is the product's fallback zone the line carries.
 */
export function studioUvPrintCm(
  product: Pick<ShopProduct, "simpleKind" | "printAreaCm">,
  variant: Pick<ShopVariant, "uvPrintCm" | "uvZone" | "studioPrintCm"> | undefined,
): { widthCm: number; heightCm: number } | null {
  if (!isStudioUvProduct(product)) return null;
  const z = variant?.studioPrintCm ?? variant?.uvPrintCm ?? variant?.uvZone ?? product.printAreaCm;
  return z && z.widthCm > 0 && z.heightCm > 0 ? { widthCm: z.widthCm, heightCm: z.heightCm } : null;
}

/** Studio catalog item fields (`StudioCatalogItem` in StudioApp). */
export interface StudioItemLike {
  id: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  [k: string]: unknown;
}

/**
 * The catalog item the Studio works with for a UV product: the listed item
 * (UV pens are in `/api/pen-products`) or a stand-in (UV mugs are not in
 * `/api/mug-products`), always with the print size the UV line is priced at —
 * a listed pen card without print parameters is served as 4×1.5, which the
 * checkout would refuse. Mugs: the option colour paints the body, or only the
 * inside when `studioColorInside` (RADEK / AKEBIA: white outside). Other
 * products: the listed item unchanged.
 */
export function studioUvItem(
  kind: ShopEditorKind,
  product: Pick<ShopProduct, "simpleKind" | "printAreaCm" | "studioColorInside" | "name" | "slug">,
  variant: Pick<ShopVariant, "id" | "hex" | "uvPrintCm" | "uvZone" | "studioPrintCm"> | undefined,
  listed: StudioItemLike | null,
): StudioItemLike | null {
  const print = studioUvPrintCm(product, variant);
  if (!print || !variant) return listed;
  const dpi: number = listed?.printDpi && listed.printDpi > 0 ? listed.printDpi : STUDIO_DEFAULT_PRINT[kind].dpi;
  const base: StudioItemLike = listed ?? {
    id: variant.id,
    printWidthCm: print.widthCm,
    printHeightCm: print.heightCm,
    printDpi: dpi,
    name: product.name,
    slug: product.slug,
    ...(kind === "mug"
      ? product.studioColorInside
        ? { bodyColorHex: "#ffffff", handleColorHex: "#ffffff", rimColorHex: "#ffffff", innerColorHex: variant.hex }
        : { bodyColorHex: variant.hex, handleColorHex: variant.hex, rimColorHex: variant.hex, innerColorHex: variant.hex }
      : {}),
  };
  return { ...base, printWidthCm: print.widthCm, printHeightCm: print.heightCm, printDpi: dpi };
}
