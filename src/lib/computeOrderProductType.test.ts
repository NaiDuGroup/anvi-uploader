import { describe, it, expect } from "vitest";
import { computeOrderProductTypeFromLines } from "./computeOrderProductType";

describe("computeOrderProductTypeFromLines", () => {
  it("returns paper_print for empty lines", () => {
    expect(computeOrderProductTypeFromLines([])).toBe("paper_print");
  });

  it("returns single line type", () => {
    expect(
      computeOrderProductTypeFromLines([{ productType: "mug" }]),
    ).toBe("mug");
  });

  it("returns shared type when all lines match", () => {
    expect(
      computeOrderProductTypeFromLines([
        { productType: "notebook" },
        { productType: "notebook" },
      ]),
    ).toBe("notebook");
  });

  it("returns mixed when families differ", () => {
    expect(
      computeOrderProductTypeFromLines([
        { productType: "paper_print" },
        { productType: "mug" },
      ]),
    ).toBe("mixed");
  });

  it("returns large_format_print when all lines are LFP", () => {
    expect(
      computeOrderProductTypeFromLines([
        { productType: "large_format_print" },
        { productType: "large_format_print" },
      ]),
    ).toBe("large_format_print");
  });

  it("returns mixed when LFP is combined with another type", () => {
    expect(
      computeOrderProductTypeFromLines([
        { productType: "large_format_print" },
        { productType: "paper_print" },
      ]),
    ).toBe("mixed");
  });
});
