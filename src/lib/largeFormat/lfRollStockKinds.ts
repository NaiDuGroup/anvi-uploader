/** Stored in `LfRollStockMovement.kind` */
export const LF_ROLL_STOCK_KIND = {
  ORDER_SALE: "ORDER_SALE",
  ORDER_RETURN: "ORDER_RETURN",
  PROCUREMENT_BACKLOG: "PROCUREMENT_BACKLOG",
  /** Workshop printed a layout on this roll instead of the ordered one (−lm). */
  LAYOUT_TRANSFER_OUT: "LAYOUT_TRANSFER_OUT",
  /** Counterpart of LAYOUT_TRANSFER_OUT: lm returned to the previously charged roll (+lm). */
  LAYOUT_TRANSFER_BACK: "LAYOUT_TRANSFER_BACK",
} as const;

export type LfRollStockKind =
  (typeof LF_ROLL_STOCK_KIND)[keyof typeof LF_ROLL_STOCK_KIND];
