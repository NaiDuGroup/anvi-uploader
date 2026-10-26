import type { UvItemSource, UvPlacement } from "@/lib/uv/uvConstants";

export type UvCustomerType = "retail" | "dealer";

export const UV_LINE_DATA_VERSION = 1;

/** Stock item (one `StockVariant`) as it was when the line was priced. */
export interface UvItemSnapshot {
  variantId: string;
  itemId: string;
  /** `StockCategory.code` (e.g. `pens`, `notebooks`). */
  categoryCode: string;
  /** Item name in the default locale (with fallbacks). */
  name: string;
  names: { ro: string; ru: string; en: string };
  categoryNames: { ro: string; ru: string; en: string };
  sku: string;
  /** Colour / size label of the variant; null for one-variant items. */
  variantLabel: string | null;
  colorHex: string | null;
}

/** Item the client brings; nothing is taken from stock. */
export interface UvClientItem {
  description: string;
  notes: string | null;
}

export interface UvLineZone {
  /** Stable per line; artwork files reference it via `File.paperType` (`uv:<id>`). */
  id: string;
  placement: UvPlacement;
  /** Free-text place on the item (required for «other», optional otherwise). */
  placementLabel: string | null;
  /** Price list entry used for the price (for custom sizes: the class it fell into). */
  presetId: string;
  presetLabel: string;
  /** True when the operator typed the size instead of picking the preset. */
  customSize: boolean;
  widthCm: number;
  heightCm: number;
  /** White underbase layers (0–3). */
  whiteLayers: number;
  varnish: boolean;
  /** Format price (retail or dealer) per piece. */
  unitListPriceMdl: number;
  /** Part of the format price already covered by the stock item price (first zone only). */
  unitIncludedCreditMdl: number;
  /** Charged per piece for the print: format price minus the included credit. */
  unitPrintPriceMdl: number;
  /** White surcharge per piece: format price × % × layers. */
  unitWhiteSurchargeMdl: number;
  /** Varnish surcharge per piece: format price × %. */
  unitVarnishSurchargeMdl: number;
}

export interface UvConsumption {
  /** Printed area of one piece (all zones), m². */
  areaSqmPerPiece: number;
  cmykMl: number;
  whiteMl: number;
  varnishMl: number;
}

export interface UvLineCosts {
  /** `avgCost` ?? `purchaseCost` of the stock variant per piece (0 for client items or unknown). */
  unitItemCostMdl: number;
  itemCostMdl: number;
  cmykInkCostMdl: number;
  whiteInkCostMdl: number;
  varnishCostMdl: number;
  totalCostMdl: number;
}

export interface UvLinePricing {
  /** Run-size step applied to the item price (null for client items). */
  tierMinQty: number | null;
  unitItemPriceMdl: number;
  itemSellTotalMdl: number;
  printSellTotalMdl: number;
  whiteSurchargeTotalMdl: number;
  varnishSurchargeTotalMdl: number;
  /** Client items: set-up fee once per line. */
  setupFeeMdl: number;
  minimumLineUpliftMdl: number;
  totalSellPriceMdl: number;
}

/** Persisted in `OrderLine.uvLineData`. */
export interface UvLineData {
  version: typeof UV_LINE_DATA_VERSION;
  source: UvItemSource;
  /** Stock items only. */
  item: UvItemSnapshot | null;
  /** Client items only. */
  clientItem: UvClientItem | null;
  customerType: UvCustomerType;
  quantity: number;
  zones: UvLineZone[];
  consumption: UvConsumption;
  pricing: UvLinePricing;
  costs: UvLineCosts;
  estimatedProfitMdl: number;
}
