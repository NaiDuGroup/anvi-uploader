import { describe, expect, it } from "vitest";
import { mugOrderStockQuantityFromFiles } from "./mugOrderStockQuantity";

describe("mugOrderStockQuantityFromFiles", () => {
  it("sums copies across files", () => {
    expect(
      mugOrderStockQuantityFromFiles([{ copies: 2 }, { copies: 3 }]),
    ).toBe(5);
  });

  it("treats sum 0 as 1", () => {
    expect(mugOrderStockQuantityFromFiles([{ copies: 0 }])).toBe(1);
    expect(mugOrderStockQuantityFromFiles([])).toBe(1);
  });

  it("ignores negative copies in the sum", () => {
    expect(mugOrderStockQuantityFromFiles([{ copies: -2 }, { copies: 3 }])).toBe(3);
  });
});
