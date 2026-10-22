/** Stock destinations an incoming invoice line can be posted to. */
export enum StockTargetKind {
  Mug = "mug",
  Notebook = "notebook",
  Pen = "pen",
  LfMaterial = "lf_material",
  SheetPaper = "sheet_paper",
  Ink = "ink",
  /** Not a stock item (delivery, services, consumables we do not track). */
  Ignore = "ignore",
}

export const STOCK_TARGET_KINDS: readonly StockTargetKind[] = Object.values(StockTargetKind);

export type PostableStockTargetKind = Exclude<StockTargetKind, StockTargetKind.Ignore>;

export function isPostableKind(kind: StockTargetKind): kind is PostableStockTargetKind {
  return kind !== StockTargetKind.Ignore;
}

export function isStockTargetKind(value: string): value is StockTargetKind {
  return (STOCK_TARGET_KINDS as readonly string[]).includes(value);
}

export enum PurchaseInvoiceStatus {
  New = "new",
  NeedsReview = "needs_review",
  PartiallyPosted = "partially_posted",
  Posted = "posted",
  Ignored = "ignored",
}

export enum PurchaseLineStatus {
  Unmatched = "unmatched",
  Suggested = "suggested",
  Posted = "posted",
  Ignored = "ignored",
}

/** A mapping confirmed by hand this many times posts future lines automatically. */
export const AUTO_POST_CONFIRMATIONS = 2;

/** Our counting unit per stock kind (what `unitsPerInvoiceUnit` converts into). */
export const STOCK_TARGET_UNIT: Record<PostableStockTargetKind, "pcs" | "lm" | "sheets" | "ml"> = {
  [StockTargetKind.Mug]: "pcs",
  [StockTargetKind.Notebook]: "pcs",
  [StockTargetKind.Pen]: "pcs",
  [StockTargetKind.LfMaterial]: "lm",
  [StockTargetKind.SheetPaper]: "sheets",
  [StockTargetKind.Ink]: "ml",
};

/** Item that an invoice line can be mapped to (rendered in the picker). */
export type StockTargetOption = {
  kind: PostableStockTargetKind;
  id: string;
  name: string;
  /** Roll width (m) for roll media — used to rank suggestions. */
  widthMeters: number | null;
};
