import { describe, it, expect } from "vitest";
import { InsufficientStockOrderError } from "./orderErrors";

describe("InsufficientStockOrderError", () => {
  it("carries requested and available", () => {
    const e = new InsufficientStockOrderError(100, 66);
    expect(e.code).toBe("insufficient_stock");
    expect(e.requested).toBe(100);
    expect(e.available).toBe(66);
    expect(e).toBeInstanceOf(Error);
  });
});
