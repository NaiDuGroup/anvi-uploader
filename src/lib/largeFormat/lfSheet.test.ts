import { describe, expect, it } from "vitest";
import { planReceipt } from "@/lib/stock/unified/ledgerMath";
import {
  computeLfSheetLine,
  computeLfSheetLinePricing,
  lfMaterialSheetSpec,
  effectiveLfSheetCostMdl,
  lfLineStockQuantity,
  lfSheetDoesNotFitRu,
  lfSheetFormatLabel,
  lfSheetItemFits,
  lfSheetLineUnpriced,
  lfSheetPrintableCm,
  lfSheetsCountRu,
  packLfSheets,
  resolveLfSellPricePerSheetMdl,
  type LfSheetSpec,
} from "./lfSheet";
import { applyLfMinimumLineSellTotalMdl } from "./lfMinimumLineSell";
import { applyLfSizePresetOverride } from "./lfPresetPricing";

const A1: LfSheetSpec = { sheetWidthCm: 61, sheetHeightCm: 86, marginMm: 5 };

function sheets(w: number, h: number, quantity: number, spec: LfSheetSpec = A1): number | string {
  const r = packLfSheets({ itemWidthCm: w, itemHeightCm: h, quantity, sheet: spec });
  return r.ok ? r.layout.sheetsCount : r.code;
}

describe("packLfSheets", () => {
  it("printable area is the sheet minus the margin on every side", () => {
    expect(lfSheetPrintableCm(A1)).toEqual({ widthCm: 60, heightCm: 85 });
  });

  it("A1 item → 1 sheet", () => {
    expect(sheets(59.4, 84.1, 1)).toBe(1);
  });

  it("2 × A2 → 1 sheet (rotated)", () => {
    expect(sheets(42, 59.4, 2)).toBe(1);
  });

  it("4 × A3 → 1 sheet", () => {
    expect(sheets(29.7, 42, 4)).toBe(1);
    expect(sheets(42, 29.7, 4)).toBe(1);
  });

  it("5 × A3 → 2 sheets", () => {
    expect(sheets(29.7, 42, 5)).toBe(2);
  });

  it("70×100 is blocked in both orientations", () => {
    expect(sheets(70, 100, 1)).toBe("does_not_fit");
    expect(lfSheetItemFits(70, 100, A1)).toBe(false);
    expect(lfSheetItemFits(100, 70, A1)).toBe(false);
    expect(lfSheetDoesNotFitRu(A1)).toBe("Не помещается на лист 61×86");
  });

  it("an item wider than the sheet but fitting lengthwise is rotated", () => {
    expect(lfSheetItemFits(80, 50, A1)).toBe(true);
    const r = packLfSheets({ itemWidthCm: 80, itemHeightCm: 50, quantity: 1, sheet: A1 });
    expect(r.ok && r.layout.placements[0]!.rotated).toBe(true);
  });

  it("small items share a sheet; mixed orientations are used", () => {
    // 20×30 on 60×85: 3 × 2 standing (60×60) + 2 lying in the 25 cm left (each 30×20) → 8.
    const r = packLfSheets({ itemWidthCm: 20, itemHeightCm: 30, quantity: 9, sheet: A1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.perSheet).toBe(8);
    expect(r.layout.sheetsCount).toBe(2);
    expect(r.layout.placements).toHaveLength(9);
    expect(r.layout.placements.filter((p) => p.sheet === 1)).toHaveLength(1);
  });

  it("placements stay inside the printable area and do not overlap", () => {
    const r = packLfSheets({ itemWidthCm: 20, itemHeightCm: 30, quantity: 8, sheet: A1 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const ps = r.layout.placements;
    for (const p of ps) {
      expect(p.xCm).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(p.yCm).toBeGreaterThanOrEqual(0.5 - 1e-9);
      expect(p.xCm + p.widthCm).toBeLessThanOrEqual(60.5 + 1e-9);
      expect(p.yCm + p.heightCm).toBeLessThanOrEqual(85.5 + 1e-9);
    }
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i]!;
        const b = ps[j]!;
        const overlap =
          a.xCm < b.xCm + b.widthCm - 1e-9 &&
          b.xCm < a.xCm + a.widthCm - 1e-9 &&
          a.yCm < b.yCm + b.heightCm - 1e-9 &&
          b.yCm < a.yCm + a.heightCm - 1e-9;
        expect(overlap).toBe(false);
      }
    }
  });

  it("rejects bad input and over-large runs", () => {
    expect(sheets(0, 10, 1)).toBe("invalid");
    expect(sheets(10, 10, 0)).toBe("invalid");
    expect(sheets(10, 10, 100_000)).toBe("quantity_too_large");
  });
});

describe("labels", () => {
  it("names the 61×86 trade sheet A1 and pluralises in Russian", () => {
    expect(lfSheetFormatLabel(A1)).toBe("A1");
    expect(lfSheetFormatLabel({ sheetWidthCm: 50, sheetHeightCm: 70 })).toBe("50×70");
    expect(lfSheetsCountRu(1, A1)).toBe("1 лист A1");
    expect(lfSheetsCountRu(3, A1)).toBe("3 листа A1");
    expect(lfSheetsCountRu(5, A1)).toBe("5 листов A1");
    expect(lfSheetsCountRu(12, A1)).toBe("12 листов A1");
    expect(lfSheetsCountRu(22, A1)).toBe("22 листа A1");
  });
});

describe("sheet pricing", () => {
  const prod = { lfRetailMarkupMultiplier: 2.5, lfDealerMarkupMultiplier: 1.8 };
  const base = { retailPricePerSheet: null, dealerPricePerSheet: null, avgCostPerSheet: 20, catalogCostPerSheet: 15 };

  it("manual price per sheet wins", () => {
    const m = { ...base, retailPricePerSheet: 80, dealerPricePerSheet: 60 };
    expect(resolveLfSellPricePerSheetMdl({ material: m, production: prod, customerType: "retail" })).toBe(80);
    expect(resolveLfSellPricePerSheetMdl({ material: m, production: prod, customerType: "dealer" })).toBe(60);
  });

  it("empty price falls back to average cost × LF markup", () => {
    expect(resolveLfSellPricePerSheetMdl({ material: base, production: prod, customerType: "retail" })).toBe(50);
    expect(resolveLfSellPricePerSheetMdl({ material: base, production: prod, customerType: "dealer" })).toBe(36);
    // Before the first receipt: the manual cost hint.
    const noAvg = { ...base, avgCostPerSheet: null };
    expect(effectiveLfSheetCostMdl(noAvg)).toBe(15);
    expect(resolveLfSellPricePerSheetMdl({ material: noAvg, production: prod, customerType: "retail" })).toBe(38);
    // No price and no markup → not priced.
    expect(
      resolveLfSellPricePerSheetMdl({
        material: base,
        production: { lfRetailMarkupMultiplier: 0, lfDealerMarkupMultiplier: 0 },
        customerType: "retail",
      }),
    ).toBe(0);
  });

  it("line price = sheets × price per sheet; LF minimum still applies", () => {
    const p = computeLfSheetLinePricing({ sheetsCount: 3, pricePerSheetMdl: 80, costPerSheetMdl: 20 });
    expect(p).toMatchObject({ calculatedLinearMeters: 0, materialCost: 60, totalSellPrice: 240, estimatedProfit: 180 });
    const one = computeLfSheetLinePricing({ sheetsCount: 1, pricePerSheetMdl: 80, costPerSheetMdl: 20 });
    const lifted = applyLfMinimumLineSellTotalMdl(one, 150);
    expect(lifted.pricing.totalSellPrice).toBe(150);
    expect(lifted.upliftMdl).toBe(70);
  });

  it("size preset: preset × qty, cost still in sheets", () => {
    const p = computeLfSheetLinePricing({ sheetsCount: 2, pricePerSheetMdl: 80, costPerSheetMdl: 20 });
    const preset = applyLfSizePresetOverride({ pricing: p, presetPriceMdl: 45, quantity: 5 });
    expect(preset.totalSellPrice).toBe(225);
    expect(preset.materialCost).toBe(40);
  });
});

describe("sheet stock", () => {
  it("write-off quantity is whole sheets for sheet lines, metres for rolls", () => {
    expect(lfLineStockQuantity({ calculatedLinearMeters: 0, sheetLayout: { sheetsCount: 2 } })).toBe(2);
    expect(lfLineStockQuantity({ calculatedLinearMeters: 1.234 })).toBe(1.234);
    expect(lfLineStockQuantity(null)).toBe(0);
    const r = packLfSheets({ itemWidthCm: 29.7, itemHeightCm: 42, quantity: 5, sheet: A1 });
    expect(r.ok && lfLineStockQuantity({ calculatedLinearMeters: 0, sheetLayout: r.layout })).toBe(2);
  });

  it("receipt of sheets: weighted average per sheet", () => {
    // 10 sheets at 20 MDL on hand, 30 more bought for 750 MDL (VAT included) → 950 / 40 = 23.75.
    const plan = planReceipt({ currentStock: 10, avgCost: 20, purchaseCost: null, quantity: 30, totalCostMdl: 750 });
    expect(plan).toEqual({ newStock: 40, newAvgCost: 23.75 });
  });
});

describe("computeLfSheetLine (server resolve + wizard)", () => {
  const prodCfg = {
    lfRetailMarkupMultiplier: 2.5,
    lfDealerMarkupMultiplier: 1.8,
    lfMinimumLineTotalMdl: 100,
    inkMlPerSqmLargeFormatRoll: 10,
  };
  const material = { retailPricePerSheet: 80, dealerPricePerSheet: 60, avgCostPerSheet: 20, catalogCostPerSheet: 0 };

  it("5 × A3 retail: 2 sheets × 80 = 160, cost 2 sheets, ink as cost only", () => {
    const r = computeLfSheetLine({
      sheet: A1, material, production: prodCfg, avgInkCostPerMlMdl: 1,
      printWidthCm: 29.7, printHeightCm: 42, quantity: 5, customerType: "retail",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.sheetsCount).toBe(2);
    expect(r.pricing.totalSellPrice).toBe(160);
    expect(r.pricing.printSellPrice).toBe(0);
    expect(r.pricing.calculatedLinearMeters).toBe(0);
    expect(r.economics.materialPurchaseCostMdl).toBe(40);
    // 5 × 0.297 × 0.42 m² × 10 ml × 1 MDL ≈ 6 MDL ink.
    expect(r.economics.inkCostMdl).toBe(6);
    expect(r.pricing.estimatedProfit).toBe(160 - 46);
    expect(r.economics.writtenOffAreaSqm).toBeCloseTo(2 * 0.61 * 0.86, 6);
  });

  it("retail minimum lifts a single sheet; dealers are exempt", () => {
    const one = { sheet: A1, material, production: prodCfg, avgInkCostPerMlMdl: 0, printWidthCm: 59.4, printHeightCm: 84.1, quantity: 1 };
    const retail = computeLfSheetLine({ ...one, customerType: "retail" });
    const dealer = computeLfSheetLine({ ...one, customerType: "dealer" });
    expect(retail.ok && retail.pricing.totalSellPrice).toBe(100);
    expect(retail.ok && retail.minimumLineUpliftMdl).toBe(20);
    expect(dealer.ok && dealer.pricing.totalSellPrice).toBe(60);
  });

  it("size preset: preset × qty, no minimum, stock still in sheets", () => {
    const r = computeLfSheetLine({
      sheet: A1, material, production: prodCfg, avgInkCostPerMlMdl: 0,
      printWidthCm: 42, printHeightCm: 59.4, quantity: 3, customerType: "retail", presetUnitPriceMdl: 30,
    });
    expect(r.ok && r.pricing.totalSellPrice).toBe(90);
    expect(r.ok && r.layout.sheetsCount).toBe(2);
    expect(r.ok && lfLineStockQuantity({ sheetLayout: r.layout })).toBe(2);
  });

  it("70×100 is blocked", () => {
    const r = computeLfSheetLine({
      sheet: A1, material, production: prodCfg, avgInkCostPerMlMdl: 0,
      printWidthCm: 70, printHeightCm: 100, quantity: 1, customerType: "retail",
    });
    expect(r).toEqual({ ok: false, code: "does_not_fit" });
  });
});

describe("lfMaterialSheetSpec", () => {
  it("rolls and unsized sheet materials have no spec", () => {
    expect(lfMaterialSheetSpec({ materialForm: "roll", sheetWidthCm: 61, sheetHeightCm: 86 })).toBeNull();
    expect(lfMaterialSheetSpec({ materialForm: "sheet", sheetWidthCm: null, sheetHeightCm: 86 })).toBeNull();
    expect(lfMaterialSheetSpec({ materialForm: "sheet", sheetWidthCm: "61.00", sheetHeightCm: "86.00", sheetMarginMm: 5 })).toEqual(A1);
  });
});

describe("lfSheetLineUnpriced", () => {
  it("no price per sheet and no preset → unpriced", () => {
    expect(lfSheetLineUnpriced({ pricePerSheetMdl: 0 })).toBe(true);
    expect(lfSheetLineUnpriced({ pricePerSheetMdl: 0 }, null)).toBe(true);
  });
  it("a price per sheet or a size preset prices the line", () => {
    expect(lfSheetLineUnpriced({ pricePerSheetMdl: 40 })).toBe(false);
    expect(lfSheetLineUnpriced({ pricePerSheetMdl: 0 }, 150)).toBe(false);
  });
  it("no manual price, no cost: price per sheet resolves to 0 even with a markup", () => {
    const res = computeLfSheetLine({
      sheet: { sheetWidthCm: 61, sheetHeightCm: 86, marginMm: 5 },
      material: { retailPricePerSheet: null, dealerPricePerSheet: null, avgCostPerSheet: null, catalogCostPerSheet: 0 },
      production: { lfRetailMarkupMultiplier: 2, lfDealerMarkupMultiplier: 1.5, lfMinimumLineTotalMdl: 100, inkMlPerSqmLargeFormatRoll: 0 },
      avgInkCostPerMlMdl: 0,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
      customerType: "retail",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(lfSheetLineUnpriced(res)).toBe(true);
  });
});
