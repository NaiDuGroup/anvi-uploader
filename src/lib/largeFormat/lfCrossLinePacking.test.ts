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
});
