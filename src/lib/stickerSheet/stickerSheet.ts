/**
 * «Наклейки на листе» (sticker sheets): self-adhesive paper (Fedrigoni 45×64,
 * cut in half → A3+ 32×45 cm) printed on the Ricoh and contour-cut on the
 * Purcell ZD350. The operator lays the sheet out and adds the registration
 * marks in Camera Cut, so the app only counts how many stickers fit, how many
 * sheets that takes, and prices / costs the run.
 *
 * Owner's decisions, 2026-11-07 (all numbers in {@link STICKER_SHEET_DEFAULTS},
 * overridable through `AccountingSettings.productionCosts.stickerSheet`):
 *  - retail per A3+ sheet with contour cut, VAT included, tier by the line's
 *    sheet count: 1–9 → 50, 10–29 → 40, 30–99 → 31, 100–299 → 25, 300+ → 18;
 *  - print only (no cut) = × 0.6;
 *  - dealer: 24 per A3+ with cut, flat (no tiers), no cut × 0.6;
 *  - A4 sheet = half the A3+ price. The tier is picked by A3+ equivalents
 *    (A4 sheets ÷ 2), so 20 A4 sheets are billed like 10 A3+ (tier 10–29);
 *  - line totals in whole lei.
 *
 * Paper: one printed A3+ sheet takes one A3+ sticker sheet, an A4 takes half.
 */

import { computeBusinessCardSheetLayout, type BusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import {
  BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION,
  type BusinessCardCustomerType,
  type BusinessCardLineData,
  type SheetPaperSnapshot,
} from "@/lib/businessCard/types";

export const STICKER_SHEET_PRODUCT_TYPE = "sticker_sheet" as const;

export const STICKER_SHAPES = ["circle", "rect", "rounded", "contour"] as const;
export type StickerShape = (typeof STICKER_SHAPES)[number];

export const STICKER_SHEET_FORMATS = ["A3+", "A4"] as const;
export type StickerSheetFormat = (typeof STICKER_SHEET_FORMATS)[number];

export const STICKER_QUANTITY_MODES = ["pieces", "sheets"] as const;
export type StickerQuantityMode = (typeof STICKER_QUANTITY_MODES)[number];

/** Printed sheet sizes (portrait, cm) and the share of one A3+ sticker sheet each takes. */
export const STICKER_SHEET_FORMAT_SPECS: Record<
  StickerSheetFormat,
  { widthCm: number; heightCm: number; paperShare: number }
> = {
  "A3+": { widthCm: 32, heightCm: 45, paperShare: 1 },
  // Same A4+ the Ricoh papers use (22.5 × 32): half an A3+ sticker sheet.
  A4: { widthCm: 22.5, heightCm: 32, paperShare: 0.5 },
};

/** Sticker side bounds (mm). */
export const STICKER_MIN_SIDE_MM = 10;
export const STICKER_MAX_SIDE_MM = 420;
/** Pieces cap per line (300 A3+ sheets of 1 cm stickers is far above it). */
export const STICKER_MAX_QUANTITY = 100_000;

export interface StickerPriceTier {
  /** Lowest sheet count (A3+ equivalents) this rate applies from. */
  minSheets: number;
  /** MDL per A3+ sheet with contour cut, VAT included. */
  pricePerSheetMdl: number;
}

export interface StickerSheetSettings {
  /** Blank edge on every side for the cutter's camera marks (mm). */
  marginMm: number;
  /** Gap between neighbouring stickers (mm). */
  gapMm: number;
  retailTiers: readonly StickerPriceTier[];
  /** Dealer, per A3+ sheet with cut (flat). */
  dealerPricePerSheetMdl: number;
  /** Print only, no contour cut: multiplier on the cut price. */
  noCutFactor: number;
  /** A4 sheet: multiplier on the A3+ price of the same tier. */
  a4Factor: number;
}

export const STICKER_SHEET_DEFAULTS: StickerSheetSettings = {
  marginMm: 12,
  gapMm: 3,
  retailTiers: [
    { minSheets: 1, pricePerSheetMdl: 50 },
    { minSheets: 10, pricePerSheetMdl: 40 },
    { minSheets: 30, pricePerSheetMdl: 31 },
    { minSheets: 100, pricePerSheetMdl: 25 },
    { minSheets: 300, pricePerSheetMdl: 18 },
  ],
  dealerPricePerSheetMdl: 24,
  noCutFactor: 0.6,
  a4Factor: 0.5,
};

function num(v: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

/** Settings from `productionCosts.stickerSheet` (any missing / bad field → default). */
export function parseStickerSheetSettings(raw: unknown): StickerSheetSettings {
  const d = STICKER_SHEET_DEFAULTS;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const tiers = Array.isArray(o.retailTiers)
    ? o.retailTiers
        .map((t) => {
          const r = (t ?? {}) as Record<string, unknown>;
          return {
            minSheets: num(r.minSheets, Number.NaN, 1),
            pricePerSheetMdl: num(r.pricePerSheetMdl, Number.NaN, 0),
          };
        })
        .filter((t) => Number.isFinite(t.minSheets) && Number.isFinite(t.pricePerSheetMdl))
        .sort((a, b) => a.minSheets - b.minSheets)
    : [];
  return {
    marginMm: num(o.marginMm, d.marginMm, 0, 50),
    gapMm: num(o.gapMm, d.gapMm, 0, 50),
    retailTiers: tiers.length > 0 && tiers[0]!.minSheets === 1 ? tiers : d.retailTiers,
    dealerPricePerSheetMdl: num(o.dealerPricePerSheetMdl, d.dealerPricePerSheetMdl, 0),
    noCutFactor: num(o.noCutFactor, d.noCutFactor, 0, 1),
    a4Factor: num(o.a4Factor, d.a4Factor, 0, 1),
  };
}

/** Sticker paper rows of the sheet paper catalog (by name: «самоклейка», «autoadeziv», «sticker»…). */
export function isStickerSheetPaper(paper: { name: string }): boolean {
  return /самокле|наклей|autoadeziv|adeziv|sticker/i.test(paper.name);
}

/** Sticker footprint (mm): a circle is its diameter both ways. */
export function stickerFootprintMm(
  shape: StickerShape,
  widthMm: number,
  heightMm: number,
): { widthMm: number; heightMm: number } {
  return shape === "circle" ? { widthMm, heightMm: widthMm } : { widthMm, heightMm };
}

/**
 * Grid of identical stickers on one sheet: the usable area (sheet minus the
 * camera-mark margin) packed with the gap, both orientations tried. Placements
 * are in full-sheet coordinates.
 */
export function computeStickerSheetLayout(input: {
  format: StickerSheetFormat;
  widthMm: number;
  heightMm: number;
  marginMm: number;
  gapMm: number;
}): BusinessCardSheetLayout {
  const spec = STICKER_SHEET_FORMAT_SPECS[input.format];
  const marginCm = Math.max(0, input.marginMm) / 10;
  const usable = computeBusinessCardSheetLayout({
    sheetWidthCm: spec.widthCm - 2 * marginCm,
    sheetHeightCm: spec.heightCm - 2 * marginCm,
    cardWidthCm: input.widthMm / 10,
    cardHeightCm: input.heightMm / 10,
    gapCm: Math.max(0, input.gapMm) / 10,
  });
  return {
    ...usable,
    sheetWidthCm: spec.widthCm,
    sheetHeightCm: spec.heightCm,
    marginXCm: usable.marginXCm + marginCm,
    marginYCm: usable.marginYCm + marginCm,
    placements: usable.placements.map((p) => ({ ...p, xCm: p.xCm + marginCm, yCm: p.yCm + marginCm })),
  };
}

/** Sheets for a run in pieces (whole sheets, rounded up). */
export function stickerSheetsForQuantity(quantity: number, perSheet: number): number {
  if (!(quantity > 0) || !(perSheet > 0)) return 0;
  return Math.ceil(quantity / perSheet);
}

export interface StickerSheetPricing {
  /** Sell rate per printed sheet of the chosen format (MDL, may have bani). */
  pricePerSheetMdl: number;
  /** Whole lei. */
  totalSellPriceMdl: number;
  /** Retail tier the run fell into (min A3+ sheets); null for dealers. */
  tierMinSheets: number | null;
}

/** A3+ equivalents of a run: A4 sheets count as half. */
export function stickerA3Equivalent(sheets: number, format: StickerSheetFormat): number {
  return sheets * STICKER_SHEET_FORMAT_SPECS[format].paperShare;
}

export function computeStickerSheetPricing(input: {
  sheets: number;
  format: StickerSheetFormat;
  cut: boolean;
  customerType: BusinessCardCustomerType;
  settings?: StickerSheetSettings;
}): StickerSheetPricing {
  const s = input.settings ?? STICKER_SHEET_DEFAULTS;
  const sheets = Math.max(0, Math.ceil(input.sheets));
  let base: number;
  let tierMinSheets: number | null = null;
  if (input.customerType === "dealer") {
    base = s.dealerPricePerSheetMdl;
  } else {
    const equivalent = stickerA3Equivalent(sheets, input.format);
    const tier =
      [...s.retailTiers].reverse().find((t) => equivalent >= t.minSheets) ?? s.retailTiers[0]!;
    base = tier.pricePerSheetMdl;
    tierMinSheets = tier.minSheets;
  }
  const rate =
    base * (input.cut ? 1 : s.noCutFactor) * (input.format === "A4" ? s.a4Factor : 1);
  const pricePerSheetMdl = Math.round(rate * 100) / 100;
  return {
    pricePerSheetMdl,
    totalSellPriceMdl: Math.round(sheets * rate),
    tierMinSheets,
  };
}

/** Frozen on `BusinessCardLineData.stickerSheet`. */
export interface StickerSheetLineInfo {
  shape: StickerShape;
  /** Contour cut on the Purcell; false = print only. */
  cut: boolean;
  format: StickerSheetFormat;
  /** Sticker size (mm); a circle stores its diameter in both. */
  widthMm: number;
  heightMm: number;
  /** How staff typed the run; the stored `quantity` is always pieces. */
  quantityMode: StickerQuantityMode;
  marginMm: number;
  gapMm: number;
  /** A3+ sticker sheets written off (A4 = 0.5 each). */
  paperSheetsUsed: number;
  tierMinSheets: number | null;
}

export const STICKER_SHAPE_LABEL_RU: Record<StickerShape, string> = {
  circle: "круг",
  rect: "прямоугольник",
  rounded: "скруглённые углы",
  contour: "по контуру",
};

function mm(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** «A3+ · круг Ø65 · с резкой» for the workshop and order views. */
export function stickerSheetSummaryRu(info: StickerSheetLineInfo): string {
  const size =
    info.shape === "circle" ? `Ø${mm(info.widthMm)}` : `${mm(info.widthMm)}×${mm(info.heightMm)} мм`;
  return [
    info.format,
    `${STICKER_SHAPE_LABEL_RU[info.shape]} ${size}`,
    info.cut ? "с резкой" : "без резки",
  ].join(" · ");
}

/** Paper (A3+ sticker sheets) a stored line consumes; other sheet lines: their sheets. */
export function sheetLinePaperSheets(data: {
  sheetsUsed: number;
  stickerSheet?: { paperSheetsUsed?: number } | null;
}): number {
  const p = data.stickerSheet?.paperSheetsUsed;
  return typeof p === "number" && Number.isFinite(p) && p >= 0 ? p : data.sheetsUsed;
}

export type StickerSheetBuildError =
  | "sticker_size_invalid"
  | "sticker_does_not_fit_sheet"
  | "bc_quantity_invalid"
  | "bc_quantity_max";

export interface StickerSheetBuildInput {
  paperSnapshot: SheetPaperSnapshot;
  /** Weighted-average cost per A3+ sticker sheet; null → catalog hint. */
  avgPaperCostPerSheet: number | null;
  shape: StickerShape;
  widthMm: number;
  heightMm: number;
  cut: boolean;
  format: StickerSheetFormat;
  quantityMode: StickerQuantityMode;
  /** Stickers (pieces). In «sheets» mode the caller sends sheets × per sheet. */
  quantity: number;
  customerType: BusinessCardCustomerType;
  settings?: StickerSheetSettings;
}

/**
 * The persisted sheet-line snapshot of a sticker run (same shape as business
 * cards / flyers plus `stickerSheet`), shared by the server resolver and the
 * wizard so the shown price is the stored one.
 */
export function buildStickerSheetLineData(
  input: StickerSheetBuildInput,
): { ok: true; data: BusinessCardLineData } | { ok: false; code: StickerSheetBuildError } {
  const settings = input.settings ?? STICKER_SHEET_DEFAULTS;
  const fp = stickerFootprintMm(input.shape, input.widthMm, input.heightMm);
  const inRange = (v: number) => Number.isFinite(v) && v >= STICKER_MIN_SIDE_MM && v <= STICKER_MAX_SIDE_MM;
  if (!inRange(fp.widthMm) || !inRange(fp.heightMm)) return { ok: false, code: "sticker_size_invalid" };
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { ok: false, code: "bc_quantity_invalid" };
  if (input.quantity > STICKER_MAX_QUANTITY) return { ok: false, code: "bc_quantity_max" };

  const layout = computeStickerSheetLayout({
    format: input.format,
    widthMm: fp.widthMm,
    heightMm: fp.heightMm,
    marginMm: settings.marginMm,
    gapMm: settings.gapMm,
  });
  if (layout.cardsPerSheet === 0) return { ok: false, code: "sticker_does_not_fit_sheet" };

  const sheetsUsed = stickerSheetsForQuantity(input.quantity, layout.cardsPerSheet);
  const pricing = computeStickerSheetPricing({
    sheets: sheetsUsed,
    format: input.format,
    cut: input.cut,
    customerType: input.customerType,
    settings,
  });
  const paperSheetsUsed = stickerA3Equivalent(sheetsUsed, input.format);
  const avg = input.avgPaperCostPerSheet;
  const costPerSheet =
    typeof avg === "number" && Number.isFinite(avg) && avg > 0 ? avg : Math.max(0, input.paperSnapshot.costPerSheet);
  const paperCostMdl = Math.round(paperSheetsUsed * costPerSheet * 100) / 100;

  const data: BusinessCardLineData = {
    paperSnapshot: input.paperSnapshot,
    cardWidthCm: fp.widthMm / 10,
    cardHeightCm: fp.heightMm / 10,
    presetId: "custom",
    cardTrimWidthCm: fp.widthMm / 10,
    cardTrimHeightCm: fp.heightMm / 10,
    bleedCm: 0,
    sides: "one",
    quantity: input.quantity,
    cardsPerSheet: layout.cardsPerSheet,
    sheetsUsed,
    customerType: input.customerType,
    layout: {
      algorithmVersion: BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION,
      columns: layout.columns,
      rows: layout.rows,
      cardsPerSheet: layout.cardsPerSheet,
      rotated: layout.rotated,
      gapCm: layout.gapCm,
      marginXCm: layout.marginXCm,
      marginYCm: layout.marginYCm,
      slotWidthCm: layout.slotWidthCm,
      slotHeightCm: layout.slotHeightCm,
    },
    pricePerSheetMdl: pricing.pricePerSheetMdl,
    totalSellPriceMdl: pricing.totalSellPriceMdl,
    paperCostMdl,
    avgPaperCostPerSheetSnapshot: costPerSheet,
    estimatedProfitMdl: Math.round((pricing.totalSellPriceMdl - paperCostMdl) * 100) / 100,
    stickerSheet: {
      shape: input.shape,
      cut: input.cut,
      format: input.format,
      widthMm: fp.widthMm,
      heightMm: fp.heightMm,
      quantityMode: input.quantityMode,
      marginMm: settings.marginMm,
      gapMm: settings.gapMm,
      paperSheetsUsed,
      tierMinSheets: pricing.tierMinSheets,
    },
  };
  return { ok: true, data };
}

/** What the small sheet preview draws (sheet to scale, camera marks, sticker grid). */
export interface StickerSheetPreviewData {
  shape: StickerShape;
  format: StickerSheetFormat;
  cut: boolean;
  sheetWidthCm: number;
  sheetHeightCm: number;
  marginMm: number;
  columns: number;
  rows: number;
  slotWidthCm: number;
  slotHeightCm: number;
  gapCm: number;
  marginXCm: number;
  marginYCm: number;
}

/** Preview data from a stored sticker line (null for other sheet lines). */
export function stickerPreviewFromLineData(data: BusinessCardLineData): StickerSheetPreviewData | null {
  const st = data.stickerSheet;
  if (!st) return null;
  const spec = STICKER_SHEET_FORMAT_SPECS[st.format] ?? STICKER_SHEET_FORMAT_SPECS["A3+"];
  return {
    shape: st.shape,
    format: st.format,
    cut: st.cut,
    sheetWidthCm: spec.widthCm,
    sheetHeightCm: spec.heightCm,
    marginMm: st.marginMm,
    columns: data.layout.columns,
    rows: data.layout.rows,
    slotWidthCm: data.layout.slotWidthCm,
    slotHeightCm: data.layout.slotHeightCm,
    gapCm: data.layout.gapCm,
    marginXCm: data.layout.marginXCm,
    marginYCm: data.layout.marginYCm,
  };
}
