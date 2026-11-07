import { describe, expect, it } from "vitest";
import {
  STICKER_SHEET_DEFAULTS,
  buildStickerSheetLineData,
  computeStickerSheetLayout,
  computeStickerSheetPricing,
  isStickerSheetPaper,
  parseStickerSheetSettings,
  sheetLinePaperSheets,
  stickerSheetSummaryRu,
} from "./stickerSheet";
import { keepStoredSheetLinePricing } from "@/lib/businessCard/keepStoredSheetLinePricing";

const perSheet = (w: number, h: number, format: "A3+" | "A4" = "A3+") =>
  computeStickerSheetLayout({ format, widthMm: w, heightMm: h, marginMm: 12, gapMm: 3 }).cardsPerSheet;

describe("sticker sheet layout (A3+ 320×450, 12 mm marks, 3 mm gap)", () => {
  it("fits the owner's photo: Ø65–68 circles → 24 (4 × 6)", () => {
    expect(perSheet(65, 65)).toBe(24);
    expect(perSheet(68, 68)).toBe(24);
    expect(perSheet(70, 70)).toBe(20);
  });
  it("counts the sample sizes", () => {
    expect(perSheet(30, 30)).toBe(117);
    expect(perSheet(50, 50)).toBe(40);
    expect(perSheet(90, 50)).toBe(24);
    expect(perSheet(50, 90)).toBe(24);
  });
  it("tries both orientations", () => {
    // 140×60: upright 2 cols × 6 rows = 12; turned 4 cols × 2 rows = 8.
    const l = computeStickerSheetLayout({ format: "A3+", widthMm: 140, heightMm: 60, marginMm: 12, gapMm: 3 });
    expect(l.cardsPerSheet).toBe(12);
  });
  it("A4 (225×320) holds fewer", () => {
    expect(perSheet(65, 65, "A4")).toBe(12);
  });
  it("keeps the grid inside the mark margin", () => {
    const l = computeStickerSheetLayout({ format: "A3+", widthMm: 65, heightMm: 65, marginMm: 12, gapMm: 3 });
    for (const p of l.placements) {
      expect(p.xCm).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(p.yCm).toBeGreaterThanOrEqual(1.2 - 1e-9);
      expect(p.xCm + p.widthCm).toBeLessThanOrEqual(32 - 1.2 + 1e-9);
      expect(p.yCm + p.heightCm).toBeLessThanOrEqual(45 - 1.2 + 1e-9);
    }
  });
  it("0 when it does not fit", () => {
    expect(perSheet(300, 300)).toBe(0);
  });
});

describe("sticker sheet price tiers", () => {
  const price = (sheets: number, opts: { cut?: boolean; format?: "A3+" | "A4"; dealer?: boolean } = {}) =>
    computeStickerSheetPricing({
      sheets,
      cut: opts.cut ?? true,
      format: opts.format ?? "A3+",
      customerType: opts.dealer ? "dealer" : "retail",
    });

  it("retail A3+ with cut: 50 / 40 / 31 / 25 / 18", () => {
    expect([1, 9, 10, 29, 30, 99, 100, 299, 300, 500].map((n) => price(n).pricePerSheetMdl)).toEqual([
      50, 50, 40, 40, 31, 31, 25, 25, 18, 18,
    ]);
    expect(price(10).totalSellPriceMdl).toBe(400);
    expect(price(300).totalSellPriceMdl).toBe(5400);
  });
  it("no cut = × 0.6, whole lei", () => {
    expect(price(1, { cut: false }).pricePerSheetMdl).toBe(30);
    expect(price(10, { cut: false }).totalSellPriceMdl).toBe(240);
    expect(price(3, { cut: false, format: "A4" }).totalSellPriceMdl).toBe(45);
    expect(price(1, { cut: false, format: "A4" }).totalSellPriceMdl).toBe(15);
  });
  it("A4 = half the A3+ price, tier by A3+ equivalents (A4 ÷ 2)", () => {
    expect(price(1, { format: "A4" }).pricePerSheetMdl).toBe(25);
    expect(price(19, { format: "A4" }).pricePerSheetMdl).toBe(25);
    expect(price(20, { format: "A4" }).pricePerSheetMdl).toBe(20);
    expect(price(60, { format: "A4" }).pricePerSheetMdl).toBe(15.5);
    expect(price(600, { format: "A4" }).pricePerSheetMdl).toBe(9);
  });
  it("dealer: flat 24 per A3+ (A4 12), no cut × 0.6", () => {
    expect(price(1, { dealer: true }).pricePerSheetMdl).toBe(24);
    expect(price(500, { dealer: true }).pricePerSheetMdl).toBe(24);
    expect(price(10, { dealer: true, format: "A4" }).totalSellPriceMdl).toBe(120);
    expect(price(10, { dealer: true, cut: false }).totalSellPriceMdl).toBe(144);
    expect(price(5, { dealer: true }).tierMinSheets).toBeNull();
  });
  it("settings override with defaults for bad fields", () => {
    const s = parseStickerSheetSettings({ marginMm: 10, retailTiers: [{ minSheets: 1, pricePerSheetMdl: 60 }], gapMm: "x" });
    expect(s.marginMm).toBe(10);
    expect(s.gapMm).toBe(STICKER_SHEET_DEFAULTS.gapMm);
    expect(computeStickerSheetPricing({ sheets: 500, cut: true, format: "A3+", customerType: "retail", settings: s }).pricePerSheetMdl).toBe(60);
    expect(parseStickerSheetSettings(null)).toBe(STICKER_SHEET_DEFAULTS);
  });
});

describe("sticker sheet line data", () => {
  const paper = {
    id: "p1",
    name: "A3+ самоклейка Fedrigoni",
    sheetWidthCm: 32,
    sheetHeightCm: 45,
    costPerSheet: 0,
    retailPricePerSheet: 50,
    dealerPricePerSheet: 24,
  };
  const build = (over: Partial<Parameters<typeof buildStickerSheetLineData>[0]> = {}) =>
    buildStickerSheetLineData({
      paperSnapshot: paper,
      avgPaperCostPerSheet: 1.77,
      shape: "circle",
      widthMm: 65,
      heightMm: 65,
      cut: true,
      format: "A3+",
      quantityMode: "pieces",
      quantity: 240,
      customerType: "retail",
      ...over,
    });

  it("240 × Ø65 → 24/sheet, 10 sheets, 400 lei, paper 10 × 1.77", () => {
    const r = build();
    if (!r.ok) throw new Error(r.code);
    expect(r.data.cardsPerSheet).toBe(24);
    expect(r.data.sheetsUsed).toBe(10);
    expect(r.data.totalSellPriceMdl).toBe(400);
    expect(r.data.paperCostMdl).toBeCloseTo(17.7, 5);
    expect(sheetLinePaperSheets(r.data)).toBe(10);
    expect(stickerSheetSummaryRu(r.data.stickerSheet!)).toBe("A3+ · круг Ø65 · с резкой");
  });
  it("a partial last sheet still counts: 25 pieces → 2 sheets", () => {
    const r = build({ quantity: 25 });
    expect(r.ok && r.data.sheetsUsed).toBe(2);
  });
  it("A4 writes off half an A3+ sticker sheet each", () => {
    const r = build({ format: "A4", quantity: 36 });
    if (!r.ok) throw new Error(r.code);
    expect(r.data.sheetsUsed).toBe(3);
    expect(sheetLinePaperSheets(r.data)).toBe(1.5);
    expect(r.data.totalSellPriceMdl).toBe(75);
  });
  it("rejects a sticker that does not fit", () => {
    expect(build({ widthMm: 400, heightMm: 400 })).toEqual({ ok: false, code: "sticker_does_not_fit_sheet" });
  });
  it("edit keeps the sold price only while shape / cut / format are unchanged", () => {
    const a = build();
    const b = build({ cut: false });
    if (!a.ok || !b.ok) throw new Error();
    const stored = { ...a.data, totalSellPriceMdl: 999 };
    expect(keepStoredSheetLinePricing(a.data, stored).totalSellPriceMdl).toBe(999);
    expect(keepStoredSheetLinePricing(b.data, stored).totalSellPriceMdl).toBe(240);
  });
  it("recognises the sticker paper by name", () => {
    expect(isStickerSheetPaper({ name: "A3+ самоклейка Fedrigoni" })).toBe(true);
    expect(isStickerSheetPaper({ name: "A4+ 300gr" })).toBe(false);
  });
});
