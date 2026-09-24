import { describe, it, expect } from "vitest";
import { penOrderStockQuantityFromFiles } from "./penOrderStockQuantity";

describe("penOrderStockQuantityFromFiles", () => {
  it("sums file copies >= 1", () => {
    const files = [
      { copies: 2 },
      { copies: 3 },
      { copies: 1 },
    ];
    expect(penOrderStockQuantityFromFiles(files)).toBe(6);
  });

  it("enforces minimum 1 per file (never treats 0 as 0)", () => {
    const files = [
      { copies: 0 },
      { copies: 1 },
    ];
    expect(penOrderStockQuantityFromFiles(files)).toBe(2);
  });

  it("enforces minimum 1 for negative copies", () => {
    const files = [{ copies: -5 }];
    expect(penOrderStockQuantityFromFiles(files)).toBe(1);
  });

  it("returns 1 for empty files array", () => {
    expect(penOrderStockQuantityFromFiles([])).toBe(1);
  });

  it("returns minimum 1 even when all files have 0 copies", () => {
    const files = [
      { copies: 0 },
      { copies: 0 },
    ];
    expect(penOrderStockQuantityFromFiles(files)).toBe(2);
  });
});
