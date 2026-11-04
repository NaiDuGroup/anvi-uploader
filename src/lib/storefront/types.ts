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
}

export interface ShopProduct {
  slug: string;
  category: ShopCategorySlug;
  name: string;
  subtitle: string;
  description: string;
  badge: string | null;
  fromPrice: number | null;
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
