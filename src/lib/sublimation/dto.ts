import type { SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import type { SublimationConsumableCosts } from "@/lib/sublimation/sublimationLineCalc";
import type { UvStockItemJson } from "@/lib/uv/dto";

/**
 * A blank in the sublimation editor: one active `StockVariant` of a category
 * whose `printMethods` contains "sublimation" (mugs, pillows, puzzles, …).
 * Same shape as a UV stock item plus the dealer price.
 */
export interface SublimationStockItemJson extends UvStockItemJson {
  /** `StockVariant.dealerPrice` per piece; null = dealers pay the retail tier price. */
  dealerPriceMdl: number | null;
}

/** Everything the order editor needs to price a sublimation line. */
export interface SublimationCatalogJson {
  items: SublimationStockItemJson[];
  settings: SublimationSettings;
  consumableCosts: SublimationConsumableCosts;
}
