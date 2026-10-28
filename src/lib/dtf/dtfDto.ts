import type { GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfPresetOption, DtfUnitCosts } from "@/lib/dtf/dtfLineCalc";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import type { GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";

/** One size of a printable garment colour = one unified `StockVariant`. */
export interface DtfGarmentSizeJson {
  /** `StockVariant.id`. */
  id: string;
  size: string;
  sortOrder: number;
  stockQuantity: number;
  /** `avgCost` ?? `purchaseCost` per piece; null when neither is set. */
  unitCostMdl: number | null;
  /** Retail run-size prices: the variant's `priceTiers`, else `sellPrice` from 1 piece. */
  priceTiers: GarmentPriceTier[];
}

export interface DtfLocalizedNames {
  ro: string;
  ru: string;
  en: string;
}

/**
 * A garment in the DTF editor: one unified stock item in one colour, from a
 * category whose `printMethods` contains "dtf". Its sizes are that colour's
 * active variants.
 */
export interface DtfGarmentJson {
  /** `<stockItemId>:<colorKey>`, see `dtfGarmentId`. */
  id: string;
  stockItemId: string;
  categoryCode: string;
  categoryNames: DtfLocalizedNames;
  itemNames: DtfLocalizedNames;
  kind: GarmentKind;
  /** Item name stored in the line snapshot (default locale, with fallbacks). */
  name: string;
  colorName: string;
  colorHex: string | null;
  /** Public URL of the stock item's photo (optional: older callers and fixtures omit it). */
  imageUrl?: string | null;
  variants: DtfGarmentSizeJson[];
}

export interface DtfPresetJson extends DtfPresetOption {
  isActive: boolean;
  sortOrder: number;
}

/** Everything the order editor needs to build a DTF line. */
export interface DtfCatalogJson {
  garments: DtfGarmentJson[];
  presets: DtfPresetJson[];
  settings: DtfSettings;
  unitCosts: DtfUnitCosts;
}
