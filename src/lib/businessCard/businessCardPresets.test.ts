import { describe, expect, it } from "vitest";
import {
  BUSINESS_CARD_BLEED_CM,
  BUSINESS_CARD_PRESETS,
  BUSINESS_CARD_SHEET_HEIGHT_CM,
  BUSINESS_CARD_SHEET_WIDTH_CM,
  isWholeSheetQuantity,
  layoutSizeFromTrim,
  snapQuantityToWholeSheets,
} from "./businessCardConstants";
import { computeBusinessCardSheetLayout } from "./businessCardSheetLayout";

const SHEET = {
  sheetWidthCm: BUSINESS_CARD_SHEET_WIDTH_CM,
  sheetHeightCm: BUSINESS_CARD_SHEET_HEIGHT_CM,
} as const;

function layoutForTrim(trimWidthCm: number, trimHeightCm: number) {
  return computeBusinessCardSheetLayout({
    ...SHEET,
    ...layoutSizeFromTrim(trimWidthCm, trimHeightCm),
  });
}

describe("layoutSizeFromTrim", () => {
  it("grows the trim size by the bleed on every side", () => {
    expect(BUSINESS_CARD_BLEED_CM).toBe(0.2);
    expect(layoutSizeFromTrim(9, 5)).toEqual({
      cardWidthCm: 9.4,
      cardHeightCm: 5.4,
    });
    expect(layoutSizeFromTrim(8.5, 5.5)).toEqual({
      cardWidthCm: 8.9,
      cardHeightCm: 5.9,
    });
  });

  it("keeps whole millimetres instead of float noise", () => {
    // 0.1 + 0.4 is 0.5000000000000001 in binary floating point.
    expect(layoutSizeFromTrim(8.1, 5.1).cardWidthCm).toBe(8.5);
  });
});

describe("preset imposition on A4+", () => {
  it("fits 12 of the 9 × 5 standard, turned 90°", () => {
    const layout = layoutForTrim(9, 5);

    expect(layout.cardsPerSheet).toBe(12);
    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(3);
    expect(layout.rotated).toBe(true);
  });

  /**
   * The bleed is what rules out a 4-column turned grid here: the 5.5 trim height
   * grows to 5.9, and four of those need 23.6 cm across a 22.5 cm sheet.
   */
  it("fits 10 of the 8.5 × 5.5 standard as 2 × 5, upright", () => {
    const layout = layoutForTrim(8.5, 5.5);

    expect(layout.cardsPerSheet).toBe(10);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(5);
    expect(layout.rotated).toBe(false);
  });

  it("would wrongly fit 12 of the 8.5 × 5.5 standard without the bleed", () => {
    const noBleed = computeBusinessCardSheetLayout({
      ...SHEET,
      cardWidthCm: 8.5,
      cardHeightCm: 5.5,
    });

    expect(noBleed.cardsPerSheet).toBe(12);
  });

  it("every preset fits the default sheet", () => {
    for (const preset of BUSINESS_CARD_PRESETS) {
      const layout = layoutForTrim(preset.trimWidthCm, preset.trimHeightCm);
      expect(layout.cardsPerSheet).toBeGreaterThan(0);
    }
  });
});

describe("snapQuantityToWholeSheets", () => {
  it("rounds up to the next full sheet", () => {
    expect(snapQuantityToWholeSheets(100, 12)).toBe(108);
    expect(snapQuantityToWholeSheets(100, 10)).toBe(100);
    expect(snapQuantityToWholeSheets(1, 12)).toBe(12);
    expect(snapQuantityToWholeSheets(13, 12)).toBe(24);
  });

  it("leaves exact multiples alone", () => {
    expect(snapQuantityToWholeSheets(120, 12)).toBe(120);
    expect(snapQuantityToWholeSheets(1000, 10)).toBe(1000);
  });

  it("treats a zero-capacity sheet as unchanged so callers can report the fit error", () => {
    expect(snapQuantityToWholeSheets(50, 0)).toBe(50);
  });
});

describe("isWholeSheetQuantity", () => {
  it("accepts only positive integer multiples", () => {
    expect(isWholeSheetQuantity(120, 12)).toBe(true);
    expect(isWholeSheetQuantity(100, 12)).toBe(false);
    expect(isWholeSheetQuantity(0, 12)).toBe(false);
    expect(isWholeSheetQuantity(12.5, 12)).toBe(false);
    expect(isWholeSheetQuantity(12, 0)).toBe(false);
  });
});
