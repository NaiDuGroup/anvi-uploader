import type { UvItemSource, UvPlacement, UvTechnique } from "@/lib/uv/uvConstants";
import type { UvErrorCode } from "@/lib/uv/uvErrors";

/** «UV-печать» order line: editor, order views and workshop board. */
export interface UvDictionary {
  productType: string;
  productTypeHint: string;
  placements: Record<UvPlacement, string>;
  sources: Record<UvItemSource, string>;
  errors: Record<UvErrorCode, string>;
  editor: {
    technique: string;
    techniques: Record<UvTechnique, string>;
    stickersHint: string;
    byMeter: string;
    /** UV-DTF: white layers in the film price and the surcharge for each further layer. */
    dtfWhiteHint: (included: number, pct: number) => string;
    source: string;
    item: string;
    noItems: string;
    quantity: string;
    description: string;
    descriptionPlaceholder: string;
    notes: string;
    notesPlaceholder: string;
    inStock: (count: number) => string;
    shortage: (count: number) => string;
    zones: string;
    addZone: string;
    removeZone: string;
    placement: string;
    placementLabel: string;
    widthCm: string;
    heightCm: string;
    whiteLayers: string;
    whiteLayerOption: (layers: number) => string;
    varnish: string;
    primer: string;
    includedInItem: string;
    /** Main zone of a stock item: size from its «Параметры печати». */
    sizeFromItem: string;
    /** Centimetre unit after a size («см» / «cm»). */
    cm: string;
    /** Price of one extra / client zone per piece. */
    zonePrice: (price: string) => string;
    priceNotSet: string;
    priceNotSetLink: string;
    tier: (minQty: number) => string;
    dealerPrice: string;
    itemTotal: string;
    printTotal: string;
    whiteTotal: string;
    varnishTotal: string;
    primerTotal: string;
    setupFee: string;
    minimumUplift: string;
    total: string;
    itemCost: string;
    itemCostMissing: string;
    inkMl: string;
    primerMl: string;
    primerCost: string;
    inkCost: string;
    directCost: string;
    margin: string;
    grossProfit: string;
    pieces: (count: number) => string;
    /** Client item: price is shown before the description, but the order is not saved without it. */
    descriptionNeeded: string;
    picker: {
      title: string;
      close: string;
      /** Trigger link «Изменить». */
      change: string;
      clientHint: string;
      placeholder: string;
      search: string;
      all: string;
      empty: string;
      outOfStock: string;
      /** Cheapest run-size step under the card price («от 50 шт. — 110 MDL»). */
      bulkPrice: (qty: number, price: string) => string;
      printArea: (size: string) => string;
      noPrintArea: string;
      /** Under a garment price that already holds a print («с логотипом до 5×9 см»). */
      includedPrint: (size: string) => string;
    };
    breakdown: {
      directCostStickers: string;
      filmSell: (meters: string) => string;
      filmSellHint: (meters: string, rate: string) => string;
      filmCost: string;
      title: string;
      /** «0,25 м² × 400/м²». */
      byArea: (sqm: string, rate: string) => string;
      /** Area price was below the zone minimum. */
      zoneMinimum: (byArea: string) => string;
      extraWhite: (layers: number, pct: string) => string;
      /** UV-DTF: extra white layers above the ones in the film price. */
      dtfExtraWhite: (layers: string, included: number, pct: string) => string;
      pctOfPrint: (pct: string) => string;
      itemPrice: string;
      perPiece: string;
      timesQty: (count: number) => string;
      setupFeeHint: string;
      minimumHint: (min: string) => string;
      costsTitle: string;
      clientItemCost: string;
      inkCmyk: string;
      inkWhite: string;
      inkVarnish: string;
      ml: (ml: string) => string;
      directCostClient: string;
      directCostClientHint: string;
    };
  };
  /** «Нормы UV-печати» on the pen / notebook catalog cards. */
  norms: {
    title: string;
    hint: string;
  };
  workshop: {
    downloadPng: string;
    vectorPdfBlocked: (count: number) => string;
    filmLayout: string;
    filmLayoutTitle: string;
    stickers: string;
    transfer: (meters: string) => string;
    section: string;
    clientItem: string;
    white: (layers: number) => string;
    varnish: string;
    primer: string;
  };
}
