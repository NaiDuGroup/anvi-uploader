import { describe, expect, it } from "vitest";
import {
  BUSINESS_CARD_HEIGHT_CM,
  BUSINESS_CARD_SHEET_HEIGHT_CM,
  BUSINESS_CARD_SHEET_WIDTH_CM,
  BUSINESS_CARD_WIDTH_CM,
} from "./businessCardConstants";
import {
  computeBusinessCardSheetLayout,
  sheetsForQuantity,
} from "./businessCardSheetLayout";

const STANDARD = {
  sheetWidthCm: BUSINESS_CARD_SHEET_WIDTH_CM,
  sheetHeightCm: BUSINESS_CARD_SHEET_HEIGHT_CM,
  cardWidthCm: BUSINESS_CARD_WIDTH_CM,
  cardHeightCm: BUSINESS_CARD_HEIGHT_CM,
} as const;

describe("computeBusinessCardSheetLayout", () => {
  it("fits 4 × 3 = 12 standard cards on A4+ by turning the card 90°", () => {
    const layout = computeBusinessCardSheetLayout(STANDARD);

    expect(layout.columns).toBe(4);
    expect(layout.rows).toBe(3);
    expect(layout.cardsPerSheet).toBe(12);
    expect(layout.rotated).toBe(true);
    expect(layout.slotWidthCm).toBeCloseTo(5.4, 6);
    expect(layout.slotHeightCm).toBeCloseTo(9.4, 6);
  });

  it("centres the printed block on the sheet", () => {
    const layout = computeBusinessCardSheetLayout(STANDARD);

    // 22.5 − 4 × 5.4 = 0.9 → 0.45 per side; 32 − 3 × 9.4 = 3.8 → 1.9 per side.
    expect(layout.marginXCm).toBeCloseTo(0.45, 6);
    expect(layout.marginYCm).toBeCloseTo(1.9, 6);

    const first = layout.placements[0]!;
    expect(first.xCm).toBeCloseTo(0.45, 6);
    expect(first.yCm).toBeCloseTo(1.9, 6);

    const last = layout.placements[layout.placements.length - 1]!;
    expect(last.xCm + last.widthCm).toBeCloseTo(
      STANDARD.sheetWidthCm - layout.marginXCm,
      6,
    );
    expect(last.yCm + last.heightCm).toBeCloseTo(
      STANDARD.sheetHeightCm - layout.marginYCm,
      6,
    );
  });

  it("emits every slot in reading order with no overlap", () => {
    const layout = computeBusinessCardSheetLayout(STANDARD);

    expect(layout.placements).toHaveLength(12);
    expect(layout.placements.map((p) => p.tileId)).toEqual([
      "card-1",
      "card-2",
      "card-3",
      "card-4",
      "card-5",
      "card-6",
      "card-7",
      "card-8",
      "card-9",
      "card-10",
      "card-11",
      "card-12",
    ]);

    // Row-major: the 5th slot starts a new row back at the left margin.
    expect(layout.placements[4]!.xCm).toBeCloseTo(layout.marginXCm, 6);
    expect(layout.placements[4]!.yCm).toBeCloseTo(layout.marginYCm + 9.4, 6);
  });

  it("stays inside the sheet", () => {
    const layout = computeBusinessCardSheetLayout(STANDARD);

    for (const p of layout.placements) {
      expect(p.xCm).toBeGreaterThanOrEqual(0);
      expect(p.yCm).toBeGreaterThanOrEqual(0);
      expect(p.xCm + p.widthCm).toBeLessThanOrEqual(STANDARD.sheetWidthCm + 1e-6);
      expect(p.yCm + p.heightCm).toBeLessThanOrEqual(STANDARD.sheetHeightCm + 1e-6);
    }
  });

  it("registers on the reverse side: mirroring x maps onto another slot", () => {
    const layout = computeBusinessCardSheetLayout(STANDARD);
    const xs = layout.placements.map((p) => p.xCm);

    for (const p of layout.placements) {
      const mirroredX = STANDARD.sheetWidthCm - p.xCm - p.widthCm;
      expect(xs.some((x) => Math.abs(x - mirroredX) < 1e-6)).toBe(true);
    }
  });

  it("keeps the upright orientation when it fits more", () => {
    // 10 × 10 sheet, 9 × 2 card: upright 1 × 5 = 5, turned 5 × 1 = 5 → tie, upright wins.
    const tie = computeBusinessCardSheetLayout({
      sheetWidthCm: 10,
      sheetHeightCm: 10,
      cardWidthCm: 9,
      cardHeightCm: 2,
    });
    expect(tie.rotated).toBe(false);
    expect(tie.cardsPerSheet).toBe(5);

    // 20 × 10 sheet, 9 × 4 card: upright 2 × 2 = 4, turned 5 × 1 = 5 → turned wins.
    const turned = computeBusinessCardSheetLayout({
      sheetWidthCm: 20,
      sheetHeightCm: 10,
      cardWidthCm: 9,
      cardHeightCm: 4,
    });
    expect(turned.rotated).toBe(true);
    expect(turned.cardsPerSheet).toBe(5);
  });

  it("honours a gap between cards, re-deciding the orientation", () => {
    const layout = computeBusinessCardSheetLayout({ ...STANDARD, gapCm: 0.5 });

    // A 0.5 gap costs the turned grid a column (4 × 5.4 + 3 × 0.5 = 23.1 > 22.5),
    // leaving 3 × 3 = 9, so the upright 2 × 5 = 10 grid now wins.
    expect(layout.rotated).toBe(false);
    expect(layout.columns).toBe(2);
    expect(layout.rows).toBe(5);
    expect(layout.placements[1]!.xCm - layout.placements[0]!.xCm).toBeCloseTo(9.9, 6);
  });

  it("reports zero when the card does not fit", () => {
    const layout = computeBusinessCardSheetLayout({
      sheetWidthCm: 5,
      sheetHeightCm: 5,
      cardWidthCm: 9.4,
      cardHeightCm: 5.4,
    });

    expect(layout.cardsPerSheet).toBe(0);
    expect(layout.placements).toEqual([]);
  });
});

describe("sheetsForQuantity", () => {
  it("rounds up to whole sheets", () => {
    expect(sheetsForQuantity(96, 12)).toBe(8);
    expect(sheetsForQuantity(97, 12)).toBe(9);
    expect(sheetsForQuantity(1, 12)).toBe(1);
    expect(sheetsForQuantity(12, 12)).toBe(1);
  });

  it("returns 0 for degenerate input", () => {
    expect(sheetsForQuantity(0, 12)).toBe(0);
    expect(sheetsForQuantity(96, 0)).toBe(0);
  });
});
