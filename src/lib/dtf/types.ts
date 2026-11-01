import type {
  DtfGarmentSource,
  DtfPlacement,
  GarmentKind,
} from "@/lib/dtf/dtfConstants";

export type DtfCustomerType = "retail" | "dealer";

export const DTF_LINE_DATA_VERSION = 1;

/** Garment as it was when the order was priced. */
export interface DtfGarmentSnapshot {
  /**
   * Picker id of the garment. Unified stock: `<stockItemId>:<colorKey>` (see
   * `dtfGarmentId`); lines priced before the unified stock hold a legacy
   * `GarmentProduct.id`.
   */
  garmentProductId: string;
  /** Unified stock item (absent on legacy lines). */
  stockItemId?: string;
  /** `StockCategory.code` of the item (absent on legacy lines). */
  categoryCode?: string;
  kind: GarmentKind;
  name: string;
  colorName: string;
  colorHex: string | null;
}

export interface DtfLineSize {
  /**
   * `StockVariant.id` of this colour + size (legacy lines: `GarmentVariant.id`).
   * Null when the client brings the garment.
   */
  garmentVariantId: string | null;
  size: string;
  quantity: number;
  unitSellPriceMdl: number;
  unitCostMdl: number;
}

export interface DtfLineZone {
  /** Stable per line; artwork files reference it via `File.paperType`. */
  id: string;
  placement: DtfPlacement;
  /** Price list entry used for the price (for custom sizes: the class it fell into). */
  presetId: string;
  presetLabel: string;
  /** True when the operator typed the size instead of picking the preset. */
  customSize: boolean;
  widthCm: number;
  heightCm: number;
  /**
   * Format price before the run-size discount (dealer: the dealer price).
   * Absent on lines priced before 2026-11.
   */
  unitFormatPriceMdl?: number;
  /** Retail run-size discount applied to the format price (%). */
  runDiscountPct?: number;
  /** Dealer takes the transfer unpressed (priced at the format's no-press price). */
  noPress?: boolean;
  /** Price per transfer after the run-size discount / dealer price. */
  unitListPriceMdl: number;
  /** Price of the print already in the item price (first zone; A4 on T-shirts, a logo on caps / socks). */
  unitIncludedCreditMdl: number;
  /** Charged per piece: list rate minus the included print; negative for a smaller print than included. */
  unitPrintPriceMdl: number;
  unitPressFeeMdl: number;
}

export interface DtfConsumption {
  filmLinearMeters: number;
  inkMl: number;
  powderGrams: number;
}

export interface DtfLineCosts {
  garmentCostMdl: number;
  filmCostMdl: number;
  inkCostMdl: number;
  powderCostMdl: number;
  totalCostMdl: number;
}

export interface DtfLinePricing {
  /** Run-size step applied to the garment price (null for client garments). */
  tierMinQty: number | null;
  garmentSellTotalMdl: number;
  printSellTotalMdl: number;
  pressSellTotalMdl: number;
  minimumLineUpliftMdl: number;
  totalSellPriceMdl: number;
}

/** Persisted in `OrderLine.dtfLineData`. */
export interface DtfLineData {
  version: typeof DTF_LINE_DATA_VERSION;
  garmentSource: DtfGarmentSource;
  /** Null for client-supplied garments. */
  garment: DtfGarmentSnapshot | null;
  customerType: DtfCustomerType;
  sizes: DtfLineSize[];
  /** Total pieces across sizes. */
  quantity: number;
  zones: DtfLineZone[];
  filmPrintableWidthCm: number;
  filmGapCm: number;
  consumption: DtfConsumption;
  pricing: DtfLinePricing;
  costs: DtfLineCosts;
  estimatedProfitMdl: number;
}
