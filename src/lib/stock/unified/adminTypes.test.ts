import { describe, expect, it } from "vitest";
import { itemStockSummary, localizedStockName } from "./adminTypes";

describe("localizedStockName", () => {
  const row = { nameRo: "Șosete", nameRu: "Носки", nameEn: "Socks" };

  it("picks the UI language", () => {
    expect(localizedStockName(row, "ru")).toBe("Носки");
    expect(localizedStockName(row, "ro")).toBe("Șosete");
    expect(localizedStockName(row, "en")).toBe("Socks");
  });

  it("falls back when the translation is blank", () => {
    expect(localizedStockName({ ...row, nameEn: " " }, "en")).toBe("Șosete");
  });
});

describe("itemStockSummary", () => {
  it("sums stock and weights cost by stock on hand", () => {
    // 10 × 20 + 30 × 40 = 1400 / 40 = 35
    expect(
      itemStockSummary([
        { stockQuantity: 10, avgCost: 20, purchaseCost: null },
        { stockQuantity: 30, avgCost: 40, purchaseCost: null },
      ]),
    ).toEqual({ totalStock: 40, avgCost: 35 });
  });

  it("uses the cost hint and a plain mean when nothing is on hand", () => {
    expect(
      itemStockSummary([
        { stockQuantity: 0, avgCost: null, purchaseCost: 10 },
        { stockQuantity: 0, avgCost: 20, purchaseCost: null },
      ]),
    ).toEqual({ totalStock: 0, avgCost: 15 });
  });

  it("returns null cost when none is known", () => {
    expect(itemStockSummary([{ stockQuantity: 3, avgCost: null, purchaseCost: null }])).toEqual({
      totalStock: 3,
      avgCost: null,
    });
  });
});
