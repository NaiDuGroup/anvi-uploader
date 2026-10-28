import type { UvItemSource, UvPlacement } from "@/lib/uv/uvConstants";
import type { UvErrorCode } from "@/lib/uv/uvErrors";

/** «UV-печать» order line: editor, order views and workshop board. */
export interface UvDictionary {
  productType: string;
  productTypeHint: string;
  placements: Record<UvPlacement, string>;
  sources: Record<UvItemSource, string>;
  errors: Record<UvErrorCode, string>;
  editor: {
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
      placeholder: string;
      search: string;
      all: string;
      empty: string;
      outOfStock: string;
      /** Retail price of the first run-size tier. */
      fromPrice: (price: string) => string;
      printArea: (size: string) => string;
      noPrintArea: string;
    };
    breakdown: {
      title: string;
      /** «0,25 м² × 400/м²». */
      byArea: (sqm: string, rate: string) => string;
      /** Area price was below the zone minimum. */
      zoneMinimum: (byArea: string) => string;
      extraWhite: (layers: number, pct: string) => string;
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
    section: string;
    clientItem: string;
    white: (layers: number) => string;
    varnish: string;
    primer: string;
  };
}
