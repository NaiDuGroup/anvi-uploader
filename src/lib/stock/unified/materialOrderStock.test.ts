import { describe, expect, it } from "vitest";
import {
  isWaitingForMaterial,
  planBacklogTake,
  splitHoldingByLine,
  type MaterialHolding,
} from "./materialOrderStock";

function holding(total: number, byLine: [string | null, number][]): MaterialHolding {
  return { total, byLine: new Map(byLine) };
}

describe("splitHoldingByLine", () => {
  it("returns per line when every movement has its line", () => {
    expect(splitHoldingByLine(holding(1.5, [["a", 1], ["b", 0.5]]))).toEqual([
      { orderLineId: "a", quantity: 1 },
      { orderLineId: "b", quantity: 0.5 },
    ]);
  });

  it("puts what has no line (legacy copies) on a line-less return, summing to the total", () => {
    const parts = splitHoldingByLine(holding(2, [["a", 0.7], [null, 1.3]]));
    expect(parts).toEqual([
      { orderLineId: "a", quantity: 0.7 },
      { orderLineId: null, quantity: 1.3 },
    ]);
    expect(parts.reduce((s, p) => s + p.quantity, 0)).toBeCloseTo(2, 9);
  });

  it("never returns more than the order holds (a line returned twice nets negative)", () => {
    const parts = splitHoldingByLine(holding(0.5, [["a", 1], ["b", -0.5]]));
    expect(parts).toEqual([{ orderLineId: "a", quantity: 0.5 }]);
  });
});

describe("planBacklogTake", () => {
  const lines = [
    { id: "l1", quantity: 0.7 },
    { id: "l2", quantity: 0.3 },
  ];

  it("takes each line's full need when nothing is held", () => {
    expect(planBacklogTake(lines, new Map(), 0)).toEqual([
      { orderLineId: "l1", quantity: 0.7 },
      { orderLineId: "l2", quantity: 0.3 },
    ]);
  });

  it("skips a line that already holds its metres (no double take)", () => {
    expect(planBacklogTake(lines, new Map([["l1", 0.7]]), 0)).toEqual([{ orderLineId: "l2", quantity: 0.3 }]);
  });

  it("counts holdings on another roll after a layout transfer and legacy holdings without a line", () => {
    // l1 sits on another roll (summed across variants by the caller), l2 is covered by a legacy sale.
    expect(planBacklogTake(lines, new Map([["l1", 0.7]]), 0.3)).toEqual([]);
    expect(planBacklogTake(lines, new Map(), 0.5)).toEqual([
      { orderLineId: "l1", quantity: 0.2 },
      { orderLineId: "l2", quantity: 0.3 },
    ]);
  });
});

describe("isWaitingForMaterial", () => {
  it("matches legacy lf_roll / sheet_paper entries by pricing row id", () => {
    const roll = { kind: "lf_roll", materialId: "mat-1", requestedLinearMeters: 1, stockAtOrder: 0 } as const;
    const paper = { kind: "sheet_paper", sheetPaperId: "pap-1", requestedSheets: 5, stockAtOrder: 0 } as const;
    expect(isWaitingForMaterial(roll, "roll", "mat-1", "var-1")).toBe(true);
    expect(isWaitingForMaterial(roll, "roll", "mat-2", "var-1")).toBe(false);
    expect(isWaitingForMaterial(roll, "sheet", "mat-1", "var-1")).toBe(false);
    expect(isWaitingForMaterial(paper, "sheet", "pap-1", "var-9")).toBe(true);
  });

  it("matches a stock_variant entry by variant id and ignores other kinds", () => {
    const v = { kind: "stock_variant", variantId: "var-1", label: "x", requestedQty: 1, stockAtOrder: 0 } as const;
    expect(isWaitingForMaterial(v, "roll", null, "var-1")).toBe(true);
    expect(isWaitingForMaterial(v, "roll", null, "var-2")).toBe(false);
    const mug = { kind: "mug", productId: "mat-1", requestedQty: 1, stockAtOrder: 0 } as const;
    expect(isWaitingForMaterial(mug, "roll", "mat-1", "var-1")).toBe(false);
  });
});
