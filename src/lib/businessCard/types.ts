/**
 * Persisted JSON on `OrderLine.business_card_line_data`, shared by every sheet
 * product (business cards and flyers): "card" means one imposed piece.
 */

import type { BusinessCardSides } from "./businessCardConstants";
import type { SheetProductPresetId } from "@/lib/sheetProduct/sheetProductConfig";
import type { StickerSheetLineInfo } from "@/lib/stickerSheet/stickerSheet";
import type { PostcardLineInfo } from "@/lib/postcard/postcard";

export type BusinessCardCustomerType = "retail" | "dealer";

/** Subset of the sheet paper catalog frozen at order time. */
export interface SheetPaperSnapshot {
  id: string;
  name: string;
  /** Paper weight (g/m²); absent on snapshots taken before it was tracked. */
  gsm?: number | null;
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
  presetId?: SheetProductPresetId;
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
  /** `shop_pack`: a storefront pack priced per card (run = the pack, not whole sheets). */
  pricingSource?: "shop_pack";
  /**
   * Sell price per card (MDL), sides included: storefront packs, and retail
   * business cards from any channel (`businessCardPerCardRateMdl`). Absent = per sheet side.
   */
  pricePerCardMdl?: number;
  /**
   * How each face is scaled onto the card in the imposition: `cover` crops to
   * fill, `contain` fits inside with white margins. Absent (studio lines and
   * older shop lines) = stretched to the card (`fill`), as before.
   */
  artworkFit?: "cover" | "contain";
  /**
   * Storefront print shop («Tipografie», `src/lib/storefront/printShop`): the
   * product (flyers, invitations, calendars…), its format and finishing —
   * `finishingRu` is the staff label («Приглашения · ламинация мат»).
   */
  shopPrint?: {
    product: string;
    format: string;
    lamination?: "gloss" | "matte";
    finishingRu: string;
  };
  /**
   * Storefront business cards: finishing beyond the print (price list page 11).
   */
  shopFinishing?: {
    lamination?: "gloss" | "matte";
    roundedCorners?: boolean;
  };
  /**
   * Sticker sheets (`sticker_sheet`): shape, cut, format and the A3+ paper
   * written off. `quantity` = stickers, `sheetsUsed` = printed sheets of `format`.
   */
  stickerSheet?: StickerSheetLineInfo;
  /**
   * «Открытки и карточки» (`postcard`): purpose, sheet format (A4+ / A3+),
   * whole-sheet mode, finishing, the A4+ paper written off and the price breakdown.
   * `sheetsUsed` = printed sheets of `postcard.format`.
   */
  postcard?: PostcardLineInfo;
  /**
   * Staff «ручная цена» (`manualSheetLinePrice.ts`): the line total typed in the
   * wizard. When set, `totalSellPriceMdl` equals it and the calculated total is
   * kept in `computedTotalSellPriceMdl`.
   */
  manualTotalSellPriceMdl?: number;
  computedTotalSellPriceMdl?: number;
  /** Production setting: min line sell (MDL) when the uplift was applied. */
  minimumLineTotalSettingMdl?: number;
  /** Added to the computed total to reach `minimumLineTotalSettingMdl`. */
  minimumLineUpliftMdl?: number;
}

export const BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION = 1;
