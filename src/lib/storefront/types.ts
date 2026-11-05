/**
 * Client-safe shapes of the storefront: products as the pages show them
 * (already in the visitor's language) and the quote lines sent to
 * `POST /api/public/quote` / `POST /api/shop/checkout`.
 */

import type { ShopPrintQuote } from "./printPrices";
import type { PsQuoteLine } from "./printShop/pricing";

export type ShopCategorySlug =
  | "caiete"
  | "cani"
  | "tricouri"
  | "pixuri"
  | "genti"
  | "jucarii"
  // Whole stock on the shop (2026-11-05).
  | "sticle"
  | "jocuri"
  | "craciun"
  | "cadouri"
  | "calendare";

/**
 * Simple product kinds: one variant, a quantity and one design file.
 * `uvItem`: a stock item with UV print (main print included in the item
 * price), quoted as a public `uv` line so the price is the studio wizard's.
 * `sublItem`: a sublimation blank that is not a mug (jug, medal, lanyard):
 * print included in the blank price, quoted as a public `sublimation` line.
 */
export type ShopSimpleKind = "mug" | "notebook" | "pen" | "uvItem" | "sublItem";

/** Simple kinds quoted by their variant as `productId`. */
export type ShopProductIdKind = Exclude<ShopSimpleKind, "uvItem" | "sublItem">;

/** The main (included) print zone of a UV stock item, with the item's print norms. */
export interface ShopUvZoneLine {
  id: "main";
  placement: "front";
  /**
   * Print size: only when the item card has no print parameters — the
   * product's fallback zone (`fallbackPrintAreaCm`); the engine otherwise
   * takes the card's size.
   */
  widthCm?: number;
  heightCm?: number;
  whiteLayers: number;
  varnish: boolean;
  primer: boolean;
}

/** UV print norms of a stock item (`StockItem.attributes`), sent with its quote line. */
export interface ShopUvNorms {
  whiteLayers: number;
  varnish: boolean;
  primer: boolean;
  /** Printed as UV-DTF (technique «transfer»). */
  transfer: boolean;
}

/** `other` = a non-garment item (bag, toy): the place is in `placementNote`, as the studio wizard saves it. */
export type ShopDtfPlacement = "front" | "chest_left" | "chest_center" | "back" | "other";

export interface ShopDtfZoneLine {
  id: string;
  placement: ShopDtfPlacement;
  /** Where on the item (staff-facing, Russian like the wizard's «Другое место»); `other` zones only. */
  placementNote?: string;
  presetId: string | null;
  widthCm?: number;
  heightCm?: number;
}

/** Exactly the line shape `POST /api/public/quote` accepts (subset the shop uses). */
export type ShopQuoteLine =
  | { kind: ShopProductIdKind; productId: string; quantity: number }
  | {
      kind: "uv";
      source: "stock";
      technique?: "direct" | "transfer";
      variantId: string;
      quantity: number;
      zones: [ShopUvZoneLine];
    }
  /** Sublimation blank (not a mug), print included in the blank price (`sublItem`). */
  | { kind: "sublimation"; variantId: string; quantity: number }
  | {
      kind: "dtf";
      garmentId: string;
      sizes: { size: string; quantity: number }[];
      zones: ShopDtfZoneLine[];
      layoutKey?: string;
    }
  /** Business-card pack (`businessCards.ts`): the server picks the paper and prices per card. */
  | {
      kind: "businessCard";
      pricing: "shopPack";
      sides: "one" | "two";
      quantity: number;
      /** Artwork of other proportions: crop to fill (default) or fit with white margins. */
      fit?: "cover" | "contain";
      /** Finishing (price list page 11). */
      lamination?: "gloss" | "matte";
      corners?: boolean;
    }
  /** Photo / document printing (`printPrices.ts`): one item per file, in the order of the line's files. */
  | ShopPrintQuote
  /** Print shop «Tipografie» (`printShop/config.ts`): flyers, invitations, calendars, sticker sheets. */
  | PsQuoteLine
  /** UV-DTF stickers (`printShop/uvStickers.ts`): one zone per design, the run in sets. */
  | ShopUvStickersLine;

/** UV-DTF stickers line: always film («transfer»), stickers taken away as they are. */
export interface ShopUvStickersLine {
  kind: "uv";
  source: "stickers";
  technique: "transfer";
  quantity: number;
  zones: ShopUvStickerZone[];
}

export interface ShopUvStickerZone {
  id: string;
  placement: "as_is";
  widthCm: number;
  heightCm: number;
  whiteLayers: number;
  varnish: boolean;
  primer: boolean;
}

export interface ShopVariant {
  /** Stock variant id — the quote's `productId`. */
  id: string;
  label: string;
  hex: string;
  images: string[];
  /** Subset of `images` (at the end) showing the model in another colour — captioned in the gallery. */
  lifestyleImages?: string[];
  /** Retail price per piece from the catalog (display only; the quote decides). */
  price: number | null;
  /** Run-size price table (pens), when the variant has more than one tier; display only. */
  tiers?: ShopPriceTier[];
  /** Pieces in stock (whole); null = not tracked (always available). */
  stock: number | null;
  /** UV stock item (`uvItem`): its print norms for the quote line. */
  uvNorms?: ShopUvNorms;
  /** UV stock item without print parameters on its card: the product's fallback print zone. */
  uvZone?: { widthCm: number; heightCm: number };
  /** Balance 0 (whatever the stock-check switch): sold «made to order», `madeToOrderDays` longer. */
  madeToOrder?: boolean;
}

/** One row of a run-size price table: `minQty`…`maxQty` pieces (null = and more) at `price` per piece. */
export interface ShopPriceTier {
  minQty: number;
  maxQty: number | null;
  price: number;
}

export interface ShopDtfColor {
  key: string;
  label: string;
  hex: string;
  /** `<stockItemId>:<colorKey>` as the DTF engine expects. */
  garmentId: string;
  images: string[];
  /** Subset of `images` (at the end) showing the model in another colour — captioned in the gallery. */
  lifestyleImages?: string[];
  sizes: string[];
  /** First-tier price of the bare item. */
  itemPrice: number | null;
  /** Pieces in stock per size (whole); a size missing here is not tracked (always available). */
  sizeStock: Record<string, number>;
  /** Run-size price table of the item (cap: logo included), when it has more than one tier; display only. */
  tiers?: ShopPriceTier[];
  /** Sizes whose balance is 0 (whatever the stock-check switch): made to order. */
  madeToOrderSizes?: string[];
}

/** Retail run-size discount on DTF print prices (`PrintMethod('dtf').settings`); display only. */
export interface ShopPrintDiscount {
  /** From `minQty` pieces the format price drops by `pct` %. */
  steps: { minQty: number; pct: number }[];
  /** The discounted price is rounded to this many lei (0 = to the bani). */
  roundTo: number;
}

export interface ShopPrintOption {
  presetId: string;
  label: string;
  widthCm: number;
  heightCm: number;
  price: number;
}

/**
 * DTF product family on the shop: a T-shirt (sizes, front/back), a cap (one
 * logo included in the price) or a non-garment `item` — a bag or a toy: no
 * sizes, a quantity, the bare item plus a print by the price list on the
 * item's own zones.
 */
export type ShopDtfGarment = "tshirt" | "cap" | "item";

/** A print zone of a DTF `item` (bag front / back, the toy's T-shirt). */
export interface ShopDtfItemZone {
  side: "front" | "back";
  /** Shown to the visitor (already in their language). */
  label: string;
  /** Sent as the zone's `placementNote` (staff-facing). */
  note: string;
}

export interface ShopDtfConfig {
  garment: ShopDtfGarment;
  colors: ShopDtfColor[];
  /** Price-list formats (T-shirt; item: those that fit its print area). Empty for a cap: its logo is fixed. */
  prints: ShopPrintOption[];
  /** Item: where it can be printed (first = the default). Empty for T-shirts and caps. */
  itemZones: ShopDtfItemZone[];
  /** Cap: one fixed logo zone. */
  fixedZone: { widthCm: number; heightCm: number } | null;
  /** T-shirt / item print run discount (null = list prices at every quantity). */
  printDiscount: ShopPrintDiscount | null;
  /** Heat-press fee per print zone and piece (retail). */
  pressFeeMdl: number;
}

export interface ShopProduct {
  slug: string;
  category: ShopCategorySlug;
  name: string;
  subtitle: string;
  description: string;
  badge: string | null;
  fromPrice: number | null;
  /**
   * Lowest price per piece at the biggest run, when the product has run-size
   * prices (pens, caps, T-shirts); null = one price at every quantity.
   */
  unitFrom: number | null;
  image: string | null;
  /** False when every option (and every size) is out of stock: hidden from listings, its page says so. */
  available: boolean;
  mode: "simple" | "dtf";
  simpleKind: ShopSimpleKind | null;
  variants: ShopVariant[];
  dtf: ShopDtfConfig | null;
  editorHref: string | null;
  /** Print size the artwork check uses for simple products (cm). */
  printAreaCm: { widthCm: number; heightCm: number } | null;
  /** Every option has a balance of 0: the card says «made to order · +N days». */
  madeToOrder?: boolean;
  /** Extra working days of a made-to-order option (`SHOP_MADE_TO_ORDER_DAYS`). */
  madeToOrderDays?: number;
}

export interface ShopCategory {
  slug: ShopCategorySlug;
  name: string;
  image: string | null;
  productCount: number;
}

export interface ShopCatalog {
  categories: ShopCategory[];
  products: ShopProduct[];
}

/** A file attached to a cart line (already uploaded via `/api/upload-url`). */
export interface ShopFileRef {
  fileKey: string;
  fileName: string;
  sizeBytes?: number;
  /** DTF zone the file is for («front» / «back»); kept client-side only. */
  zone?: string;
  /** Print-quality hint computed when uploaded. */
  lowRes?: boolean;
  /** Business cards / photos: a small image data URL (client-only, for the preview and the cart). */
  thumb?: string;
  /** Photo / document printing: pixel size of an image and the page count read in the browser (client-only). */
  pixelWidth?: number;
  pixelHeight?: number;
  pages?: number;
  /** `pages` was read from the PDF (browser or server), not typed by the customer: not editable. */
  pagesCounted?: boolean;
}
