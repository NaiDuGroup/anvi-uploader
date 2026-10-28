import type { GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvInkCosts, UvPrintArea } from "@/lib/uv/uvLineCalc";
import type { UvPrintNorms } from "@/lib/uv/uvPrintNorms";

export interface UvLocalizedNames {
  ro: string;
  ru: string;
  en: string;
}

/**
 * A stock item in the UV editor: one active `StockVariant` of a category whose
 * `printMethods` contains "uv" (pens, notebooks, …).
 */
export interface UvStockItemJson {
  /** `StockVariant.id`. */
  id: string;
  itemId: string;
  categoryCode: string;
  categoryNames: UvLocalizedNames;
  itemNames: UvLocalizedNames;
  /** Item name stored in the line snapshot (default locale, with fallbacks). */
  name: string;
  sku: string;
  /** Colour / size of the variant; null when the item has a single unnamed variant. */
  variantLabel: string | null;
  colorHex: string | null;
  /** Public URL of the stock item's photo; null when it has none. */
  imageUrl: string | null;
  stockQuantity: number;
  /** `avgCost` ?? `purchaseCost` per piece; null when neither is set. */
  unitCostMdl: number | null;
  /** Retail run-size prices: the variant's `priceTiers`, else `sellPrice` from 1 piece. */
  priceTiers: GarmentPriceTier[];
  /** `StockVariant.dealerPrice` per piece; null = dealers pay the retail tier price. */
  dealerPriceMdl: number | null;
  /** «Параметры печати» of the item (`attributes.printWidthCm/HeightCm`); null when not set. */
  printArea: UvPrintArea | null;
  /** How the item is usually printed (underbase layers, varnish, primer); the main zone starts with these. */
  printNorms: UvPrintNorms;
}

/** Everything the order editor needs to build a UV line. */
export interface UvCatalogJson {
  items: UvStockItemJson[];
  settings: UvSettings;
  inkCosts: UvInkCosts;
}
