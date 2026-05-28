import { describe, expect, it } from "vitest";
import { lfLineSummaryPartsFromRaw } from "./lfLineSummaryLabel";

describe("lfLineSummaryPartsFromRaw", () => {
  it("returns null for invalid input", () => {
    expect(lfLineSummaryPartsFromRaw(null)).toBeNull();
    expect(lfLineSummaryPartsFromRaw({})).toBeNull();
  });

  it("extracts material, size and quantity from frozen line JSON", () => {
    expect(
      lfLineSummaryPartsFromRaw({
        materialSnapshot: { name: "Panza din bumbac 1.07*20m" },
        printWidthCm: 60,
        printHeightCm: 90,
        quantity: 2,
      }),
    ).toEqual({
      materialName: "Panza din bumbac 1.07*20m",
      widthCm: 60,
      heightCm: 90,
      quantity: 2,
    });
  });
});
