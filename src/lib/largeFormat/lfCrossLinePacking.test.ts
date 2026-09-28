import { describe, it, expect } from "vitest";
import { groupLinesForPacking } from "./lfCrossLinePacking";
import type { AdminOrderLineInput } from "../validations";

describe("lfCrossLinePacking", () => {
  it("groups all same-family lines together regardless of dimensions", () => {
    const lines: AdminOrderLineInput[] = [
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 50,
        printHeightCm: 70,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
    ];

    const groups = groupLinesForPacking(lines);

    expect(groups.size).toBe(1);
    expect(groups.get("ORACAL MATT::retail")).toEqual([0, 1, 2]);
  });

  it("separates lines with different families", () => {
    const lines: AdminOrderLineInput[] = [
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL GLOSS",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
    ];

    const groups = groupLinesForPacking(lines);

    expect(groups.size).toBe(2);
    expect(groups.get("ORACAL MATT::retail")).toEqual([0]);
    expect(groups.get("ORACAL GLOSS::retail")).toEqual([1]);
  });

  it("ignores lines without materialFamilyKey", () => {
    const lines: AdminOrderLineInput[] = [
      {
        productType: "large_format_print",
        largeFormatMaterialId: "mat-123",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
    ];

    const groups = groupLinesForPacking(lines);

    expect(groups.size).toBe(1);
    expect(groups.get("ORACAL MATT::retail")).toEqual([1]);
  });

  it("ignores non-LF lines", () => {
    const lines: AdminOrderLineInput[] = [
      {
        productType: "mug",
        mugProductId: "mug-123",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 30,
        printHeightCm: 40,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
    ];

    const groups = groupLinesForPacking(lines);

    expect(groups.size).toBe(1);
    expect(groups.get("ORACAL MATT::retail")).toEqual([1]);
  });

  it("separates same-family lines when customerType differs", () => {
    const lines: AdminOrderLineInput[] = [
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 20,
        printHeightCm: 20,
        quantity: 1,
        customerType: "dealer",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 20,
        printHeightCm: 20,
        quantity: 1,
        customerType: "retail",
        files: [],
      },
      {
        productType: "large_format_print",
        materialFamilyKey: "ORACAL MATT",
        printWidthCm: 90,
        printHeightCm: 90,
        quantity: 1,
        customerType: "dealer",
        files: [],
      },
    ];

    const groups = groupLinesForPacking(lines);

    expect(groups.size).toBe(2);
    expect(groups.get("ORACAL MATT::dealer")).toEqual([0, 2]);
    expect(groups.get("ORACAL MATT::retail")).toEqual([1]);
  });

  describe("proportional linear meters allocation", () => {
    /**
     * Helper: allocate totalLm across lines by tile area ratio.
     * Mirrors the production logic in resolveLargeFormatLineGroup.
     */
    function allocateProportionally(
      placements: Array<{ tileId: string; widthCm: number; heightCm: number }>,
      totalAlongCm: number,
      linePrefix: string,
    ): number {
      const totalArea = placements.reduce((s, p) => s + p.widthCm * p.heightCm, 0);
      const lineArea = placements
        .filter((p) => p.tileId.startsWith(linePrefix))
        .reduce((s, p) => s + p.widthCm * p.heightCm, 0);
      return totalArea > 0 ? (totalAlongCm / 100) * (lineArea / totalArea) : 0;
    }

    it("equal tiles side-by-side: each line gets half the total lm", () => {
      const placements = [
        { tileId: "L0::1", widthCm: 30, heightCm: 40 },
        { tileId: "L1::1", widthCm: 30, heightCm: 40 },
      ];
      const totalAlongCm = 41; // 40 + 1 gap

      const lm0 = allocateProportionally(placements, totalAlongCm, "L0::");
      const lm1 = allocateProportionally(placements, totalAlongCm, "L1::");

      expect(lm0).toBeCloseTo(0.205, 3);
      expect(lm1).toBeCloseTo(0.205, 3);
      expect(lm0 + lm1).toBeCloseTo(0.41, 3);
    });

    it("equal tiles stacked: each line gets half the total lm", () => {
      const placements = [
        { tileId: "L0::1", widthCm: 30, heightCm: 40 },
        { tileId: "L1::1", widthCm: 30, heightCm: 40 },
      ];
      const totalAlongCm = 81; // 40 + 1 + 40

      const lm0 = allocateProportionally(placements, totalAlongCm, "L0::");
      const lm1 = allocateProportionally(placements, totalAlongCm, "L1::");

      expect(lm0).toBeCloseTo(0.405, 3);
      expect(lm1).toBeCloseTo(0.405, 3);
      expect(lm0 + lm1).toBeCloseTo(0.81, 3);
    });

    it("Case A (1 line qty 2) vs Case B (2 lines qty 1): same total cost", () => {
      // Case A: one line with 2 tiles — gets 100% of total LM.
      const caseAPlacements = [
        { tileId: "L0::1", widthCm: 30, heightCm: 40 },
        { tileId: "L0::2", widthCm: 30, heightCm: 40 },
      ];
      const totalAlongCm = 41;
      const caseALm = allocateProportionally(caseAPlacements, totalAlongCm, "L0::");
      expect(caseALm).toBeCloseTo(0.41, 3);

      // Case B: two lines with 1 tile each — each gets 50%.
      const caseBPlacements = [
        { tileId: "L0::1", widthCm: 30, heightCm: 40 },
        { tileId: "L1::1", widthCm: 30, heightCm: 40 },
      ];
      const caseBLm0 = allocateProportionally(caseBPlacements, totalAlongCm, "L0::");
      const caseBLm1 = allocateProportionally(caseBPlacements, totalAlongCm, "L1::");

      // Sum of per-line lm in Case B equals Case A total (pricing is linear).
      expect(caseBLm0 + caseBLm1).toBeCloseTo(caseALm, 6);
    });

    it("mixed sizes: larger tile gets proportionally more lm", () => {
      // 30×40 (area 1200) + 50×70 (area 3500)
      const placements = [
        { tileId: "L0::1", widthCm: 30, heightCm: 40 },
        { tileId: "L1::1", widthCm: 50, heightCm: 70 },
      ];
      const totalAlongCm = 71; // 70 + 1 gap

      const lm0 = allocateProportionally(placements, totalAlongCm, "L0::");
      const lm1 = allocateProportionally(placements, totalAlongCm, "L1::");

      // 30×40 = 1200, 50×70 = 3500, total = 4700
      expect(lm0).toBeCloseTo(0.71 * (1200 / 4700), 3);
      expect(lm1).toBeCloseTo(0.71 * (3500 / 4700), 3);
      expect(lm1).toBeGreaterThan(lm0);
      expect(lm0 + lm1).toBeCloseTo(0.71, 3);
    });
  });
});
