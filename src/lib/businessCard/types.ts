/** Persisted JSON on `OrderLine.business_card_line_data`. */

import type {
  BusinessCardPresetId,
  BusinessCardSides,
} from "./businessCardConstants";

export type BusinessCardCustomerType = "retail" | "dealer";

/** Subset of the sheet paper catalog frozen at order time. */
export interface SheetPaperSnapshot {
  id: string;
  name: string;
  sheetWidthCm: number;
  sheetHeightCm: number;
  costPerSheet: number;
  retailPricePerSheet: number;
  dealerPricePerSheet: number;
}

/** Frozen imposition geometry, so the workshop PDF is reproducible later. */
export interface BusinessCardLayoutPersisted {
  algorithmVersion: number;
  columns: number;
  rows: number;
  cardsPerSheet: number;
  rotated: boolean;
  gapCm: number;
  marginXCm: number;
  marginYCm: number;
  slotWidthCm: number;
  slotHeightCm: number;
}

export interface BusinessCardLineData {
  paperSnapshot: SheetPaperSnapshot;
  /**
   * Card footprint on the sheet (trim + bleed on every side). Orders placed
   * before trim sizes existed carry only this pair, which is why it stays the
   * authoritative geometry field.
   */
  cardWidthCm: number;
  cardHeightCm: number;
  /** Which standard the customer picked; `"custom"` for a free-form size. */
  presetId?: BusinessCardPresetId;
  /** Finished size after cutting — what the customer actually receives. */
  cardTrimWidthCm?: number;
  cardTrimHeightCm?: number;
  /** Bleed per side used to grow trim into the sheet footprint (cm). */
  bleedCm?: number;
  sides: BusinessCardSides;
  /** Total cards ordered (the run), not sheets. */
  quantity: number;
  cardsPerSheet: number;
  sheetsUsed: number;
  customerType: BusinessCardCustomerType;
  layout: BusinessCardLayoutPersisted;
  /** Sell rate per printed sheet side used for this line (MDL). */
  pricePerSheetMdl: number;
  totalSellPriceMdl: number;
  /** Paper COGS: sheets × weighted-average purchase cost at order time. */
  paperCostMdl: number;
  /** Weighted-average cost per sheet frozen at order time (MDL). */
  avgPaperCostPerSheetSnapshot: number;
  estimatedProfitMdl: number;
  /** Production setting: min line sell (MDL) when the uplift was applied. */
  minimumLineTotalSettingMdl?: number;
  /** Added to the computed total to reach `minimumLineTotalSettingMdl`. */
  minimumLineUpliftMdl?: number;
}

export const BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION = 1;
