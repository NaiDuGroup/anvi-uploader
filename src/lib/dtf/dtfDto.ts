import type { DtfConsumable, GarmentKind } from "@/lib/dtf/dtfConstants";
import type { DtfPresetOption, DtfUnitCosts } from "@/lib/dtf/dtfLineCalc";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import type { GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";

export interface GarmentVariantJson {
  id: string;
  size: string;
  sortOrder: number;
  stockQuantity: number;
  /** Weighted-average cost per piece, or the product's purchase hint. */
  unitCostMdl: number | null;
}

export interface GarmentProductJson {
  id: string;
  kind: GarmentKind;
  name: string;
  colorName: string;
  colorHex: string | null;
  priceTiers: GarmentPriceTier[];
  purchaseCost: number | null;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  variants: GarmentVariantJson[];
}

export interface DtfPresetJson extends DtfPresetOption {
  isActive: boolean;
  sortOrder: number;
}

export interface DtfConsumableJson {
  id: DtfConsumable;
  stockQuantity: number;
  avgCostPerUnit: number;
}

/** Everything the order editor needs to build a DTF line. */
export interface DtfCatalogJson {
  garments: GarmentProductJson[];
  presets: DtfPresetJson[];
  settings: DtfSettings;
  unitCosts: DtfUnitCosts;
}
