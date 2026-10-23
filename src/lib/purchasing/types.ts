/** Stock destinations an incoming invoice line can be posted to. */
export enum StockTargetKind {
  Mug = "mug",
  Notebook = "notebook",
  Pen = "pen",
  LfMaterial = "lf_material",
  SheetPaper = "sheet_paper",
  Ink = "ink",
  /** One size of a DTF garment (target id = garment variant id). */
  Garment = "garment",
  DtfFilm = "dtf_film",
  DtfPowder = "dtf_powder",
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
export const STOCK_TARGET_UNIT: Record<PostableStockTargetKind, "pcs" | "lm" | "sheets" | "ml" | "g"> = {
  [StockTargetKind.Mug]: "pcs",
  [StockTargetKind.Notebook]: "pcs",
  [StockTargetKind.Pen]: "pcs",
  [StockTargetKind.LfMaterial]: "lm",
  [StockTargetKind.SheetPaper]: "sheets",
  [StockTargetKind.Ink]: "ml",
  [StockTargetKind.Garment]: "pcs",
  [StockTargetKind.DtfFilm]: "lm",
  [StockTargetKind.DtfPowder]: "g",
};

/**
 * Invoice quantity converted into our stock unit. Metres and millilitres are
 * rounded to 0.01 because factors are stored with 4 decimals (1/1.05 m per m²
 * would otherwise turn a 52.5 m² roll into 50.001 m).
 */
export function stockQuantityFromInvoice(
  kind: PostableStockTargetKind,
  invoiceQuantity: number,
  unitsPerInvoiceUnit: number,
): number {
  const raw: number = invoiceQuantity * unitsPerInvoiceUnit;
  const unit = STOCK_TARGET_UNIT[kind];
  return unit === "lm" || unit === "ml" || unit === "g" ? Math.round(raw * 100) / 100 : raw;
}

/** Item that an invoice line can be mapped to (rendered in the picker). */
export type StockTargetOption = {
  kind: PostableStockTargetKind;
  id: string;
  name: string;
  /** Roll width (m) for roll media — used to rank suggestions. */
  widthMeters: number | null;
};
