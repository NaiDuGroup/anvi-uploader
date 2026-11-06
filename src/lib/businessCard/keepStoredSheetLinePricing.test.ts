import { describe, expect, it } from "vitest";
import { keepStoredSheetLinePricing } from "./keepStoredSheetLinePricing";
import type { BusinessCardLineData } from "./types";

/** A retail line sold the old way: 9 sheets × 14 MDL (108 cards, 12 per sheet). */
const OLD: BusinessCardLineData = {
  paperSnapshot: {
    id: "paper-1",
    name: "Couche 300",
    sheetWidthCm: 32,
    sheetHeightCm: 45,
    costPerSheet: 3,
    retailPricePerSheet: 14,
    dealerPricePerSheet: 10,
  },
  cardWidthCm: 9.4,
  cardHeightCm: 5.4,
  presetId: "trim_90x50",
  cardTrimWidthCm: 9,
  cardTrimHeightCm: 5,
  bleedCm: 0.2,
  sides: "one",
  quantity: 108,
  cardsPerSheet: 12,
  sheetsUsed: 9,
  customerType: "retail",
  layout: {
    algorithmVersion: 1,
    columns: 3,
    rows: 4,
    cardsPerSheet: 12,
    rotated: false,
    gapCm: 0,
    marginXCm: 1,
    marginYCm: 1,
    slotWidthCm: 9.4,
    slotHeightCm: 5.4,
  },
  pricePerSheetMdl: 14,
  totalSellPriceMdl: 126,
  paperCostMdl: 27,
  avgPaperCostPerSheetSnapshot: 3,
  estimatedProfitMdl: 99,
};

/** The same run re-resolved today: shop price per card. */
const REPRICED: BusinessCardLineData = {
  ...OLD,
  paperSnapshot: { ...OLD.paperSnapshot, retailPricePerSheet: 15, costPerSheet: 3.2 },
  pricePerSheetMdl: 18,
  totalSellPriceMdl: 162,
  paperCostMdl: 28.8,
  avgPaperCostPerSheetSnapshot: 3.2,
  estimatedProfitMdl: 133.2,
  pricePerCardMdl: 1.5,
};

describe("keepStoredSheetLinePricing", () => {
  it("keeps the stored price, cost and paper snapshot when the run is unchanged", () => {
    const out = keepStoredSheetLinePricing(REPRICED, OLD);
    expect(out.totalSellPriceMdl).toBe(126);
    expect(out.pricePerSheetMdl).toBe(14);
    expect(out.paperCostMdl).toBe(27);
    expect(out.estimatedProfitMdl).toBe(99);
    expect(out.paperSnapshot.retailPricePerSheet).toBe(14);
    // The old line was billed per sheet: no per-card rate is invented.
    expect("pricePerCardMdl" in out).toBe(false);
  });

  it("treats a pre-preset row (footprint only) with the same size as unchanged", () => {
    const legacy: BusinessCardLineData = { ...OLD };
    delete legacy.presetId;
    delete legacy.cardTrimWidthCm;
    delete legacy.cardTrimHeightCm;
    delete legacy.bleedCm;
    expect(keepStoredSheetLinePricing(REPRICED, legacy).totalSellPriceMdl).toBe(126);
  });

  it.each([
    ["quantity", { quantity: 120, sheetsUsed: 10, totalSellPriceMdl: 180 }],
    ["sides", { sides: "two" as const, totalSellPriceMdl: 216 }],
    ["paper", { paperSnapshot: { ...REPRICED.paperSnapshot, id: "paper-2" } }],
    ["tier", { customerType: "dealer" as const, totalSellPriceMdl: 90 }],
    ["size", { cardTrimWidthCm: 8.5, cardTrimHeightCm: 5.5, cardWidthCm: 8.9, cardHeightCm: 5.9 }],
  ])("re-prices when the %s changes", (_label, patch) => {
    const next = { ...REPRICED, ...patch } as BusinessCardLineData;
    expect(keepStoredSheetLinePricing(next, OLD)).toBe(next);
  });

  it("prices a new line as resolved", () => {
    expect(keepStoredSheetLinePricing(REPRICED, null)).toBe(REPRICED);
  });
});
