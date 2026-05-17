/** Stored in `InkStockMovement.kind` */
export const INK_STOCK_KIND = {
  ORDER_SALE: "ORDER_SALE",
  ORDER_RETURN: "ORDER_RETURN",
  PROCUREMENT_BACKLOG: "PROCUREMENT_BACKLOG",
} as const;

export type InkStockKind =
  (typeof INK_STOCK_KIND)[keyof typeof INK_STOCK_KIND];
