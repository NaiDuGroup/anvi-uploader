/** Stock destinations an incoming invoice line can be posted to. */
export enum StockTargetKind {
  /** Retired: mugs are posted to the unified «Кружки» category (target id = legacy mug id). */
  Mug = "mug",
  /** Retired: notebooks are posted to the unified «Блокноты» category (target id = legacy notebook id). */
  Notebook = "notebook",
  /** Retired: pens are posted to the unified «Ручки» category (target id = legacy pen id). */
  Pen = "pen",
  /**
   * Retired: roll media are posted to the unified «Широкоформатные материалы»
   * category (target id = `LargeFormatMaterial.id`, resolved to its variant).
   */
  LfMaterial = "lf_material",
  /** Retired: posted to the unified «Листовая бумага» category (target id = `SheetPaper.id`). */
  SheetPaper = "sheet_paper",
  /** Retired: ink is posted to the unified «Чернила» category (per colour). */
  Ink = "ink",
  /**
   * One size of a legacy DTF garment (target id = garment variant id).
   * Retired: apparel is posted to unified stock categories; kept so old rows
   * and handlers still work. Not offered in pickers, see {@link RETIRED_STOCK_TARGET_KINDS}.
   */
  Garment = "garment",
  /** Retired: posted to the unified «Плёнка DTF» / «Порошок DTF» categories. */
  DtfFilm = "dtf_film",
  DtfPowder = "dtf_powder",
  /**
   * Variant of a unified stock item (target id = `StockVariant.id`). The unit
   * comes from the item's category, see {@link StockTargetOption.unit}.
   */
  StockVariant = "stock_variant",
  /** Not a stock item (delivery, services, consumables we do not track). */
  Ignore = "ignore",
}

export const STOCK_TARGET_KINDS: readonly StockTargetKind[] = Object.values(StockTargetKind);

export type PostableStockTargetKind = Exclude<StockTargetKind, StockTargetKind.Ignore>;

/** Kinds backed by a per-product legacy ledger; each has a fixed name and unit. */
export type LegacyStockTargetKind = Exclude<StockTargetKind, StockTargetKind.StockVariant>;
export type LegacyPostableStockTargetKind = Exclude<PostableStockTargetKind, StockTargetKind.StockVariant>;

/** Legacy kinds (incl. `ignore`) in picker order; unified categories are listed separately. */
export const LEGACY_STOCK_TARGET_KINDS: readonly LegacyStockTargetKind[] = STOCK_TARGET_KINDS.filter(
  (k): k is LegacyStockTargetKind => k !== StockTargetKind.StockVariant,
);

/**
 * Legacy kinds no longer offered for new postings (their data moved to unified
 * stock). Pens go to «Ручки», notebooks to «Блокноты»; printer consumables are posted to the unified categories «Чернила»,
 * «Тонер», «Плёнка DTF», «Порошок DTF» (one variant per colour / printer slot); roll media and sheet paper
 * to «Широкоформатные материалы» / «Листовая бумага».
 */
export const RETIRED_STOCK_TARGET_KINDS: readonly LegacyStockTargetKind[] = [
  StockTargetKind.Mug,
  StockTargetKind.Notebook,
  StockTargetKind.Pen,
  StockTargetKind.LfMaterial,
  StockTargetKind.SheetPaper,
  StockTargetKind.Garment,
  StockTargetKind.Ink,
  StockTargetKind.DtfFilm,
  StockTargetKind.DtfPowder,
];

export function isRetiredKind(kind: StockTargetKind): boolean {
  return (RETIRED_STOCK_TARGET_KINDS as readonly StockTargetKind[]).includes(kind);
}

export function isLegacyKind(kind: StockTargetKind): kind is LegacyStockTargetKind {
  return kind !== StockTargetKind.StockVariant;
}

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

/** Stock units as labelled on the purchase screens (`t.purchases.stockUnits`). */
export type PurchaseStockUnit = "pcs" | "lm" | "sheets" | "ml" | "g";

/** Our counting unit per legacy stock kind (what `unitsPerInvoiceUnit` converts into). */
export const STOCK_TARGET_UNIT: Record<LegacyPostableStockTargetKind, PurchaseStockUnit> = {
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

/** Unified `StockCategory.unit` (pcs | m | ml | g | sheet) → purchase-screen unit. */
export function purchaseUnitFromStockUnit(unit: string): PurchaseStockUnit {
  switch (unit) {
    case "m":
      return "lm";
    case "sheet":
      return "sheets";
    case "ml":
      return "ml";
    case "g":
      return "g";
    default:
      return "pcs";
  }
}

/** Pieces and sheets are counted whole; length, volume and weight may be fractional. */
export function purchaseUnitAllowsFractions(unit: PurchaseStockUnit): boolean {
  return unit !== "pcs" && unit !== "sheets";
}

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
  // Unified stock keeps 3 decimals; whole-unit categories are validated on posting.
  if (kind === StockTargetKind.StockVariant) return Math.round(raw * 1000) / 1000;
  const unit = STOCK_TARGET_UNIT[kind];
  return unit === "lm" || unit === "ml" || unit === "g" ? Math.round(raw * 100) / 100 : raw;
}

export type LocalizedNames = { ro: string; ru: string; en: string };

/** Unified stock category an option belongs to (the «Склад» choice in the picker). */
export type StockTargetGroup = {
  id: string;
  names: LocalizedNames;
  sortOrder: number;
};

/** Parts of a unified variant label, localized on the client. */
export type UnifiedTargetInfo = {
  group: StockTargetGroup;
  itemNames: LocalizedNames;
  variantLabel: string | null;
  sku: string;
};

/** Item that an invoice line can be mapped to (rendered in the picker). */
export type StockTargetOption = {
  kind: PostableStockTargetKind;
  id: string;
  /** Plain (Romanian) name — used for ranking and as a fallback label. */
  name: string;
  /** Roll width (m) for roll media — used to rank suggestions. */
  widthMeters: number | null;
  /** Counting unit; defaults to {@link STOCK_TARGET_UNIT} for legacy kinds. */
  unit?: PurchaseStockUnit;
  /** Set for `stock_variant` options. */
  unified?: UnifiedTargetInfo;
};

export function pickLocalized(names: LocalizedNames, locale: string): string {
  return locale === "ru" ? names.ru : locale === "en" ? names.en : names.ro;
}

/** «Item name — variant label (SKU)»; the label part is left out for single-variant items. */
export function unifiedVariantLabel(itemName: string, variantLabel: string | null, sku: string): string {
  const label: string = variantLabel?.trim() ?? "";
  return label === "" ? `${itemName} (${sku})` : `${itemName} — ${label} (${sku})`;
}

/** Counting unit of a target: category unit for unified variants, fixed per legacy kind. */
export function targetStockUnit(
  kind: PostableStockTargetKind,
  option: Pick<StockTargetOption, "unit"> | null | undefined,
): PurchaseStockUnit {
  if (option?.unit) return option.unit;
  return kind === StockTargetKind.StockVariant ? "pcs" : STOCK_TARGET_UNIT[kind];
}
