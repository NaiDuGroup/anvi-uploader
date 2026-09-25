/**
 * Tests for material family UI grouping and preview roll resolution.
 */
import { describe, it, expect } from "vitest";
import {
  groupMaterialsForUi,
  resolveFamilyPreviewMaterial,
  selectionValueFromMaterialOrFamily,
  usesFamilyBilling,
} from "./lfMaterialFamilyUi";

const matt105 = {
  id: "seed-105",
  name: "ORACAL MATT 1.05*50m",
  rollWidthMeters: "1.05",
  printableWidthMeters: null as string | null,
  sortOrder: 0,
};
const matt127 = {
  id: "prod-127",
  name: "ORACAL MATT 1.27*50m",
  rollWidthMeters: "1.27",
  printableWidthMeters: "1.22",
  sortOrder: 0,
};
const matt162 = {
  id: "prod-162",
  name: "ORACAL MATT 1.62*50m",
  rollWidthMeters: "1.62",
  printableWidthMeters: "1.57",
  sortOrder: 0,
};
/** Seed duplicate of 1.05 without printable — prod copy preferred at same width. */
const matt105Prod = {
  id: "prod-105",
  name: "ORACAL MATT 1.05*50m",
  rollWidthMeters: "1.05",
  printableWidthMeters: "1.00",
  sortOrder: 1,
};

describe("groupMaterialsForUi", () => {
  it("collapses ORACAL MATT into a single family option", () => {
    const grouped = groupMaterialsForUi([matt105, matt127, matt162]);
    const families = grouped.filter((g) => g.type === "family");
    expect(families).toHaveLength(1);
    expect(families[0]).toMatchObject({
      type: "family",
      familyKey: "ORACAL MATT",
      displayName: "ORACAL MATT",
    });
    expect(selectionValueFromMaterialOrFamily(families[0]!)).toBe(
      "family:ORACAL MATT",
    );
  });

  it("prefers printable-set row as representative when duplicate widths", () => {
    const grouped = groupMaterialsForUi([matt105, matt105Prod, matt127]);
    const family = grouped.find((g) => g.type === "family");
    expect(family?.type).toBe("family");
    if (family?.type === "family") {
      expect(family.representative.id).toBe("prod-105");
    }
  });
});

describe("resolveFamilyPreviewMaterial", () => {
  const catalog = [matt105, matt127, matt162];

  it("120×140 resolves to 1.27 not the 1.05 representative", () => {
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: catalog,
      printWidthCm: 120,
      printHeightCm: 140,
      quantity: 1,
    });
    expect(mat?.id).toBe("prod-127");
    expect(mat?.id).not.toBe("seed-105");
    expect(Number(mat?.rollWidthMeters)).toBe(1.27);
  });

  it("without dims returns narrowest representative", () => {
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: catalog,
      printWidthCm: null,
      printHeightCm: null,
      quantity: 1,
    });
    expect(mat?.id).toBe("seed-105");
  });

  it("returns null when no family roll fits", () => {
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: catalog,
      printWidthCm: 200,
      printHeightCm: 180,
      quantity: 1,
    });
    expect(mat).toBeNull();
  });

  it("concrete material selection ignores family logic", () => {
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: `material:${matt162.id}`,
      materials: catalog,
      printWidthCm: 50,
      printHeightCm: 50,
      quantity: 1,
    });
    expect(mat?.id).toBe("prod-162");
  });
});

describe("usesFamilyBilling", () => {
  it("is true only for ORACAL MATT", () => {
    expect(usesFamilyBilling("ORACAL MATT")).toBe(true);
    expect(usesFamilyBilling("BANNER MATT")).toBe(false);
  });
});
