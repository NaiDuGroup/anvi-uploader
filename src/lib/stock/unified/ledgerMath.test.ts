import { describe, expect, it } from "vitest";
import {
  movementCostMdl,
  planReceipt,
  planReceiptCostCorrection,
  planReceiptReversal,
  roundQty,
} from "./ledgerMath";

describe("planReceipt", () => {
  it("uses the purchase price for the first receipt", () => {
    expect(planReceipt({ currentStock: 0, avgCost: null, purchaseCost: null, quantity: 10, totalCostMdl: 250 }))
      .toEqual({ newStock: 10, newAvgCost: 25 });
  });

  it("blends the remaining stock with the new batch", () => {
    // 10 × 20 + 30 × 40 = 1400 over 40 units → 35
    expect(planReceipt({ currentStock: 10, avgCost: 20, purchaseCost: null, quantity: 30, totalCostMdl: 1200 }))
      .toEqual({ newStock: 40, newAvgCost: 35 });
  });

  it("falls back to the manual cost hint before the first receipt", () => {
    // 10 × 18 (hint) + 10 × 22 = 400 over 20 → 20
    expect(planReceipt({ currentStock: 10, avgCost: null, purchaseCost: 18, quantity: 10, totalCostMdl: 220 }).newAvgCost)
      .toBe(20);
  });

  it("ignores negative stock in the blend", () => {
    expect(planReceipt({ currentStock: -5, avgCost: 10, purchaseCost: null, quantity: 10, totalCostMdl: 300 }))
      .toEqual({ newStock: 5, newAvgCost: 30 });
  });

  it("keeps fractional quantities to 3 decimals", () => {
    expect(planReceipt({ currentStock: 0.1, avgCost: 100, purchaseCost: null, quantity: 0.2, totalCostMdl: 20 }).newStock)
      .toBe(0.3);
  });

  it("rejects zero quantity", () => {
    expect(() => planReceipt({ currentStock: 0, avgCost: null, purchaseCost: null, quantity: 0, totalCostMdl: 10 }))
      .toThrow();
  });
});

describe("planReceiptReversal", () => {
  it("takes the receipt value back out of the pool", () => {
    // pool 40 @ 35 = 1400; remove 30 for 1200 → 10 @ 20
    expect(planReceiptReversal({ currentStock: 40, avgCost: 35, receiptQuantity: 30, receiptTotalMdl: 1200 }))
      .toEqual({ newStock: 10, newAvgCost: 20 });
  });

  it("keeps the average when the pool empties", () => {
    expect(planReceiptReversal({ currentStock: 10, avgCost: 25, receiptQuantity: 10, receiptTotalMdl: 250 }))
      .toEqual({ newStock: 0, newAvgCost: 25 });
  });

  it("never returns a negative average", () => {
    expect(planReceiptReversal({ currentStock: 20, avgCost: 1, receiptQuantity: 10, receiptTotalMdl: 500 }).newAvgCost)
      .toBe(0);
  });
});

describe("planReceiptCostCorrection", () => {
  it("re-prices the share of stock that came from the receipt", () => {
    // 10 units in stock, all from a 10-unit receipt re-priced 200 → 300: +10 per unit
    expect(planReceiptCostCorrection({ currentStock: 10, avgCost: 20, receiptQuantity: 10, oldTotalMdl: 200, newTotalMdl: 300 }))
      .toBe(30);
  });

  it("applies only part of the change when the pool is larger than the receipt", () => {
    // receipt is half of the pool: +10 per receipt unit × 0.5 share = +5
    expect(planReceiptCostCorrection({ currentStock: 20, avgCost: 20, receiptQuantity: 10, oldTotalMdl: 200, newTotalMdl: 300 }))
      .toBe(25);
  });
});

describe("movementCostMdl", () => {
  it("prices a movement at the average cost", () => {
    expect(movementCostMdl(3, 12.345, null)).toBe(37.04);
  });

  it("uses the absolute quantity for outgoing movements", () => {
    expect(movementCostMdl(-2, 10, null)).toBe(20);
  });

  it("falls back to the hint and returns null when nothing is known", () => {
    expect(movementCostMdl(2, null, 7.5)).toBe(15);
    expect(movementCostMdl(2, null, null)).toBeNull();
  });
});

describe("roundQty", () => {
  it("rounds to 3 decimals", () => {
    expect(roundQty(0.1 + 0.2)).toBe(0.3);
  });
});

describe("roundQty precision", () => {
  it("keeps one toner sheet (1/33 000 cartridge) instead of rounding to zero", () => {
    expect(roundQty(1 / 33000)).toBe(0.00003);
    expect(roundQty(250 / 33000)).toBe(0.007576);
  });
});
