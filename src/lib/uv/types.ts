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
  /**
   * Legacy lines (priced by a format price list before 2026-10-28): the format
   * the zone fell into. Absent on lines priced from the print parameters.
   */
  presetId?: string | null;
  presetLabel?: string | null;
  /**
   * True when the operator typed the size; false when it came from the stock
   * item's print parameters (`StockItem.attributes.printWidthCm/HeightCm`).
   */
  customSize: boolean;
  widthCm: number;
  heightCm: number;
  /** White underbase layers (0–5). */
  whiteLayers: number;
  varnish: boolean;
  /** Primed by hand before printing. Absent on lines before 2026-10-28 = false. */
  primer?: boolean;
  /**
   * Main zone of a stock item: its print is part of the item price, so the
   * zone adds nothing to the line (ink still counts in the cost). Absent on
   * legacy lines = false.
   */
  includedInItem?: boolean;
  /** Print price per piece before surcharges: area × rate per m², at least the zone minimum (0 when included). */
  unitListPriceMdl: number;
  /** Legacy lines only: part of the format price covered by the stock item price. */
  unitIncludedCreditMdl?: number;
  /** Charged per piece for the print (0 when included in the item). */
  unitPrintPriceMdl: number;
  /** White surcharge per piece: print price × % × layers above the first. */
  unitWhiteSurchargeMdl: number;
  /** Varnish surcharge per piece: print price × %. */
  unitVarnishSurchargeMdl: number;
  /** Primer surcharge per piece: print price × % (0 / absent when not primed). */
  unitPrimerSurchargeMdl?: number;
}

export interface UvConsumption {
  /** Printed area of one piece (all zones), m². */
  areaSqmPerPiece: number;
  cmykMl: number;
  whiteMl: number;
  varnishMl: number;
  /** Primer taken from stock (`UV_PRIMER_SKU`); absent on older lines. */
  primerMl?: number;
}

export interface UvLineCosts {
  /** `avgCost` ?? `purchaseCost` of the stock variant per piece (0 for client items or unknown). */
  unitItemCostMdl: number;
  itemCostMdl: number;
  cmykInkCostMdl: number;
  whiteInkCostMdl: number;
  varnishCostMdl: number;
  primerCostMdl?: number;
  totalCostMdl: number;
}

export interface UvLinePricing {
  /** Run-size step applied to the item price (null for client items). */
  tierMinQty: number | null;
  /** Stock items: «tier» = retail run-size price, «dealer» = the variant's dealer price. Absent on legacy lines. */
  itemPriceSource?: "tier" | "dealer" | null;
  unitItemPriceMdl: number;
  itemSellTotalMdl: number;
  printSellTotalMdl: number;
  whiteSurchargeTotalMdl: number;
  varnishSurchargeTotalMdl: number;
  primerSurchargeTotalMdl?: number;
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
