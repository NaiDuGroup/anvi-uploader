/**
 * Wide-format materials sold as sheets (e.g. VATMAN 180G / 260G, A1 61×86 cm):
 * packing a line's pieces on sheets, the sell price per sheet and the stock
 * quantity of a line. Pure, shared by the server resolve and the wizard.
 *
 * - Printable area = sheet minus `marginMm` on every side.
 * - Pieces of one line are identical; they may be rotated; several share one
 *   sheet. Pieces sit edge to edge ({@link LF_SHEET_PACK_GAP_CM}): sheets are
 *   cut on the guillotine, so A1 holds exactly 2 × A2 / 4 × A3.
 * - Line price = sheets × price per sheet (or the size preset × qty); the
 *   stock / cost of the line is always whole sheets.
 */
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { roundMoneyMdl } from "./largeFormatLinePricing";
import { LF_ROLL_PACK_MAX_QUANTITY } from "./largeFormatRollConstants";
import type { LargeFormatRollPackLayout } from "./largeFormatRollPack";
import type { LfMaterialPricingResult } from "./lfInkSellPricing";
import { applyLfMinimumLineSellTotalMdl } from "./lfMinimumLineSell";
import { applyLfSizePresetOverride } from "./lfPresetPricing";
import {
  computeLfRollOrderEconomics,
  lfRollEconomicsWithRevenueMargin,
  type LfRollOrderEconomicsResult,
} from "./lfRollOrderEconomics";
import type { LargeFormatCustomerType } from "./types";

/** `LargeFormatMaterial.materialForm`. */
export type LfMaterialForm = "roll" | "sheet";

export const LF_MATERIAL_FORMS: readonly LfMaterialForm[] = ["roll", "sheet"];

export function parseLfMaterialForm(raw: unknown): LfMaterialForm {
  return raw === "sheet" ? "sheet" : "roll";
}

/** Default non-printable edge of a sheet (mm per side). */
export const LF_SHEET_DEFAULT_MARGIN_MM = 5;
/** Default sheet size of a new sheet material: VATMAN A1, 61 × 86 cm. */
export const LF_SHEET_DEFAULT_WIDTH_CM = 61;
export const LF_SHEET_DEFAULT_HEIGHT_CM = 86;

/** Gap between pieces on a sheet (cm): none, pieces are guillotine-cut. */
export const LF_SHEET_PACK_GAP_CM = 0;

/** Roll width above this (metres) is almost surely centimetres typed into the metres field. */
export const LF_ROLL_WIDTH_MAX_METERS = 10;

const EPS = 1e-6;

export interface LfSheetSpec {
  sheetWidthCm: number;
  sheetHeightCm: number;
  /** Non-printable edge per side (mm). */
  marginMm: number;
}

type NumLike = number | string | { toString(): string } | null | undefined;

function numOf(v: NumLike): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/**
 * Sheet spec of a wide-format material, or null for a roll (or a sheet
 * material whose size is not filled in yet).
 */
export function lfMaterialSheetSpec(m: {
  materialForm?: string | null;
  sheetWidthCm?: NumLike;
  sheetHeightCm?: NumLike;
  sheetMarginMm?: NumLike;
}): LfSheetSpec | null {
  if (m.materialForm !== "sheet") return null;
  const w = numOf(m.sheetWidthCm);
  const h = numOf(m.sheetHeightCm);
  if (w == null || h == null || !(w > 0) || !(h > 0)) return null;
  const margin = numOf(m.sheetMarginMm);
  return { sheetWidthCm: w, sheetHeightCm: h, marginMm: margin != null && margin >= 0 ? margin : LF_SHEET_DEFAULT_MARGIN_MM };
}

export function lfSheetPrintableCm(spec: LfSheetSpec): { widthCm: number; heightCm: number } {
  const m = Math.max(0, Number.isFinite(spec.marginMm) ? spec.marginMm : 0) / 10;
  return {
    widthCm: Math.max(0, spec.sheetWidthCm - 2 * m),
    heightCm: Math.max(0, spec.sheetHeightCm - 2 * m),
  };
}

function fitCount(lengthCm: number, sizeCm: number, gapCm: number): number {
  if (!(sizeCm > 0) || sizeCm > lengthCm + EPS) return 0;
  return Math.floor((lengthCm + gapCm + EPS) / (sizeCm + gapCm));
}

/** True when a w×h piece fits the printable area in at least one orientation. */
export function lfSheetItemFits(widthCm: number, heightCm: number, spec: LfSheetSpec): boolean {
  const p = lfSheetPrintableCm(spec);
  return (
    (widthCm <= p.widthCm + EPS && heightCm <= p.heightCm + EPS) ||
    (heightCm <= p.widthCm + EPS && widthCm <= p.heightCm + EPS)
  );
}

/** One piece on a sheet; x / y from the sheet's top-left corner (margin included). */
export interface LfSheetPlacement {
  /** 0-based sheet index. */
  sheet: number;
  xCm: number;
  yCm: number;
  widthCm: number;
  heightCm: number;
  rotated: boolean;
}

/** Persisted on `LargeFormatLineData.sheetLayout`. */
export interface LfSheetLayoutPersisted {
  sheetsCount: number;
  /** Pieces on a full sheet. */
  perSheet: number;
  sheetWidthCm: number;
  sheetHeightCm: number;
  marginMm: number;
  gapCm: number;
  placements: LfSheetPlacement[];
}

export type LfSheetPackResult =
  | { ok: true; layout: LfSheetLayoutPersisted }
  | { ok: false; code: "does_not_fit" | "quantity_too_large" | "invalid" };

type Rect = { xCm: number; yCm: number; widthCm: number; heightCm: number; rotated: boolean };

/**
 * Most w×h pieces on a W×H area: a band of pieces in one orientation, the rest
 * of the area filled with the other one (bands split across the height or the
 * width, both orientations first). Covers plain grids and the usual mixed
 * layouts (e.g. 3 standing + 2 lying).
 */
function bestSheetArrangement(w: number, h: number, W: number, H: number, g: number): Rect[] {
  type Config = { count: number; build: () => Rect[] };
  let best: Config = { count: 0, build: () => [] };
  const grid = (x0: number, y0: number, cols: number, rows: number, pw: number, ph: number, rotated: boolean): Rect[] => {
    const out: Rect[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        out.push({ xCm: x0 + c * (pw + g), yCm: y0 + r * (ph + g), widthCm: pw, heightCm: ph, rotated });
      }
    }
    return out;
  };
  const orientations: Array<{ aw: number; ah: number; aRot: boolean }> = [
    { aw: w, ah: h, aRot: false },
    { aw: h, ah: w, aRot: true },
  ];
  for (const { aw, ah, aRot } of orientations) {
    const bw = ah;
    const bh = aw;
    // Rows of A across the top, the remaining height filled with B.
    const colsA = fitCount(W, aw, g);
    const maxRowsA = fitCount(H, ah, g);
    for (let k = 0; k <= maxRowsA; k++) {
      const usedH = k > 0 ? k * ah + k * g : 0;
      const remH = H - usedH;
      const colsB = fitCount(W, bw, g);
      const rowsB = remH > 0 ? fitCount(remH, bh, g) : 0;
      const count = k * colsA + colsB * rowsB;
      if (count > best.count) {
        best = {
          count,
          build: () => [...grid(0, 0, colsA, k, aw, ah, aRot), ...grid(0, usedH, colsB, rowsB, bw, bh, !aRot)],
        };
      }
    }
    // Columns of A on the left, the remaining width filled with B.
    const rowsA = fitCount(H, ah, g);
    const maxColsA = fitCount(W, aw, g);
    for (let k = 0; k <= maxColsA; k++) {
      const usedW = k > 0 ? k * aw + k * g : 0;
      const remW = W - usedW;
      const rowsB = fitCount(H, bh, g);
      const colsB = remW > 0 ? fitCount(remW, bw, g) : 0;
      const count = k * rowsA + colsB * rowsB;
      if (count > best.count) {
        best = {
          count,
          build: () => [...grid(0, 0, k, rowsA, aw, ah, aRot), ...grid(usedW, 0, colsB, rowsB, bw, bh, !aRot)],
        };
      }
    }
  }
  return best.build();
}

/**
 * Sheets needed for `quantity` pieces of w×h cm: pieces per full sheet from
 * {@link bestSheetArrangement}, the last sheet takes the rest.
 */
export function packLfSheets(input: {
  itemWidthCm: number;
  itemHeightCm: number;
  quantity: number;
  sheet: LfSheetSpec;
  gapCm?: number;
}): LfSheetPackResult {
  const { itemWidthCm: w, itemHeightCm: h, quantity, sheet } = input;
  const gapCm = Math.max(0, input.gapCm ?? LF_SHEET_PACK_GAP_CM);
  if (
    !(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h) ||
    !Number.isInteger(quantity) || quantity < 1 ||
    !(sheet.sheetWidthCm > 0) || !(sheet.sheetHeightCm > 0)
  ) {
    return { ok: false, code: "invalid" };
  }
  if (quantity > LF_ROLL_PACK_MAX_QUANTITY) return { ok: false, code: "quantity_too_large" };
  if (!lfSheetItemFits(w, h, sheet)) return { ok: false, code: "does_not_fit" };
  const printable = lfSheetPrintableCm(sheet);
  const perSheetRects: Rect[] = bestSheetArrangement(w, h, printable.widthCm, printable.heightCm, gapCm);
  const perSheet: number = perSheetRects.length;
  if (perSheet < 1) return { ok: false, code: "does_not_fit" };
  const sheetsCount: number = Math.ceil(quantity / perSheet);
  const marginCm: number = Math.max(0, sheet.marginMm) / 10;
  const round = (n: number): number => Math.round(n * 1000) / 1000;
  const placements: LfSheetPlacement[] = [];
  for (let i = 0; i < quantity; i++) {
    const r = perSheetRects[i % perSheet]!;
    placements.push({
      sheet: Math.floor(i / perSheet),
      xCm: round(marginCm + r.xCm),
      yCm: round(marginCm + r.yCm),
      widthCm: r.widthCm,
      heightCm: r.heightCm,
      rotated: r.rotated,
    });
  }
  return {
    ok: true,
    layout: {
      sheetsCount,
      perSheet,
      sheetWidthCm: sheet.sheetWidthCm,
      sheetHeightCm: sheet.sheetHeightCm,
      marginMm: sheet.marginMm,
      gapCm,
      placements,
    },
  };
}

// ─── Labels ──────────────────────────────────────────────────────────────────

const ISO_A: Array<{ name: string; w: number; h: number }> = [
  { name: "A0", w: 84.1, h: 118.9 },
  { name: "A1", w: 59.4, h: 84.1 },
  { name: "A2", w: 42, h: 59.4 },
  { name: "A3", w: 29.7, h: 42 },
  { name: "A4", w: 21, h: 29.7 },
];

function fmtCm(n: number): string {
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/** «61×86». */
export function lfSheetSizeCmLabel(spec: Pick<LfSheetSpec, "sheetWidthCm" | "sheetHeightCm">): string {
  return `${fmtCm(spec.sheetWidthCm)}×${fmtCm(spec.sheetHeightCm)}`;
}

/** «A1» when the sheet is an ISO A size (or its slightly oversized trade format, e.g. 61×86), else «61×86». */
export function lfSheetFormatLabel(spec: Pick<LfSheetSpec, "sheetWidthCm" | "sheetHeightCm">): string {
  const a = Math.min(spec.sheetWidthCm, spec.sheetHeightCm);
  const b = Math.max(spec.sheetWidthCm, spec.sheetHeightCm);
  const iso = ISO_A.find((f) => a >= f.w - 0.5 && a <= f.w + 2.5 && b >= f.h - 0.5 && b <= f.h + 2.5);
  return iso ? iso.name : lfSheetSizeCmLabel(spec);
}

function ruPlural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

/** «3 листа A1». */
export function lfSheetsCountRu(n: number, spec: Pick<LfSheetSpec, "sheetWidthCm" | "sheetHeightCm">): string {
  return `${n} ${ruPlural(n, "лист", "листа", "листов")} ${lfSheetFormatLabel(spec)}`;
}

/** «Не помещается на лист 61×86». */
export function lfSheetDoesNotFitRu(spec: Pick<LfSheetSpec, "sheetWidthCm" | "sheetHeightCm">): string {
  return `Не помещается на лист ${lfSheetSizeCmLabel(spec)}`;
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface LfSheetPriceMaterial {
  /** Manual retail / dealer price per sheet (MDL); null or 0 = from cost × markup. */
  retailPricePerSheet: number | null;
  dealerPricePerSheet: number | null;
  /** Weighted-average purchase cost per sheet (stock variant); null until the first receipt. */
  avgCostPerSheet: number | null;
  /** Manual cost hint per sheet (variant `purchaseCost`), used until the first receipt. */
  catalogCostPerSheet: number;
}

/** Purchase cost per sheet: the weighted average, else the manual hint. */
export function effectiveLfSheetCostMdl(m: Pick<LfSheetPriceMaterial, "avgCostPerSheet" | "catalogCostPerSheet">): number {
  const avg = m.avgCostPerSheet;
  if (avg != null && Number.isFinite(avg) && avg >= 0) return avg;
  return Number.isFinite(m.catalogCostPerSheet) && m.catalogCostPerSheet > 0 ? m.catalogCostPerSheet : 0;
}

/**
 * Sell price per sheet: the manual price of the channel, else cost per sheet ×
 * the LF retail / dealer markup multiplier (as `resolveLfSellRatesPerLinearMeterMdl`),
 * else 0 (not priced).
 */
export function resolveLfSellPricePerSheetMdl(params: {
  material: LfSheetPriceMaterial;
  production: Pick<ProductionCostsConfig, "lfRetailMarkupMultiplier" | "lfDealerMarkupMultiplier">;
  customerType: LargeFormatCustomerType;
}): number {
  const { material: m, production: prod, customerType } = params;
  const manual = customerType === "dealer" ? m.dealerPricePerSheet : m.retailPricePerSheet;
  if (manual != null && Number.isFinite(manual) && manual > 0) return Math.round(manual);
  const mult = customerType === "dealer" ? prod.lfDealerMarkupMultiplier : prod.lfRetailMarkupMultiplier;
  if (mult > 0) return roundMoneyMdl(effectiveLfSheetCostMdl(m) * mult);
  return 0;
}

/** Sheets × price per sheet; cost = sheets × cost per sheet. No ink sell on sheets. */
export function computeLfSheetLinePricing(input: {
  sheetsCount: number;
  pricePerSheetMdl: number;
  costPerSheetMdl: number;
}): LfMaterialPricingResult {
  const sheets = Number.isFinite(input.sheetsCount) && input.sheetsCount > 0 ? Math.ceil(input.sheetsCount) : 0;
  const materialCost = roundMoneyMdl(sheets * input.costPerSheetMdl);
  const materialSellPrice = roundMoneyMdl(sheets * input.pricePerSheetMdl);
  return {
    calculatedLinearMeters: 0,
    materialCost,
    materialSellPrice,
    printSellPrice: 0,
    totalSellPrice: materialSellPrice,
    estimatedProfit: materialSellPrice - materialCost,
  };
}

// ─── Stock ───────────────────────────────────────────────────────────────────

/**
 * Units a LF line takes from its material's stock variant: whole sheets for a
 * sheet line, linear metres for a roll line.
 */
export function lfLineStockQuantity(data: {
  calculatedLinearMeters?: number;
  sheetLayout?: { sheetsCount: number } | null;
} | null | undefined): number {
  if (!data) return 0;
  if (data.sheetLayout) {
    const n = data.sheetLayout.sheetsCount;
    return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0;
  }
  const lm = data.calculatedLinearMeters;
  return typeof lm === "number" && Number.isFinite(lm) && lm > 0 ? lm : 0;
}


// ─── Whole line (server resolve + wizard preview) ────────────────────────────

/** Server code: a sheet material with no price per sheet (no price, no purchase cost) and no size preset. */
export const LF_SHEET_NO_PRICE_CODE = "lf_sheet_no_price";

/**
 * True when a sheet line has no real price: price per sheet 0 (no manual price,
 * no cost to mark up) and no size preset. Such a line must not go in at 0 (or
 * at the bare retail minimum): staff type the line price, else it is blocked.
 */
export function lfSheetLineUnpriced(res: { pricePerSheetMdl: number }, presetUnitPriceMdl?: number | null): boolean {
  if (presetUnitPriceMdl != null && presetUnitPriceMdl > 0) return false;
  return !(res.pricePerSheetMdl > 0);
}

export type LfSheetLineResult =
  | {
      ok: true;
      layout: LfSheetLayoutPersisted;
      pricePerSheetMdl: number;
      costPerSheetMdl: number;
      /** Final line pricing (sheets × price, or preset × qty; retail minimum applied). */
      pricing: LfMaterialPricingResult;
      economics: LfRollOrderEconomicsResult;
      minimumLineUpliftMdl: number;
    }
  | { ok: false; code: "does_not_fit" | "quantity_too_large" | "invalid" };

/**
 * Price a sheet-material line: pack the pieces on sheets, sheets × price per
 * sheet (or the size preset × qty), the retail LF line minimum (dealers are
 * exempt, as for rolls; never with a preset). Cost and stock are whole sheets;
 * ink is a cost only (the price per sheet includes the print).
 */
export function computeLfSheetLine(input: {
  sheet: LfSheetSpec;
  material: LfSheetPriceMaterial;
  production: Pick<
    ProductionCostsConfig,
    "lfRetailMarkupMultiplier" | "lfDealerMarkupMultiplier" | "lfMinimumLineTotalMdl" | "inkMlPerSqmLargeFormatRoll"
  >;
  avgInkCostPerMlMdl: number;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  customerType: LargeFormatCustomerType;
  /** Size preset price per piece; null = price per sheet. */
  presetUnitPriceMdl?: number | null;
}): LfSheetLineResult {
  const pack = packLfSheets({
    itemWidthCm: input.printWidthCm,
    itemHeightCm: input.printHeightCm,
    quantity: input.quantity,
    sheet: input.sheet,
  });
  if (!pack.ok) return pack;
  const sheetsCount: number = pack.layout.sheetsCount;
  const costPerSheetMdl: number = effectiveLfSheetCostMdl(input.material);
  const pricePerSheetMdl: number = resolveLfSellPricePerSheetMdl({
    material: input.material,
    production: input.production,
    customerType: input.customerType,
  });
  const base = computeLfSheetLinePricing({ sheetsCount, pricePerSheetMdl, costPerSheetMdl });
  // Roll economics with one «metre» = one sheet: written-off area = sheets × sheet
  // area, material cost = sheets × cost per sheet, ink from the printed area.
  const econCosts = computeLfRollOrderEconomics({
    printWidthCm: input.printWidthCm,
    printHeightCm: input.printHeightCm,
    quantity: input.quantity,
    calculatedLinearMeters: sheetsCount,
    rollWidthMeters: (input.sheet.sheetWidthCm * input.sheet.sheetHeightCm) / 10_000,
    effectiveMaterialCostPerLinearMeterMdl: costPerSheetMdl,
    inkMlPerSqm: Math.max(0, input.production.inkMlPerSqmLargeFormatRoll || 0),
    avgInkCostPerMlMdl: Math.max(0, input.avgInkCostPerMlMdl || 0),
    totalSellPriceMdl: base.totalSellPrice,
  });
  let pricing: LfMaterialPricingResult;
  let minimumLineUpliftMdl = 0;
  const preset = input.presetUnitPriceMdl;
  if (preset != null && preset > 0) {
    pricing = applyLfSizePresetOverride({ pricing: base, presetPriceMdl: preset, quantity: input.quantity });
  } else {
    const floor = input.customerType === "dealer" ? 0 : input.production.lfMinimumLineTotalMdl;
    const lifted = applyLfMinimumLineSellTotalMdl(base, floor);
    pricing = lifted.pricing;
    minimumLineUpliftMdl = lifted.upliftMdl;
  }
  const economics = lfRollEconomicsWithRevenueMargin(econCosts, pricing.totalSellPrice);
  pricing = { ...pricing, calculatedLinearMeters: 0, estimatedProfit: pricing.totalSellPrice - economics.totalDirectCostMdl };
  return { ok: true, layout: pack.layout, pricePerSheetMdl, costPerSheetMdl, pricing, economics, minimumLineUpliftMdl };
}

/**
 * The first sheet of a sheet layout in the roll-preview shape (sheet width ×
 * sheet height, its pieces), for the existing layout diagrams. Not a roll: no
 * metres; `calculatedLinearMeters` is 0.
 */
export function lfSheetLayoutAsRollPreview(layout: LfSheetLayoutPersisted): LargeFormatRollPackLayout {
  return {
    algorithmVersion: 0,
    printableWidthCm: layout.sheetWidthCm,
    nominalRollWidthMeters: layout.sheetWidthCm / 100,
    calculatedLinearMeters: 0,
    totalAlongCm: layout.sheetHeightCm,
    placements: layout.placements
      .filter((p) => p.sheet === 0)
      .map((p) => ({ xCm: p.xCm, yCm: p.yCm, crossCm: p.widthCm, alongCm: p.heightCm, rotated: p.rotated })),
    orientationsUsed: [],
  };
}
