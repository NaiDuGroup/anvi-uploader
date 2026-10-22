import { describe, it, expect } from "vitest";
import { correctedAverageCost } from "./correctReceiptCost";

describe("correctedAverageCost", () => {
  it("shifts the whole stock when only the corrected receipt remains", () => {
    // 30 m received provisionally at 90/m, invoice says 98.61/m; 20 m left.
    expect(
      correctedAverageCost({
        currentStock: 20,
        currentAvgCost: 90,
        receiptQuantity: 30,
        deltaTotalMdl: 30 * 8.61,
      }),
    ).toBeCloseTo(98.61, 4);
  });

  it("dilutes the correction over older stock", () => {
    // 100 units at avg 10; 50 of them came from the corrected receipt (+1/unit).
    expect(
      correctedAverageCost({
        currentStock: 100,
        currentAvgCost: 10,
        receiptQuantity: 50,
        deltaTotalMdl: 50,
      }),
    ).toBeCloseTo(10.5, 6);
  });

  it("leaves the average alone when nothing is in stock", () => {
    expect(
      correctedAverageCost({ currentStock: 0, currentAvgCost: 12, receiptQuantity: 5, deltaTotalMdl: 100 }),
    ).toBe(12);
  });
});
