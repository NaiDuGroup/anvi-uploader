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
  };
  workshop: {
    section: string;
    noFiles: string;
  };
}
