/** Stored in `SheetPaperStockMovement.kind` */
export const SHEET_PAPER_STOCK_KIND = {
  ORDER_SALE: "ORDER_SALE",
  ORDER_RETURN: "ORDER_RETURN",
  PROCUREMENT_BACKLOG: "PROCUREMENT_BACKLOG",
  RECEIPT: "RECEIPT",
  MANUAL_ADJUST: "MANUAL_ADJUST",
} as const;

export type SheetPaperStockKind =
  (typeof SHEET_PAPER_STOCK_KIND)[keyof typeof SHEET_PAPER_STOCK_KIND];
