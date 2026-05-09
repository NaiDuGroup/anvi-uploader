/** Stored in `MugStockMovement.kind` */
export const MUG_STOCK_KIND = {
  /** Stock out: sale / order reactivation (negative `delta`) */
  ORDER_SALE: "ORDER_SALE",
  /** Stock back when a mug order is soft-deleted (positive `delta`) */
  ORDER_STOCK_RETURN: "ORDER_STOCK_RETURN",
  /** Incoming goods (positive `delta`) */
  RECEIPT: "RECEIPT",
} as const;

export type MugStockKind = (typeof MUG_STOCK_KIND)[keyof typeof MUG_STOCK_KIND];
