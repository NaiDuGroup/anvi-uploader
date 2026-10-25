import { describe, expect, it } from "vitest";
import { StockUnit } from "./kinds";
import { formatQuantity, parseQuantityInput, quantityProblem, sanitizeQuantityInput } from "./quantity";

describe("quantityProblem", () => {
  it("requires whole numbers for pieces and sheets", () => {
    expect(quantityProblem(3, StockUnit.Pieces)).toBeNull();
    expect(quantityProblem(1.5, StockUnit.Pieces)).toBe("must_be_whole");
    expect(quantityProblem(2.5, StockUnit.Sheets)).toBe("must_be_whole");
  });

  it("allows up to 3 decimals for m / ml / g", () => {
    expect(quantityProblem(1.25, StockUnit.Meters)).toBeNull();
    expect(quantityProblem(0.123, StockUnit.Milliliters)).toBeNull();
    expect(quantityProblem(0.1234, StockUnit.Grams)).toBe("too_many_decimals");
  });

  it("rejects zero unless allowed, negatives and non-numbers", () => {
    expect(quantityProblem(0, StockUnit.Pieces)).toBe("not_positive");
    expect(quantityProblem(0, StockUnit.Pieces, { allowZero: true })).toBeNull();
    expect(quantityProblem(-1, StockUnit.Meters)).toBe("negative");
    expect(quantityProblem(Number.NaN, StockUnit.Meters)).toBe("not_a_number");
    expect(quantityProblem(1e9, StockUnit.Pieces)).toBe("too_large");
  });
});

describe("quantity inputs", () => {
  it("sanitizes by unit", () => {
    expect(sanitizeQuantityInput("12.5x", StockUnit.Pieces)).toBe("125");
    expect(sanitizeQuantityInput("1,23456", StockUnit.Meters)).toBe("1.234");
  });

  it("parses with the unit rules", () => {
    expect(parseQuantityInput("12", StockUnit.Pieces)).toBe(12);
    expect(parseQuantityInput("1.5", StockUnit.Pieces)).toBeNull();
    expect(parseQuantityInput("1,5", StockUnit.Meters)).toBe(1.5);
    expect(parseQuantityInput("", StockUnit.Meters)).toBeNull();
    expect(parseQuantityInput("0", StockUnit.Pieces)).toBeNull();
    expect(parseQuantityInput("0", StockUnit.Pieces, { allowZero: true })).toBe(0);
  });

  it("formats without float noise", () => {
    expect(formatQuantity(0.1 + 0.2)).toBe("0.3");
    expect(formatQuantity(5)).toBe("5");
  });
});
