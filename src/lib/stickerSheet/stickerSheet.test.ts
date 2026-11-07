import { describe, expect, it } from "vitest";
import {
  STICKER_SHEET_DEFAULTS,
  buildStickerSheetLineData,
  computeStickerSheetLayout,
  computeStickerSheetPricing,
  isStickerSheetPaper,
  parseStickerSheetSettings,
  sheetLineClicksPerSide,
  sheetLinePaperSheets,
  sheetLineTonerClicks,
  normalizeStickerSheetFormat,
  stickerRoundSheets,
  stickerSheetSummaryRu,
  stickerSheetsForQuantity,
} from "./stickerSheet";
import { parseBusinessCardLineData } from "@/lib/businessCard/parseBusinessCardLineData";
import { stickerLineInputSchema } from "@/lib/validations";
import { keepStoredSheetLinePricing } from "@/lib/businessCard/keepStoredSheetLinePricing";

const perSheet = (w: number, h: number, format: "A3+" | "A4+" = "A3+") =>
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
  it("A4+ (225×320, own 12 mm marks) holds fewer", () => {
    expect(perSheet(65, 65, "A4+")).toBe(12);
    expect(perSheet(30, 30, "A4+")).toBe(54);
    expect(perSheet(50, 50, "A4+")).toBe(15);
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
  const price = (sheets: number, opts: { cut?: boolean; format?: "A3+" | "A4+"; dealer?: boolean } = {}) =>
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
    // A4+ goes in pairs: 3 → 4 sheets × 15.
    expect(price(3, { cut: false, format: "A4+" }).totalSellPriceMdl).toBe(60);
    expect(price(1, { cut: false, format: "A4+" }).totalSellPriceMdl).toBe(30);
  });
  it("A4+ = half the A3+ price, tier by A3+ sheets (A4+ ÷ 2)", () => {
    expect(price(1, { format: "A4+" }).pricePerSheetMdl).toBe(25);
    expect(price(18, { format: "A4+" }).pricePerSheetMdl).toBe(25);
    expect(price(19, { format: "A4+" }).pricePerSheetMdl).toBe(20); // → 20 A4+ = 10 A3+
    expect(price(20, { format: "A4+" }).pricePerSheetMdl).toBe(20);
    expect(price(58, { format: "A4+" }).pricePerSheetMdl).toBe(20);
    expect(price(60, { format: "A4+" }).pricePerSheetMdl).toBe(15.5);
    expect(price(198, { format: "A4+" }).pricePerSheetMdl).toBe(15.5);
    expect(price(200, { format: "A4+" }).pricePerSheetMdl).toBe(12.5);
    expect(price(600, { format: "A4+" }).pricePerSheetMdl).toBe(9);
  });
  it("A4+ pair = one A3+ at the same tier", () => {
    for (const n of [1, 5, 10, 30, 100, 300]) {
      expect(price(2 * n, { format: "A4+" }).totalSellPriceMdl).toBe(price(n).totalSellPriceMdl);
      expect(price(2 * n, { format: "A4+", dealer: true }).totalSellPriceMdl).toBe(price(n, { dealer: true }).totalSellPriceMdl);
    }
  });
  it("A4+ pair rounding: 1 → 2, 5 → 6, 6 → 6; A3+ unchanged", () => {
    expect(price(1, { format: "A4+" }).totalSellPriceMdl).toBe(50);
    expect(price(5, { format: "A4+" }).totalSellPriceMdl).toBe(150);
    expect(price(6, { format: "A4+" }).totalSellPriceMdl).toBe(150);
    expect([0, 1, 2, 5, 6, 7].map((n) => stickerRoundSheets(n, "A4+"))).toEqual([0, 2, 2, 6, 6, 8]);
    expect([1, 5].map((n) => stickerRoundSheets(n, "A3+"))).toEqual([1, 5]);
    // pieces: ceil(pcs / per A4+) then even
    expect(stickerSheetsForQuantity(1, 12, "A4+")).toBe(2);
    expect(stickerSheetsForQuantity(50, 12, "A4+")).toBe(6);
    expect(stickerSheetsForQuantity(50, 12, "A3+")).toBe(5);
  });
  it("dealer: flat 24 per A3+ (A4+ 12), no cut × 0.6", () => {
    expect(price(1, { dealer: true }).pricePerSheetMdl).toBe(24);
    expect(price(500, { dealer: true }).pricePerSheetMdl).toBe(24);
    expect(price(10, { dealer: true, format: "A4+" }).totalSellPriceMdl).toBe(120);
    expect(price(5, { dealer: true, format: "A4+" }).totalSellPriceMdl).toBe(72);
    expect(price(5, { dealer: true, format: "A4+", cut: false }).totalSellPriceMdl).toBe(43);
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
  it("A4+ writes off one whole A3+ sticker sheet per pair", () => {
    const r = build({ format: "A4+", quantity: 36 });
    if (!r.ok) throw new Error(r.code);
    expect(r.data.sheetsUsed).toBe(4); // 3 → 4 (pairs)
    expect(sheetLinePaperSheets(r.data)).toBe(2);
    expect(r.data.totalSellPriceMdl).toBe(100);
    expect(sheetLineTonerClicks(r.data)).toBe(4); // 2 A3+ × 2 clicks
    expect(stickerSheetSummaryRu(r.data.stickerSheet!)).toBe("A4+ (2 на A3+) · круг Ø65 · с резкой");
    const one = build({ format: "A4+", quantity: 1 });
    expect(one.ok && one.data.sheetsUsed).toBe(2);
    expect(one.ok && sheetLinePaperSheets(one.data)).toBe(1);
  });
  it("old lines stored as format A4 read as A4+", () => {
    const r = build({ format: "A4+", quantity: 24 });
    if (!r.ok) throw new Error(r.code);
    const old = { ...r.data, stickerSheet: { ...r.data.stickerSheet!, format: "A4" } };
    expect(parseBusinessCardLineData(JSON.parse(JSON.stringify(old)))?.stickerSheet?.format).toBe("A4+");
    expect(normalizeStickerSheetFormat("A4")).toBe("A4+");
    expect(normalizeStickerSheetFormat("A5")).toBeNull();
    expect(
      stickerLineInputSchema.parse({ shape: "circle", widthMm: 65, heightMm: 65, cut: true, format: "A4" }).format,
    ).toBe("A4+");
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

describe("Ricoh toner clicks of a sheet line", () => {
  const a4plus = { sheetWidthCm: 22.5, sheetHeightCm: 32 };
  const a3plus = { sheetWidthCm: 32, sheetHeightCm: 45 };

  it("A3+ sticker sheet = 2 clicks, A4+ = 1 (a pair = 2)", () => {
    expect(sheetLineTonerClicks({ sheetsUsed: 10, sides: "one", paperSnapshot: a3plus, stickerSheet: { format: "A3+" } })).toBe(20);
    // The sticker paper is stored as A3+; 10 A4+ = 5 A3+ sheets × 2 clicks.
    expect(sheetLineTonerClicks({ sheetsUsed: 10, sides: "one", paperSnapshot: a3plus, stickerSheet: { format: "A4+" } })).toBe(10);
    expect(sheetLineTonerClicks({ sheetsUsed: 10, sides: "one", paperSnapshot: a3plus, stickerSheet: { format: "A4" } })).toBe(10);
  });

  it("other sheet lines: by the paper's sheet size and sides", () => {
    expect(sheetLineTonerClicks({ sheetsUsed: 10, sides: "two", paperSnapshot: a4plus })).toBe(20);
    expect(sheetLineTonerClicks({ sheetsUsed: 10, sides: "one", paperSnapshot: a4plus })).toBe(10);
    expect(sheetLineTonerClicks({ sheetsUsed: 10, sides: "two", paperSnapshot: a3plus })).toBe(40);
    expect(sheetLineClicksPerSide({ paperSnapshot: { sheetWidthCm: 21, sheetHeightCm: 29.7 } })).toBe(1);
    expect(sheetLineClicksPerSide({ paperSnapshot: { sheetWidthCm: 29.7, sheetHeightCm: 42 } })).toBe(2);
  });

  it("unknown size counts 1, no sheets counts 0", () => {
    expect(sheetLineClicksPerSide({})).toBe(1);
    expect(sheetLineTonerClicks({ sheetsUsed: 0, sides: "two", paperSnapshot: a3plus })).toBe(0);
  });
});
