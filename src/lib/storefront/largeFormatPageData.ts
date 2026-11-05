import type { LfKitId } from "@/lib/largeFormat/lfKits";
import type { ShopLfMaterial, ShopLfProduct } from "./largeFormat";

/** Client-safe data a wide-format product page starts from (`loadShopLfPageData`). */

export interface ShopLfPageMaterial {
  key: ShopLfMaterial;
  /** Widest printable width of the material's rolls, cm. */
  maxPrintableWidthCm: number;
  /** Canvas: mirrored wrap per side, cm (0 otherwise). */
  wrapCm: number;
  /** Price-list sizes (canvas, photo paper 200 g), smallest first; retail lei per piece. */
  presets: { widthCm: number; heightCm: number; price: number }[];
}

export interface ShopLfPageKit {
  id: LfKitId;
  widthCm: number;
  heightCm: number;
  printWidthCm: number;
  printHeightCm: number;
  hiddenBottomCm: number;
  price: number;
  cornerEyelets: boolean;
}

export interface ShopLfPageData {
  product: ShopLfProduct;
  materials: ShopLfPageMaterial[];
  kits: ShopLfPageKit[];
  /** Retail minimum per line (production settings), lei. */
  minLineMdl: number;
  /** Lowest price shown on the card («de la …»); null when unknown. */
  fromPrice: number | null;
  /** False when none of the product's rolls is active. */
  available: boolean;
}
