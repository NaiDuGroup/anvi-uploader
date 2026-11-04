/**
 * Client-safe shapes of the storefront: products as the pages show them
 * (already in the visitor's language) and the quote lines sent to
 * `POST /api/public/quote` / `POST /api/shop/checkout`.
 */

export type ShopCategorySlug = "caiete" | "cani" | "tricouri" | "pixuri";

export type ShopSimpleKind = "mug" | "notebook" | "pen";

export type ShopDtfPlacement = "front" | "chest_left" | "chest_center" | "back";

export interface ShopDtfZoneLine {
  id: string;
  placement: ShopDtfPlacement;
  presetId: string | null;
  widthCm?: number;
  heightCm?: number;
}

/** Exactly the line shape `POST /api/public/quote` accepts (subset the shop uses). */
export type ShopQuoteLine =
  | { kind: ShopSimpleKind; productId: string; quantity: number }
  | {
      kind: "dtf";
      garmentId: string;
      sizes: { size: string; quantity: number }[];
      zones: ShopDtfZoneLine[];
      layoutKey?: string;
    };

export interface ShopVariant {
  /** Stock variant id — the quote's `productId`. */
  id: string;
  label: string;
  hex: string;
  images: string[];
  /** Retail price per piece from the catalog (display only; the quote decides). */
  price: number | null;
  /** Run-size price table (pens), when the variant has more than one tier; display only. */
  tiers?: ShopPriceTier[];
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
  sizes: string[];
  /** First-tier price of the bare item. */
  itemPrice: number | null;
  /** Run-size price table of the item (cap: logo included), when it has more than one tier; display only. */
  tiers?: ShopPriceTier[];
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

export interface ShopDtfConfig {
  garment: "tshirt" | "cap";
  colors: ShopDtfColor[];
  /** Price-list formats (T-shirt). Empty for a cap: its logo is fixed. */
  prints: ShopPrintOption[];
  /** Cap: one fixed logo zone. */
  fixedZone: { widthCm: number; heightCm: number } | null;
  /** T-shirt print run discount (null = list prices at every quantity). */
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
  mode: "simple" | "dtf";
  simpleKind: ShopSimpleKind | null;
  variants: ShopVariant[];
  dtf: ShopDtfConfig | null;
  editorHref: string | null;
  /** Print size the artwork check uses for simple products (cm). */
  printAreaCm: { widthCm: number; heightCm: number } | null;
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
}
