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

/**
 * Cheapest-by-total-sell path — parameterised by supplying resolved sell
 * rates on every family member. Mirrors the server-side
 * `pickCheapestFamilyRollForTiles` used for family group billing.
 */
describe("resolveFamilyPreviewMaterial (cheapest-total-sell)", () => {
  // Rates chosen so wider rolls cost more per LM but can produce dramatically
  // shorter total roll length via better packing.
  const priced105 = {
    ...matt105,
    printableWidthMeters: "1.00", // 100 cm printable — 40cm tiles: 2 across
    effectiveRetailPricePerLinearMeter: 10,
    effectiveDealerPricePerLinearMeter: 8,
  };
  const priced127 = {
    ...matt127, // 122 cm printable — 40cm tiles: 3 across
    effectiveRetailPricePerLinearMeter: 13,
    effectiveDealerPricePerLinearMeter: 10.4,
  };
  const priced162 = {
    ...matt162, // 157 cm printable — 40cm tiles: 3 across (same as 1.27)
    effectiveRetailPricePerLinearMeter: 17,
    effectiveDealerPricePerLinearMeter: 13.6,
  };
  const pricedCatalog = [priced105, priced127, priced162];

  it("2× 50×50 → picks 1.27 (cheapest total sell, not narrowest)", () => {
    // With 1cm inter-tile gap each tile is effectively 51cm wide.
    // 1.05 printable 100cm: 51+51 = 102 > 100 → 1 tile per row → 2 rows → 1.02m
    //   1.02 × 10 = 10.2 MDL
    // 1.27 printable 122cm: 102 ≤ 122 → 2 tiles per row → 1 row → 0.51m
    //   0.51 × 13 = 6.63 MDL  ← winner
    // 1.62 printable 157cm: same 2 per row (3rd would need 153) → 0.51m
    //   0.51 × 17 = 8.67 MDL
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 50,
      printHeightCm: 50,
      quantity: 2,
      customerType: "retail",
    });
    expect(mat?.id).toBe("prod-127");
  });

  it("3× 40×40 → picks 1.62 (packs 3-per-row, offsets higher per-LM)", () => {
    // Inflated tile = 41cm. Row fit: 1.05→2, 1.27→2 (41×3=123>122), 1.62→3.
    // 1.05: 2 rows (2+1) → 0.82m × 10 = 8.20
    // 1.27: 2 rows (2+1) → 0.82m × 13 = 10.66
    // 1.62: 1 row (3+0)  → 0.41m × 17 = 6.97  ← winner
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 40,
      printHeightCm: 40,
      quantity: 3,
      customerType: "retail",
    });
    expect(mat?.id).toBe("prod-162");
  });

  it("single 30×40 → picks 1.05 (narrowest cheapest per-LM)", () => {
    // Single tile: same LM on any roll (~0.41m). Narrowest per-LM wins.
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 30,
      printHeightCm: 40,
      quantity: 1,
      customerType: "retail",
    });
    expect(mat?.id).toBe("seed-105");
  });

  it("single 100×30 → picks 1.27 (rotation gives 0.30m vs 1.00m on 1.05)", () => {
    // 1.05 printable 100cm: 100cm can't rotate (would need 100cm across), so
    //   fits along → 1.00m × 10 = 10.0 MDL
    // 1.27 printable 122cm: 100cm rotates across → 0.30m × 13 = 3.9 MDL
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 100,
      printHeightCm: 30,
      quantity: 1,
      customerType: "retail",
    });
    expect(mat?.id).toBe("prod-127");
  });

  it("100×100 → picks the only fitting roll (1.27)", () => {
    // 1.05 printable 100cm: 100cm just fits (equal) — this is fine.
    // Actually 100cm printable and 100cm tile is tight but fits.
    // Let's use 110×100 instead: 110>100 both ways → only 1.27+ fit.
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 110,
      printHeightCm: 100,
      quantity: 1,
      customerType: "retail",
    });
    // 1.27 fits (122 across, 110<122); LM = 1.00m; sell = 13
    // 1.62 fits (157 across); LM = 1.00m; sell = 17
    // 1.27 wins.
    expect(mat?.id).toBe("prod-127");
  });

  it("dealer rates track dealer picker", () => {
    // 2× 50×50 with dealer rates 8/10.4/13.6 (LM: 1.02 / 0.51 / 0.51):
    //   1.05: 1.02 × 8 = 8.16
    //   1.27: 0.51 × 10.4 = 5.30  ← winner
    //   1.62: 0.51 × 13.6 = 6.94
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 50,
      printHeightCm: 50,
      quantity: 2,
      customerType: "dealer",
    });
    expect(mat?.id).toBe("prod-127");
  });

  it("without customerType (no rates) → falls back to narrowest sufficient", () => {
    // Same 2× 50×50 without customerType → legacy pickBillingRoll path.
    // Narrowest sufficient (1.05) is picked despite worse packing.
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: pricedCatalog,
      printWidthCm: 50,
      printHeightCm: 50,
      quantity: 2,
      // no customerType
    });
    expect(mat?.id).toBe("seed-105");
  });

  it("public-catalog shape (sellPricePerLinearMeter, no customerType) → cheapest", () => {
    // Cabinet flow: server pre-resolves single sell rate per material.
    // 2× 50×50, rates 10/13/17: same math as retail above → 1.27 wins.
    const publicCatalog = [
      { ...matt105, printableWidthMeters: "1.00", sellPricePerLinearMeter: 10 },
      { ...matt127, sellPricePerLinearMeter: 13 },
      { ...matt162, sellPricePerLinearMeter: 17 },
    ];
    const mat = resolveFamilyPreviewMaterial({
      selectionValue: "family:ORACAL MATT",
      materials: publicCatalog,
      printWidthCm: 50,
      printHeightCm: 50,
      quantity: 2,
      // no customerType — but sellPricePerLinearMeter present
    });
    expect(mat?.id).toBe("prod-127");
  });
});
