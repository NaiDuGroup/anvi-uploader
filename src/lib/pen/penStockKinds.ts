/** Stored in `PenStockMovement.kind` */
export const PEN_STOCK_KIND = {
  /** Stock out: sale / order reactivation (negative `delta`) */
  ORDER_SALE: "ORDER_SALE",
  /** Stock back when a pen order is soft-deleted (positive `delta`) */
  ORDER_STOCK_RETURN: "ORDER_STOCK_RETURN",
  /** Incoming goods (positive `delta`) */
  RECEIPT: "RECEIPT",
  /** Manual stock count adjustment (positive or negative `delta`) */
  INVENTORY_ADJUSTMENT: "INVENTORY_ADJUSTMENT",
} as const;

export type PenStockKind = (typeof PEN_STOCK_KIND)[keyof typeof PEN_STOCK_KIND];
