/** Stored in `NotebookStockMovement.kind` */
export const NOTEBOOK_STOCK_KIND = {
  /** Stock out: sale / order reactivation (negative `delta`) */
  ORDER_SALE: "ORDER_SALE",
  /** Stock back when a notebook order is soft-deleted (positive `delta`) */
  ORDER_STOCK_RETURN: "ORDER_STOCK_RETURN",
  /** Incoming goods (positive `delta`) */
  RECEIPT: "RECEIPT",
} as const;

export type NotebookStockKind =
  (typeof NOTEBOOK_STOCK_KIND)[keyof typeof NOTEBOOK_STOCK_KIND];
