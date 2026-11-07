import { describe, expect, it } from "vitest";
import {
  applyManualSheetLinePrice,
  priceEditedSheetLine,
  storedManualSheetLineTotalMdl,
  withoutManualSheetLinePrice,
} from "./manualSheetLinePrice";
import type { BusinessCardLineData } from "./types";

/** A sticker-like sheet line: 10 sheets, calculated 250 MDL, paper 40 MDL. */
const LINE: BusinessCardLineData = {
  paperSnapshot: {
    id: "paper-1",
    name: "Самоклейка",
    sheetWidthCm: 32,
    sheetHeightCm: 45,
    costPerSheet: 4,
    retailPricePerSheet: 25,
    dealerPricePerSheet: 24,
  },
  cardWidthCm: 5,
  cardHeightCm: 5,
  presetId: "custom",
  cardTrimWidthCm: 5,
  cardTrimHeightCm: 5,
  bleedCm: 0,
  sides: "one",
  quantity: 400,
  cardsPerSheet: 40,
  sheetsUsed: 10,
  customerType: "retail",
  layout: {
    algorithmVersion: 1,
    columns: 5,
    rows: 8,
    cardsPerSheet: 40,
    rotated: false,
    gapCm: 0.3,
    marginXCm: 1.2,
    marginYCm: 1.2,
    slotWidthCm: 5,
    slotHeightCm: 5,
  },
  pricePerSheetMdl: 25,
  totalSellPriceMdl: 250,
  paperCostMdl: 40,
  avgPaperCostPerSheetSnapshot: 4,
  estimatedProfitMdl: 210,
};

describe("manual sheet line price", () => {
  it("bills the manual total and keeps the calculated one for reference", () => {
    const out = applyManualSheetLinePrice(LINE, 500);
    expect(out.totalSellPriceMdl).toBe(500);
    expect(out.estimatedProfitMdl).toBe(460);
    expect(out.manualTotalSellPriceMdl).toBe(500);
    expect(out.computedTotalSellPriceMdl).toBe(250);
    expect(storedManualSheetLineTotalMdl(out)).toBe(500);
    // Per-sheet rate and cost stay the calculator's.
    expect(out.pricePerSheetMdl).toBe(25);
    expect(out.paperCostMdl).toBe(40);
  });

  it("null / absent leaves a calculated line untouched", () => {
    expect(applyManualSheetLinePrice(LINE, null)).toEqual(LINE);
    expect(applyManualSheetLinePrice(LINE, undefined)).toEqual(LINE);
    expect(storedManualSheetLineTotalMdl(LINE)).toBeNull();
  });

  it("clearing restores the calculated total and profit", () => {
    const manual = applyManualSheetLinePrice(LINE, 500);
    expect(withoutManualSheetLinePrice(manual)).toEqual(LINE);
    expect(applyManualSheetLinePrice(manual, null)).toEqual(LINE);
  });

  it("re-applying a manual price never takes the old manual figure as the calculated one", () => {
    const twice = applyManualSheetLinePrice(applyManualSheetLinePrice(LINE, 500), 90);
    expect(twice.totalSellPriceMdl).toBe(90);
    expect(twice.computedTotalSellPriceMdl).toBe(250);
  });

  it("rounds to bani and accepts 0", () => {
    expect(applyManualSheetLinePrice(LINE, 9.005).totalSellPriceMdl).toBe(9.01);
    expect(applyManualSheetLinePrice(LINE, 0).totalSellPriceMdl).toBe(0);
    expect(applyManualSheetLinePrice(LINE, -1)).toEqual(LINE);
  });
});

describe("priceEditedSheetLine (order edit)", () => {
  const stored = applyManualSheetLinePrice(LINE, 500);
  const repricedToday: BusinessCardLineData = { ...LINE, pricePerSheetMdl: 30, totalSellPriceMdl: 300, estimatedProfitMdl: 260 };

  it("staff resend the manual price: kept, calculated part stays as sold", () => {
    const out = priceEditedSheetLine(repricedToday, stored, 500);
    expect(out.totalSellPriceMdl).toBe(500);
    expect(out.computedTotalSellPriceMdl).toBe(250);
  });

  it("staff clear the field: back to the sold calculated price", () => {
    const out = priceEditedSheetLine(repricedToday, stored, null);
    expect(out.totalSellPriceMdl).toBe(250);
    expect(out.manualTotalSellPriceMdl).toBeUndefined();
    expect(out.computedTotalSellPriceMdl).toBeUndefined();
  });

  it("run changed with a manual price: the manual price stays, calculated = new run", () => {
    const bigger: BusinessCardLineData = { ...LINE, quantity: 800, sheetsUsed: 20, totalSellPriceMdl: 500, paperCostMdl: 80, estimatedProfitMdl: 420 };
    const out = priceEditedSheetLine(bigger, stored, 500);
    expect(out.totalSellPriceMdl).toBe(500);
    expect(out.computedTotalSellPriceMdl).toBe(500);
    expect(out.estimatedProfitMdl).toBe(420);
    expect(out.quantity).toBe(800);
  });

  it("no manual field (dealer edit): kept while the run is unchanged, dropped when it changes", () => {
    expect(priceEditedSheetLine(repricedToday, stored, undefined).totalSellPriceMdl).toBe(500);
    const bigger: BusinessCardLineData = { ...LINE, quantity: 800, sheetsUsed: 20, totalSellPriceMdl: 480 };
    const out = priceEditedSheetLine(bigger, stored, undefined);
    expect(out.totalSellPriceMdl).toBe(480);
    expect(out.manualTotalSellPriceMdl).toBeUndefined();
  });

  it("new line: manual price applied on top of the resolved price", () => {
    expect(priceEditedSheetLine(LINE, null, 120).totalSellPriceMdl).toBe(120);
    expect(priceEditedSheetLine(LINE, null, null)).toEqual(LINE);
  });
});
