import type { SublimationItemSource } from "@/lib/sublimation/sublimationConstants";

export type SublimationCustomerType = "retail" | "dealer";

export const SUBLIMATION_LINE_DATA_VERSION = 1;

/** Stock blank (one `StockVariant`) as it was when the line was priced. */
export interface SublimationItemSnapshot {
  variantId: string;
  itemId: string;
  /** `StockCategory.code` (e.g. `pillows`, `mugs`); picks the usage norm. */
  categoryCode: string;
  /** Item name in the default locale (with fallbacks). */
  name: string;
  names: { ro: string; ru: string; en: string };
  categoryNames: { ro: string; ru: string; en: string };
  sku: string;
  /** Fabric / format / colour of the variant; null for one-variant items. */
  variantLabel: string | null;
  colorHex: string | null;
}

/** Item the client brings (nothing is taken from stock), with the print size. */
export interface SublimationClientItem {
  description: string;
  notes: string | null;
  widthCm: number;
  heightCm: number;
}

/** Epson L1800 use for the whole line (norm × pieces × (1 + waste)). */
export interface SublimationConsumption {
  paperSheets: number;
  tapeM: number;
  /** All six inks together; split over the ink slots by share when written off. */
  inkMl: number;
}

export interface SublimationLinePricing {
  /** Run-size step of the retail price (the step the line quantity falls into); 1 for client items. */
  tierMinQty: number;
  /**
   * «tier» — retail run-size price; «dealer» — the variant's dealer price;
   * «area» — client item priced from the print size.
   */
  priceSource: "tier" | "dealer" | "area";
  /** Per piece, print included. */
  unitPriceMdl: number;
  totalSellPriceMdl: number;
  /** Client items: print area of one piece (m²). */
  areaSqmPerPiece?: number;
  /** Client items: rate per m² applied (retail or dealer). */
  ratePerSqmMdl?: number;
  /** Client items: area × rate before the per-piece minimum. */
  unitByAreaPriceMdl?: number;
  /** Client items: the per-piece minimum raised the price. */
  minimumApplied?: boolean;
  /** Client items: print price per piece (= `unitPriceMdl`). */
  unitPrintPriceMdl?: number;
  /** Client items: set-up fee once per line. */
  setupFeeMdl?: number;
  /** Client items: added to reach the line minimum. */
  minimumLineUpliftMdl?: number;
}

export interface SublimationLineCosts {
  /** `avgCost` ?? `purchaseCost` of the blank per piece (0 while unknown or for client items). */
  unitItemCostMdl: number;
  itemCostMdl: number;
  paperCostMdl: number;
  tapeCostMdl: number;
  inkCostMdl: number;
  totalCostMdl: number;
}

/** Persisted in `OrderLine.sublimationLineData`. */
export interface SublimationLineData {
  version: typeof SUBLIMATION_LINE_DATA_VERSION;
  /** Absent on lines before client items existed = «stock». */
  source?: SublimationItemSource;
  /** Stock blank; null for client items. */
  item: SublimationItemSnapshot | null;
  /** Client items only. */
  clientItem?: SublimationClientItem | null;
  customerType: SublimationCustomerType;
  quantity: number;
  consumption: SublimationConsumption;
  pricing: SublimationLinePricing;
  costs: SublimationLineCosts;
  estimatedProfitMdl: number;
}
