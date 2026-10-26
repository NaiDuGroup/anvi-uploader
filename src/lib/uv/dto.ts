import type { GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import type { PrintPresetJson } from "@/lib/printMethods/presets";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvInkCosts } from "@/lib/uv/uvLineCalc";

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
  stockQuantity: number;
  /** `avgCost` ?? `purchaseCost` per piece; null when neither is set. */
  unitCostMdl: number | null;
  /** Retail run-size prices: the variant's `priceTiers`, else `sellPrice` from 1 piece. */
  priceTiers: GarmentPriceTier[];
}

/** Everything the order editor needs to build a UV line. */
export interface UvCatalogJson {
  items: UvStockItemJson[];
  presets: PrintPresetJson[];
  settings: UvSettings;
  inkCosts: UvInkCosts;
}
