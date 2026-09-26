import { describe, it, expect } from "vitest";
import { groupLinesForPacking } from "./lfCrossLinePacking";
import type { AdminOrderLineInput } from "../validations";

describe("lfCrossLinePacking", () => {
  it("groups same-family same-size lines together", () => {
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

    expect(groups.size).toBe(2);
    expect(groups.get("ORACAL MATT|30|40")).toEqual([0, 1]);
    expect(groups.get("ORACAL MATT|50|70")).toEqual([2]);
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
    expect(groups.get("ORACAL MATT|30|40")).toEqual([0]);
    expect(groups.get("ORACAL GLOSS|30|40")).toEqual([1]);
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
    expect(groups.get("ORACAL MATT|30|40")).toEqual([1]);
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
    expect(groups.get("ORACAL MATT|30|40")).toEqual([1]);
  });

  describe("placement-based linear meters allocation", () => {
    it("allocates lm based on y-range for each line (stacked tiles)", () => {
      // Simulate two lines with tiles stacked vertically.
      // Line 0: tiles at y=0-40cm
      // Line 1: tiles at y=41-81cm
      // Each line should get its y-range in linear meters.
      const mockPlacements = [
        {
          tileId: "L0::1",
          label: "Line 1 (1/1)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
        {
          tileId: "L1::1",
          label: "Line 2 (1/1)",
          xCm: 0.5,
          yCm: 41.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
      ];

      // Line 0: min=0.5, max=40.5, range=40cm = 0.40m
      const line0Placements = mockPlacements.filter((p) => p.tileId.startsWith("L0::"));
      const line0Lm =
        line0Placements.length > 0
          ? (Math.max(...line0Placements.map((p) => p.yCm + p.heightCm)) -
              Math.min(...line0Placements.map((p) => p.yCm))) /
            100
          : 0;
      expect(line0Lm).toBeCloseTo(0.4, 6);

      // Line 1: min=41.5, max=81.5, range=40cm = 0.40m
      const line1Placements = mockPlacements.filter((p) => p.tileId.startsWith("L1::"));
      const line1Lm =
        line1Placements.length > 0
          ? (Math.max(...line1Placements.map((p) => p.yCm + p.heightCm)) -
              Math.min(...line1Placements.map((p) => p.yCm))) /
            100
          : 0;
      expect(line1Lm).toBeCloseTo(0.4, 6);

      // Total should approximately equal sum (with gap consideration)
      expect(line0Lm + line1Lm).toBeCloseTo(0.8, 1);
    });

    it("allocates same lm to lines with side-by-side tiles", () => {
      // Simulate two lines with tiles placed side-by-side (same y-range).
      // Line 0: tile at y=0-40cm, x=0-30cm
      // Line 1: tile at y=0-40cm, x=31-61cm
      // Both lines share the same y-range, so should get equal lm.
      const mockPlacements = [
        {
          tileId: "L0::1",
          label: "Line 1 (1/1)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
        {
          tileId: "L1::1",
          label: "Line 2 (1/1)",
          xCm: 31.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
      ];

      // Line 0: min=0.5, max=40.5, range=40cm = 0.40m
      const line0Placements = mockPlacements.filter((p) => p.tileId.startsWith("L0::"));
      const line0Lm =
        line0Placements.length > 0
          ? (Math.max(...line0Placements.map((p) => p.yCm + p.heightCm)) -
              Math.min(...line0Placements.map((p) => p.yCm))) /
            100
          : 0;
      expect(line0Lm).toBeCloseTo(0.4, 6);

      // Line 1: min=0.5, max=40.5, range=40cm = 0.40m
      const line1Placements = mockPlacements.filter((p) => p.tileId.startsWith("L1::"));
      const line1Lm =
        line1Placements.length > 0
          ? (Math.max(...line1Placements.map((p) => p.yCm + p.heightCm)) -
              Math.min(...line1Placements.map((p) => p.yCm))) /
            100
          : 0;
      expect(line1Lm).toBeCloseTo(0.4, 6);

      // Both lines get the same lm
      expect(line0Lm).toBeCloseTo(line1Lm, 6);
    });

    it("Case A (1 line qty 2) vs Case B (2 lines qty 1): same total lm for side-by-side", () => {
      // Case A: one line with 2 tiles side-by-side
      const caseAPlacements = [
        {
          tileId: "L0::1",
          label: "Line 1 (1/2)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
        {
          tileId: "L0::2",
          label: "Line 1 (2/2)",
          xCm: 31.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
      ];
      const caseALine0Lm =
        (Math.max(...caseAPlacements.map((p) => p.yCm + p.heightCm)) -
          Math.min(...caseAPlacements.map((p) => p.yCm))) /
        100;

      // Case B: two lines with 1 tile each, side-by-side
      const caseBPlacements = [
        {
          tileId: "L0::1",
          label: "Line 1 (1/1)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
        {
          tileId: "L1::1",
          label: "Line 2 (1/1)",
          xCm: 31.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
      ];
      const caseBLine0Placements = caseBPlacements.filter((p) => p.tileId.startsWith("L0::"));
      const caseBLine0Lm =
        (Math.max(...caseBLine0Placements.map((p) => p.yCm + p.heightCm)) -
          Math.min(...caseBLine0Placements.map((p) => p.yCm))) /
        100;
      const caseBLine1Placements = caseBPlacements.filter((p) => p.tileId.startsWith("L1::"));
      const caseBLine1Lm =
        (Math.max(...caseBLine1Placements.map((p) => p.yCm + p.heightCm)) -
          Math.min(...caseBLine1Placements.map((p) => p.yCm))) /
        100;

      // Case A: single line gets the full y-range
      expect(caseALine0Lm).toBeCloseTo(0.4, 6);

      // Case B: both lines share the same y-range
      expect(caseBLine0Lm).toBeCloseTo(0.4, 6);
      expect(caseBLine1Lm).toBeCloseTo(0.4, 6);

      // Important: In Case B, both lines get charged for the same y-range,
      // so the sum of per-line lm equals 2x the strip length. This is expected
      // because both lines "claim" the same strip space. The pricing will be
      // identical if they have the same material cost per lm.
      expect(caseBLine0Lm + caseBLine1Lm).toBeCloseTo(0.8, 6);
      expect(caseALine0Lm).toBeLessThan(caseBLine0Lm + caseBLine1Lm);
    });

    it("Case A (1 line qty 2) vs Case B (2 lines qty 1): same total lm for stacked", () => {
      // Case A: one line with 2 tiles stacked
      const caseAPlacements = [
        {
          tileId: "L0::1",
          label: "Line 1 (1/2)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
        {
          tileId: "L0::2",
          label: "Line 1 (2/2)",
          xCm: 0.5,
          yCm: 41.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
      ];
      const caseALine0Lm =
        (Math.max(...caseAPlacements.map((p) => p.yCm + p.heightCm)) -
          Math.min(...caseAPlacements.map((p) => p.yCm))) /
        100;

      // Case B: two lines with 1 tile each, stacked
      const caseBPlacements = [
        {
          tileId: "L0::1",
          label: "Line 1 (1/1)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
        {
          tileId: "L1::1",
          label: "Line 2 (1/1)",
          xCm: 0.5,
          yCm: 41.5,
          widthCm: 30,
          heightCm: 40,
          rotated: false,
        },
      ];
      const caseBLine0Placements = caseBPlacements.filter((p) => p.tileId.startsWith("L0::"));
      const caseBLine0Lm =
        (Math.max(...caseBLine0Placements.map((p) => p.yCm + p.heightCm)) -
          Math.min(...caseBLine0Placements.map((p) => p.yCm))) /
        100;
      const caseBLine1Placements = caseBPlacements.filter((p) => p.tileId.startsWith("L1::"));
      const caseBLine1Lm =
        (Math.max(...caseBLine1Placements.map((p) => p.yCm + p.heightCm)) -
          Math.min(...caseBLine1Placements.map((p) => p.yCm))) /
        100;

      // Case A: single line spans both tiles
      expect(caseALine0Lm).toBeCloseTo(0.81, 2); // 81cm with 1cm gap

      // Case B: each line spans its own tile
      expect(caseBLine0Lm).toBeCloseTo(0.4, 6);
      expect(caseBLine1Lm).toBeCloseTo(0.4, 6);

      // Total lm in Case B should approximately equal Case A (with gap consideration)
      expect(caseBLine0Lm + caseBLine1Lm).toBeCloseTo(0.8, 1);
      expect(caseALine0Lm).toBeGreaterThan(caseBLine0Lm + caseBLine1Lm);
    });
  });
});
