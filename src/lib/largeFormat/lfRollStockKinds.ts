/** Stored in `LfRollStockMovement.kind` */
export const LF_ROLL_STOCK_KIND = {
  ORDER_SALE: "ORDER_SALE",
  ORDER_RETURN: "ORDER_RETURN",
  PROCUREMENT_BACKLOG: "PROCUREMENT_BACKLOG",
} as const;

export type LfRollStockKind =
  (typeof LF_ROLL_STOCK_KIND)[keyof typeof LF_ROLL_STOCK_KIND];
