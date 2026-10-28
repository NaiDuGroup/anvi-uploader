import type { SublimationErrorCode } from "@/lib/sublimation/sublimationErrors";

/** «Сублимация» order line: editor, order views and workshop board. */
export interface SublimationDictionary {
  productType: string;
  productTypeHint: string;
  errors: Record<SublimationErrorCode, string>;
  editor: {
    item: string;
    noItems: string;
    quantity: string;
    inStock: (count: number) => string;
    shortage: (count: number) => string;
    tier: (minQty: number) => string;
    dealerPrice: string;
    unitPrice: string;
    total: string;
    cost: string;
    profit: string;
    usage: (paperSheets: string, tapeM: string, inkMl: string) => string;
    noNorms: string;
    normsLink: string;
    pieces: (count: number) => string;
    /** Client's item (source «client»). */
    description: string;
    descriptionPlaceholder: string;
    descriptionNeeded: string;
    notes: string;
    notesPlaceholder: string;
    widthCm: string;
    heightCm: string;
    priceNotSet: string;
    priceNotSetLink: string;
    breakdown: {
      title: string;
      byArea: (sqm: string, rate: string) => string;
      minimum: (byArea: string) => string;
      perPiece: string;
      timesQty: (count: number) => string;
      setupFee: string;
      setupFeeHint: string;
      minimumUplift: string;
      minimumHint: (min: string) => string;
      costsTitle: string;
      blank: string;
      blankCostMissing: string;
      clientItemCost: string;
      paper: (sheets: string) => string;
      tape: (m: string) => string;
      ink: (ml: string) => string;
      directCost: string;
      directCostClient: string;
      directCostClientHint: string;
      margin: string;
      grossProfit: string;
    };
  };
  workshop: {
    section: string;
    noFiles: string;
    clientItem: string;
  };
}
