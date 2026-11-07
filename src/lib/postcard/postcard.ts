/**
 * «Открытки и карточки» (`postcard`): postcards, invitations, diplomas,
 * certificates, vouchers, cards, bookmarks… on the A4+ sheet papers
 * (`sheet_papers`, 105–350 g), printed on the Ricoh, imposed in a grid with a
 * 2 mm bleed and cut on the guillotine (or contour-cut on the Purcell).
 *
 * Owner's decisions, 2026-11-07 (all numbers in {@link POSTCARD_DEFAULTS},
 * overridable through `AccountingSettings.productionCosts.postcard`):
 *  - sheet A4+ 22.5 × 32 (the paper as stocked) or A3+ 32 × 45 for A3 items and
 *    whole A3 sheets; an A3+ sheet writes off 2 A4+ of the same paper and is
 *    priced as 2 A4+ passes; toner — 2 clicks per A3+ side;
 *  - print, per A4+ pass (sheet × side), retail: the paper's catalogue rate
 *    (`retail_price_per_sheet`: 105–150 g → 10, 200–300 g → 12, 350 g → 14)
 *    minus a step by the line's total A4+ passes: 1–49 → −0, 50–199 → −2,
 *    200+ → −3 (300 g: 12 / 10 / 9; 150 g: 10 / 8 / 7; 350 g: 14 / 12 / 11);
 *    dealer: the paper's `dealer_price_per_sheet` per pass, flat;
 *  - lamination per A4+ sheet, always both sides: gloss 15 / matt 25 (dealer 10 / 16);
 *  - creasing 1 lei per line per piece (dealer 0.7), at least 20 lei per line;
 *  - rounded corners 0.5 per piece (dealer 0.35);
 *  - figured cut on the Purcell +10 per A4+ sheet (dealer 5), with 12 mm
 *    camera-mark margins and a 3 mm gap (as sticker sheets);
 *  - line minimum 30 lei retail / 20 dealer when the studio cuts; «лист
 *    целиком» (the client cuts) — no cutting, no minimum;
 *  - whole-lei line totals.
 */

import { computeBusinessCardSheetLayout, sheetsForQuantity, type BusinessCardSheetLayout } from "@/lib/businessCard/businessCardSheetLayout";
import {
  BUSINESS_CARD_LAYOUT_ALGORITHM_VERSION,
  type BusinessCardCustomerType,
  type BusinessCardLineData,
  type SheetPaperSnapshot,
} from "@/lib/businessCard/types";
import type { BusinessCardSides } from "@/lib/businessCard/businessCardConstants";
import type { StickerSheetPreviewData } from "@/lib/stickerSheet/stickerSheet";

export const POSTCARD_PRODUCT_TYPE = "postcard" as const;

/** Bleed per side (cm), as flyers: artwork at the finished size gets it generated. */
export const POSTCARD_BLEED_CM = 0.2;
export const POSTCARD_MIN_SIDE_CM = 3;
/** A3 (29.7 × 42) is the largest finished size; it goes on an A3+ sheet. */
export const POSTCARD_MAX_SIDE_CM = 42;
export const POSTCARD_MAX_QUANTITY = 20000;
export const POSTCARD_SHEET_PRESETS = [1, 5, 10, 25, 50, 100] as const;

/**
 * Finished sizes (cm, after cutting). The id is frozen on the order line, so
 * never reuse one for a different size. A folded A5 is printed and cut as its
 * A4 spread, folded on a crease line.
 */
export const POSTCARD_PRESETS = [
  { id: "pc_a6", name: "A6", trimWidthCm: 10.5, trimHeightCm: 14.8 },
  { id: "pc_10x15", trimWidthCm: 10, trimHeightCm: 15 },
  { id: "pc_a5", name: "A5", trimWidthCm: 14.8, trimHeightCm: 21 },
  { id: "pc_dl", name: "DL", trimWidthCm: 9.9, trimHeightCm: 21 },
  { id: "pc_a4", name: "A4", trimWidthCm: 21, trimHeightCm: 29.7 },
  { id: "pc_a3", name: "A3", trimWidthCm: 29.7, trimHeightCm: 42 },
  { id: "pc_75x10", trimWidthCm: 7.5, trimHeightCm: 10 },
  { id: "pc_13x18", trimWidthCm: 13, trimHeightCm: 18 },
  { id: "pc_12x12", trimWidthCm: 12, trimHeightCm: 12 },
  { id: "pc_14x14", trimWidthCm: 14, trimHeightCm: 14 },
  { id: "pc_bookmark", name: "Закладка", trimWidthCm: 5, trimHeightCm: 15 },
  { id: "pc_folded_a5", name: "A5 сложенная (разворот A4)", trimWidthCm: 21, trimHeightCm: 29.7 },
] as const;

export type PostcardPreset = (typeof POSTCARD_PRESETS)[number];
export type PostcardPresetId = PostcardPreset["id"] | "custom";
export const POSTCARD_PRESET_IDS = [...POSTCARD_PRESETS.map((p) => p.id), "custom"] as const;
export const POSTCARD_DEFAULT_PRESET_ID: PostcardPresetId = "pc_a6";
/** The folded preset: picking it sets one crease line. */
export const POSTCARD_FOLDED_PRESET_ID = "pc_folded_a5" as const;

export const POSTCARD_PURPOSES = [
  "postcard",
  "invitation",
  "diploma",
  "certificate",
  "voucher",
  "card",
  "bookmark",
  "other",
] as const;
export type PostcardPurpose = (typeof POSTCARD_PURPOSES)[number];

/** The size a purpose starts with (only a default — the size stays free). */
export const POSTCARD_PURPOSE_DEFAULT_PRESET: Record<PostcardPurpose, PostcardPresetId | null> = {
  postcard: "pc_a6",
  invitation: "pc_a5",
  diploma: "pc_a4",
  certificate: "pc_a4",
  voucher: "pc_dl",
  card: "pc_75x10",
  bookmark: "pc_bookmark",
  other: null,
};

export const POSTCARD_PURPOSE_LABEL_RU: Record<PostcardPurpose, string> = {
  postcard: "Открытка",
  invitation: "Приглашение",
  diploma: "Диплом",
  certificate: "Сертификат",
  voucher: "Ваучер",
  card: "Карточка",
  bookmark: "Закладка",
  other: "Другое",
};

export const POSTCARD_SHEET_FORMATS = ["A4+", "A3+"] as const;
export type PostcardSheetFormat = (typeof POSTCARD_SHEET_FORMATS)[number];

/** Printed sheet (portrait, cm) and how many A4+ sheets of the paper it writes off. */
export const POSTCARD_SHEET_FORMAT_SPECS: Record<
  PostcardSheetFormat,
  { widthCm: number; heightCm: number; a4Equivalent: 1 | 2 }
> = {
  "A4+": { widthCm: 22.5, heightCm: 32, a4Equivalent: 1 },
  "A3+": { widthCm: 32, heightCm: 45, a4Equivalent: 2 },
};

export const POSTCARD_LAMINATIONS = ["none", "gloss", "matte"] as const;
export type PostcardLamination = (typeof POSTCARD_LAMINATIONS)[number];
export const POSTCARD_MAX_CREASE_LINES = 3;

export interface PostcardTierStep {
  /** Lowest A4+ pass count (sheets × sides) of the line this step applies from. */
  minPasses: number;
  /** Lei off the paper's retail rate per pass. */
  discountMdl: number;
}

export interface PostcardSettings {
  retailTierSteps: readonly PostcardTierStep[];
  /** Lamination per A4+ sheet, both sides. */
  laminationRetail: { gloss: number; matte: number };
  laminationDealer: { gloss: number; matte: number };
  creasePerLineRetailMdl: number;
  creasePerLineDealerMdl: number;
  /** Minimum creasing charge per order line when creasing is on. */
  creaseMinimumMdl: number;
  roundedCornersRetailMdl: number;
  roundedCornersDealerMdl: number;
  /** Figured cut on the Purcell, per A4+ sheet. */
  figuredCutRetailMdl: number;
  figuredCutDealerMdl: number;
  /** Line minimum when the studio cuts (not for whole sheets). */
  minimumLineRetailMdl: number;
  minimumLineDealerMdl: number;
  /** Figured cut: camera-mark margin and gap (mm). */
  figuredCutMarginMm: number;
  figuredCutGapMm: number;
}

export const POSTCARD_DEFAULTS: PostcardSettings = {
  retailTierSteps: [
    { minPasses: 1, discountMdl: 0 },
    { minPasses: 50, discountMdl: 2 },
    { minPasses: 200, discountMdl: 3 },
  ],
  laminationRetail: { gloss: 15, matte: 25 },
  laminationDealer: { gloss: 10, matte: 16 },
  creasePerLineRetailMdl: 1,
  creasePerLineDealerMdl: 0.7,
  creaseMinimumMdl: 20,
  roundedCornersRetailMdl: 0.5,
  roundedCornersDealerMdl: 0.35,
  figuredCutRetailMdl: 10,
  figuredCutDealerMdl: 5,
  minimumLineRetailMdl: 30,
  minimumLineDealerMdl: 20,
  figuredCutMarginMm: 12,
  figuredCutGapMm: 3,
};

function num(v: unknown, fallback: number, min = 0, max = Number.POSITIVE_INFINITY): number {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : fallback;
}

function pair(v: unknown, d: { gloss: number; matte: number }): { gloss: number; matte: number } {
  const o = v != null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  return { gloss: num(o.gloss, d.gloss), matte: num(o.matte, d.matte) };
}

/** Settings from `productionCosts.postcard` (any missing / bad field → default). */
export function parsePostcardSettings(raw: unknown): PostcardSettings {
  const d = POSTCARD_DEFAULTS;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return d;
  const o = raw as Record<string, unknown>;
  const steps = Array.isArray(o.retailTierSteps)
    ? o.retailTierSteps
        .map((t) => {
          const r = (t ?? {}) as Record<string, unknown>;
          return { minPasses: num(r.minPasses, Number.NaN, 1), discountMdl: num(r.discountMdl, Number.NaN, 0) };
        })
        .filter((t) => Number.isFinite(t.minPasses) && Number.isFinite(t.discountMdl))
        .sort((a, b) => a.minPasses - b.minPasses)
    : [];
  return {
    retailTierSteps: steps.length > 0 && steps[0]!.minPasses === 1 ? steps : d.retailTierSteps,
    laminationRetail: pair(o.laminationRetail, d.laminationRetail),
    laminationDealer: pair(o.laminationDealer, d.laminationDealer),
    creasePerLineRetailMdl: num(o.creasePerLineRetailMdl, d.creasePerLineRetailMdl),
    creasePerLineDealerMdl: num(o.creasePerLineDealerMdl, d.creasePerLineDealerMdl),
    creaseMinimumMdl: num(o.creaseMinimumMdl, d.creaseMinimumMdl),
    roundedCornersRetailMdl: num(o.roundedCornersRetailMdl, d.roundedCornersRetailMdl),
    roundedCornersDealerMdl: num(o.roundedCornersDealerMdl, d.roundedCornersDealerMdl),
    figuredCutRetailMdl: num(o.figuredCutRetailMdl, d.figuredCutRetailMdl),
    figuredCutDealerMdl: num(o.figuredCutDealerMdl, d.figuredCutDealerMdl),
    minimumLineRetailMdl: num(o.minimumLineRetailMdl, d.minimumLineRetailMdl),
    minimumLineDealerMdl: num(o.minimumLineDealerMdl, d.minimumLineDealerMdl),
    figuredCutMarginMm: num(o.figuredCutMarginMm, d.figuredCutMarginMm, 0, 50),
    figuredCutGapMm: num(o.figuredCutGapMm, d.figuredCutGapMm, 0, 50),
  };
}

/** What changes the price / imposition beyond paper, size, sides and run. */
export interface PostcardOptions {
  purpose: PostcardPurpose;
  /** Requested sheet; an item that does not fit A4+ goes on A3+. */
  format: PostcardSheetFormat;
  /** «Лист целиком (сами порежем)»: the piece is the whole sheet, quantity in sheets. */
  wholeSheet: boolean;
  lamination: PostcardLamination;
  creaseLines: number;
  roundedCorners: boolean;
  figuredCut: boolean;
}

/** Whole sheets carry no cutting work: rounded corners and figured cut are dropped. */
export function normalizePostcardOptions(o: PostcardOptions): PostcardOptions {
  const creaseLines = Math.max(0, Math.min(POSTCARD_MAX_CREASE_LINES, Math.round(o.creaseLines || 0)));
  return o.wholeSheet
    ? { ...o, creaseLines, roundedCorners: false, figuredCut: false }
    : { ...o, creaseLines };
}

/**
 * Grid of one postcard size on a sheet: trim + 2 mm bleed, shared cut lines
 * (gap 0) centred on the sheet; figured cut keeps the camera-mark margin and a
 * gap. A whole sheet is one piece the size of the sheet.
 */
export function computePostcardLayout(input: {
  format: PostcardSheetFormat;
  trimWidthCm: number;
  trimHeightCm: number;
  wholeSheet: boolean;
  figuredCut: boolean;
  settings?: PostcardSettings;
}): BusinessCardSheetLayout {
  const s = input.settings ?? POSTCARD_DEFAULTS;
  const spec = POSTCARD_SHEET_FORMAT_SPECS[input.format];
  if (input.wholeSheet) {
    return computeBusinessCardSheetLayout({
      sheetWidthCm: spec.widthCm,
      sheetHeightCm: spec.heightCm,
      cardWidthCm: spec.widthCm,
      cardHeightCm: spec.heightCm,
    });
  }
  const grow = (cm: number): number => Math.round((cm + 2 * POSTCARD_BLEED_CM) * 1000) / 1000;
  const cardWidthCm = grow(input.trimWidthCm);
  const cardHeightCm = grow(input.trimHeightCm);
  if (!input.figuredCut) {
    return computeBusinessCardSheetLayout({ sheetWidthCm: spec.widthCm, sheetHeightCm: spec.heightCm, cardWidthCm, cardHeightCm });
  }
  const marginCm = s.figuredCutMarginMm / 10;
  const usable = computeBusinessCardSheetLayout({
    sheetWidthCm: spec.widthCm - 2 * marginCm,
    sheetHeightCm: spec.heightCm - 2 * marginCm,
    cardWidthCm,
    cardHeightCm,
    gapCm: s.figuredCutGapMm / 10,
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

/**
 * The sheet the line is printed on: the requested one, or A3+ when the item
 * does not fit A4+ (an A3 diploma). A whole sheet is exactly the chosen one.
 */
export function resolvePostcardLayout(input: Parameters<typeof computePostcardLayout>[0]): {
  format: PostcardSheetFormat;
  layout: BusinessCardSheetLayout;
} {
  const layout = computePostcardLayout(input);
  if (layout.cardsPerSheet > 0 || input.wholeSheet || input.format === "A3+") {
    return { format: input.format, layout };
  }
  return { format: "A3+", layout: computePostcardLayout({ ...input, format: "A3+" }) };
}

export interface PostcardPricingBreakdown {
  printMdl: number;
  laminationMdl: number;
  creaseMdl: number;
  cornersMdl: number;
  figuredCutMdl: number;
  /** Lifted to the line minimum. */
  minimumUpliftMdl: number;
}

export interface PostcardPricing {
  /** A4+ sheets (A3+ = 2) — what the paper stock and per-sheet finishing count. */
  a4Sheets: number;
  /** A4+ passes: a4Sheets × sides. */
  passes: number;
  /** Print rate per A4+ pass (MDL). */
  printRatePerPassMdl: number;
  /** Retail step the line fell into (min passes); null for dealers. */
  tierMinPasses: number | null;
  breakdown: PostcardPricingBreakdown;
  /** Whole lei. */
  totalSellPriceMdl: number;
}

export function computePostcardPricing(input: {
  paper: Pick<SheetPaperSnapshot, "retailPricePerSheet" | "dealerPricePerSheet">;
  /** Printed sheets of `format`. */
  sheets: number;
  format: PostcardSheetFormat;
  sides: BusinessCardSides;
  quantity: number;
  options: PostcardOptions;
  customerType: BusinessCardCustomerType;
  settings?: PostcardSettings;
}): PostcardPricing {
  const s = input.settings ?? POSTCARD_DEFAULTS;
  const o = normalizePostcardOptions(input.options);
  const dealer = input.customerType === "dealer";
  const a4Sheets = Math.max(0, Math.ceil(input.sheets)) * POSTCARD_SHEET_FORMAT_SPECS[input.format].a4Equivalent;
  const passes = a4Sheets * (input.sides === "two" ? 2 : 1);
  const qty = Math.max(0, input.quantity);

  let rate: number;
  let tierMinPasses: number | null = null;
  if (dealer) {
    rate = Math.max(0, input.paper.dealerPricePerSheet);
  } else {
    const step = [...s.retailTierSteps].reverse().find((t) => passes >= t.minPasses) ?? s.retailTierSteps[0]!;
    const base = Math.max(0, input.paper.retailPricePerSheet);
    // A paper without a retail rate stays unpriced (0), never negative.
    rate = base > 0 ? Math.max(0, base - step.discountMdl) : 0;
    tierMinPasses = step.minPasses;
  }

  const lam = dealer ? s.laminationDealer : s.laminationRetail;
  const printMdl = passes * rate;
  const laminationMdl = o.lamination === "none" ? 0 : a4Sheets * lam[o.lamination];
  const creaseRaw = qty * o.creaseLines * (dealer ? s.creasePerLineDealerMdl : s.creasePerLineRetailMdl);
  const creaseMdl = o.creaseLines > 0 ? Math.max(creaseRaw, s.creaseMinimumMdl) : 0;
  const cornersMdl = o.roundedCorners ? qty * (dealer ? s.roundedCornersDealerMdl : s.roundedCornersRetailMdl) : 0;
  const figuredCutMdl = o.figuredCut ? a4Sheets * (dealer ? s.figuredCutDealerMdl : s.figuredCutRetailMdl) : 0;
  const sum = Math.round(printMdl + laminationMdl + creaseMdl + cornersMdl + figuredCutMdl);
  // Unpriced paper (rate 0): no minimum either — a minimum alone is no price.
  const minimum = o.wholeSheet || !(rate > 0) ? 0 : dealer ? s.minimumLineDealerMdl : s.minimumLineRetailMdl;
  const total = Math.max(sum, Math.round(minimum));
  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    a4Sheets,
    passes,
    printRatePerPassMdl: r2(rate),
    tierMinPasses,
    breakdown: {
      printMdl: r2(printMdl),
      laminationMdl: r2(laminationMdl),
      creaseMdl: r2(creaseMdl),
      cornersMdl: r2(cornersMdl),
      figuredCutMdl: r2(figuredCutMdl),
      minimumUpliftMdl: total - sum,
    },
    totalSellPriceMdl: total,
  };
}

/** Frozen on `BusinessCardLineData.postcard`. */
export interface PostcardLineInfo extends PostcardOptions {
  /** Printed sheet size of `format` (cm): the workshop layout uses it, not the paper's A4+. */
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Mark margin / gap (mm) of a figured-cut grid; 0 for the guillotine grid. */
  marginMm: number;
  gapMm: number;
  /** A4+ sheets of the paper written off (A3+ = 2). */
  paperSheetsUsed: number;
  passes: number;
  printRatePerPassMdl: number;
  tierMinPasses: number | null;
  breakdown: PostcardPricingBreakdown;
}

export type PostcardBuildError =
  | "bc_size_invalid"
  | "bc_card_does_not_fit_sheet"
  | "bc_quantity_invalid"
  | "bc_quantity_max";

export interface PostcardBuildInput {
  paperSnapshot: SheetPaperSnapshot;
  /** Weighted-average cost per A4+ sheet; null → catalogue hint. */
  avgPaperCostPerSheet: number | null;
  presetId: PostcardPresetId;
  trimWidthCm: number;
  trimHeightCm: number;
  sides: BusinessCardSides;
  /** Pieces; whole sheets: sheets. */
  quantity: number;
  options: PostcardOptions;
  customerType: BusinessCardCustomerType;
  settings?: PostcardSettings;
}

/**
 * The persisted sheet-line snapshot of a postcard run (the business card /
 * flyer shape plus `postcard`), shared by the server resolver and the wizard
 * so the shown price is the stored one.
 */
export function buildPostcardLineData(
  input: PostcardBuildInput,
): { ok: true; data: BusinessCardLineData } | { ok: false; code: PostcardBuildError } {
  const settings = input.settings ?? POSTCARD_DEFAULTS;
  const options = normalizePostcardOptions(input.options);
  const inRange = (v: number) => Number.isFinite(v) && v >= POSTCARD_MIN_SIDE_CM && v <= POSTCARD_MAX_SIDE_CM;
  if (!options.wholeSheet && (!inRange(input.trimWidthCm) || !inRange(input.trimHeightCm))) {
    return { ok: false, code: "bc_size_invalid" };
  }
  if (!Number.isInteger(input.quantity) || input.quantity < 1) return { ok: false, code: "bc_quantity_invalid" };
  if (input.quantity > POSTCARD_MAX_QUANTITY) return { ok: false, code: "bc_quantity_max" };

  const { format, layout } = resolvePostcardLayout({
    format: options.format,
    trimWidthCm: input.trimWidthCm,
    trimHeightCm: input.trimHeightCm,
    wholeSheet: options.wholeSheet,
    figuredCut: options.figuredCut,
    settings,
  });
  if (layout.cardsPerSheet === 0) return { ok: false, code: "bc_card_does_not_fit_sheet" };

  const spec = POSTCARD_SHEET_FORMAT_SPECS[format];
  const sheetsUsed = sheetsForQuantity(input.quantity, layout.cardsPerSheet);
  const pricing = computePostcardPricing({
    paper: input.paperSnapshot,
    sheets: sheetsUsed,
    format,
    sides: input.sides,
    quantity: input.quantity,
    options: { ...options, format },
    customerType: input.customerType,
    settings,
  });
  const avg = input.avgPaperCostPerSheet;
  const costPerSheet =
    typeof avg === "number" && Number.isFinite(avg) && avg > 0 ? avg : Math.max(0, input.paperSnapshot.costPerSheet);
  const paperCostMdl = Math.round(pricing.a4Sheets * costPerSheet * 100) / 100;
  const trimW = options.wholeSheet ? spec.widthCm : input.trimWidthCm;
  const trimH = options.wholeSheet ? spec.heightCm : input.trimHeightCm;
  const bleedCm = options.wholeSheet ? 0 : POSTCARD_BLEED_CM;
  const r2 = (n: number) => Math.round(n * 100) / 100;

  const data: BusinessCardLineData = {
    paperSnapshot: input.paperSnapshot,
    cardWidthCm: Math.round((trimW + 2 * bleedCm) * 1000) / 1000,
    cardHeightCm: Math.round((trimH + 2 * bleedCm) * 1000) / 1000,
    presetId: options.wholeSheet ? "custom" : input.presetId,
    cardTrimWidthCm: trimW,
    cardTrimHeightCm: trimH,
    bleedCm,
    sides: input.sides,
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
    // Average per printed sheet of `format`, all finishing included (informational).
    pricePerSheetMdl: sheetsUsed > 0 ? r2(pricing.totalSellPriceMdl / sheetsUsed) : 0,
    pricePerCardMdl: r2(pricing.totalSellPriceMdl / input.quantity),
    totalSellPriceMdl: pricing.totalSellPriceMdl,
    paperCostMdl,
    avgPaperCostPerSheetSnapshot: costPerSheet,
    estimatedProfitMdl: r2(pricing.totalSellPriceMdl - paperCostMdl),
    postcard: {
      ...options,
      format,
      sheetWidthCm: spec.widthCm,
      sheetHeightCm: spec.heightCm,
      marginMm: options.figuredCut ? settings.figuredCutMarginMm : 0,
      gapMm: options.figuredCut ? settings.figuredCutGapMm : 0,
      paperSheetsUsed: pricing.a4Sheets,
      passes: pricing.passes,
      printRatePerPassMdl: pricing.printRatePerPassMdl,
      tierMinPasses: pricing.tierMinPasses,
      breakdown: pricing.breakdown,
    },
  };
  return { ok: true, data };
}

function cmLabel(v: number): string {
  return String(Math.round(v * 10) / 10).replace(".", ",");
}

/** «Приглашение · A5 сложенная 21×29,7 · A3+» for lists and the workshop card. */
export function postcardSummaryRu(data: Pick<BusinessCardLineData, "postcard" | "presetId" | "cardTrimWidthCm" | "cardTrimHeightCm">): string {
  const pc = data.postcard;
  if (!pc) return "";
  const preset = POSTCARD_PRESETS.find((p) => p.id === data.presetId);
  const size = pc.wholeSheet
    ? `лист ${pc.format} целиком`
    : `${preset && "name" in preset ? `${preset.name} ` : ""}${cmLabel(data.cardTrimWidthCm ?? 0)}×${cmLabel(data.cardTrimHeightCm ?? 0)} см`;
  return [POSTCARD_PURPOSE_LABEL_RU[pc.purpose] ?? pc.purpose, size, pc.wholeSheet ? null : pc.format].filter(Boolean).join(" · ");
}

/** Finishing only, short: «ламинация мат · биговка 1 · скругление · фигурная резка». */
export function postcardFinishingRu(pc: PostcardLineInfo): string {
  return [
    pc.lamination === "gloss" ? "ламинация глянец" : pc.lamination === "matte" ? "ламинация мат" : null,
    pc.figuredCut ? "фигурная резка" : null,
    pc.creaseLines > 0 ? `биговка ${pc.creaseLines}` : null,
    pc.roundedCorners ? "скругление углов" : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * Workshop steps in order: печать → ламинация → резка / фигурная резка →
 * биговка → скругление (a whole sheet is not cut).
 */
export function postcardStepsRu(data: Pick<BusinessCardLineData, "postcard" | "sheetsUsed" | "sides" | "quantity" | "cardsPerSheet" | "paperSnapshot">): string[] {
  const pc = data.postcard;
  if (!pc) return [];
  const sheets = `${data.sheetsUsed} л. ${pc.format}`;
  const steps = [`Печать Ricoh: ${sheets}, ${data.sides === "two" ? "2 стор." : "1 стор."}`];
  if (pc.lamination !== "none") steps.push(`Ламинация ${pc.lamination === "gloss" ? "глянец" : "мат"} (2 стор.): ${sheets}`);
  if (pc.wholeSheet) steps.push("Не резать — клиент режет сам");
  else if (pc.figuredCut) steps.push(`Фигурная резка Purcell: ${sheets}, ${data.cardsPerSheet} на листе`);
  else steps.push(`Гильотина: ${data.cardsPerSheet} на листе → ${data.quantity} шт`);
  if (pc.creaseLines > 0) steps.push(`Биговка: ${pc.creaseLines} ${pc.creaseLines === 1 ? "линия" : "линии"} × ${data.quantity}`);
  if (pc.roundedCorners) steps.push(`Скругление углов: ${data.quantity} шт`);
  return steps;
}

/** Price-driving options of two stored lines are the same (purpose is only a label). */
export function samePostcardPricing(a: PostcardOptions | undefined | null, b: PostcardOptions | undefined | null): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.format === b.format &&
    a.wholeSheet === b.wholeSheet &&
    a.lamination === b.lamination &&
    a.creaseLines === b.creaseLines &&
    a.roundedCorners === b.roundedCorners &&
    a.figuredCut === b.figuredCut
  );
}

/** The small sheet preview (to scale; camera marks only for a figured cut). */
export function postcardPreviewFromLineData(data: BusinessCardLineData): StickerSheetPreviewData | null {
  const pc = data.postcard;
  if (!pc) return null;
  return {
    shape: pc.roundedCorners ? "rounded" : "rect",
    format: pc.format,
    cut: pc.figuredCut,
    sheetWidthCm: pc.sheetWidthCm,
    sheetHeightCm: pc.sheetHeightCm,
    marginMm: pc.marginMm,
    columns: data.layout.columns,
    rows: data.layout.rows,
    slotWidthCm: data.layout.slotWidthCm,
    slotHeightCm: data.layout.slotHeightCm,
    gapCm: data.layout.gapCm,
    marginXCm: data.layout.marginXCm,
    marginYCm: data.layout.marginYCm,
  };
}
