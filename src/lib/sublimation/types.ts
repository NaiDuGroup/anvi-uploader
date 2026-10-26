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

/** Epson L1800 use for the whole line (norm × pieces × (1 + waste)). */
export interface SublimationConsumption {
  paperSheets: number;
  tapeM: number;
  /** All six inks together; split over the ink slots by share when written off. */
  inkMl: number;
}

export interface SublimationLinePricing {
  /** Run-size step of the retail price (the step the line quantity falls into). */
  tierMinQty: number;
  /** «tier» — retail run-size price; «dealer» — the variant's dealer price. */
  priceSource: "tier" | "dealer";
  /** Per piece, print included. */
  unitPriceMdl: number;
  totalSellPriceMdl: number;
}

export interface SublimationLineCosts {
  /** `avgCost` ?? `purchaseCost` of the blank per piece (0 while unknown). */
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
  item: SublimationItemSnapshot;
  customerType: SublimationCustomerType;
  quantity: number;
  consumption: SublimationConsumption;
  pricing: SublimationLinePricing;
  costs: SublimationLineCosts;
  estimatedProfitMdl: number;
}
