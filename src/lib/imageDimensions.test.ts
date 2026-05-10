import { describe, expect, it } from "vitest";
import { validateLayoutSize } from "./imageDimensions";

describe("imageDimensions.validateLayoutSize", () => {
  const expected = { width: 2480, height: 1134 };

  it("accepts an exact match", () => {
    expect(validateLayoutSize(expected, expected).ok).toBe(true);
  });

  it("accepts a ±2 % drift on both axes", () => {
    expect(
      validateLayoutSize(
        { width: 2480 + 49, height: 1134 - 22 },
        expected,
      ).ok,
    ).toBe(true);
  });

  it("rejects when one axis is well over the tolerance", () => {
    const result = validateLayoutSize(
      { width: 3000, height: 1134 },
      expected,
    );
    expect(result.ok).toBe(false);
    expect(result.actual).toEqual({ width: 3000, height: 1134 });
    expect(result.expected).toEqual(expected);
  });

  it("respects a custom tolerance", () => {
    const within = validateLayoutSize(
      { width: 2604, height: 1190 }, // ~5 % drift
      expected,
      0.05,
    );
    expect(within.ok).toBe(true);

    const outside = validateLayoutSize(
      { width: 2604, height: 1190 },
      expected,
      0.02,
    );
    expect(outside.ok).toBe(false);
  });

  it("treats a zero-expected axis as invalid (defensive)", () => {
    expect(
      validateLayoutSize(
        { width: 100, height: 100 },
        { width: 0, height: 100 },
      ).ok,
    ).toBe(false);
  });
});
