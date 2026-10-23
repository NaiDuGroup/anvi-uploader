import type {
  DtfGarmentSource,
  DtfPlacement,
  GarmentKind,
} from "@/lib/dtf/dtfConstants";

export type DtfCustomerType = "retail" | "dealer";

export const DTF_LINE_DATA_VERSION = 1;

/** Garment as it was when the order was priced. */
export interface DtfGarmentSnapshot {
  garmentProductId: string;
  kind: GarmentKind;
  name: string;
  colorName: string;
  colorHex: string | null;
}

export interface DtfLineSize {
  /** Null when the client brings the garment. */
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
  /** Price list rate for this transfer size. */
  unitListPriceMdl: number;
  /** Part of the list rate already covered by the garment price (first zone only). */
  unitIncludedCreditMdl: number;
  /** Charged per piece: list rate minus the included credit. */
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
