/**
 * Golden tests for family-group billing math.
 *
 * These tests pin the exact per-line MDL numbers produced by
 * `computeLargeFormatLineGroupBilling` for a fixed set of rates + tiles. If
 * any downstream helper (packer, LM allocator, ink markup, group-minimum
 * uplift, cheapest-roll picker) drifts, the specific expectations here will
 * fail with `expected X, received Y` — giving a precise regression signal.
 *
 * Rates are synthetic (10 / 13 / 17 MDL/LM retail; markup 2 → dealer half of
 * retail) and unrelated to any production seed data so the tests stay
 * reproducible.  Add a real-rate parity test alongside when the production
 * catalog needs an independent smoke.
 */
import { describe, it, expect } from "vitest";
import type { LargeFormatMaterial } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import {
  computeLargeFormatLineGroupBilling,
  pickCheapestFamilyMaterialForTiles,
} from "./lfCrossLinePacking";

// ─── Fixtures ────────────────────────────────────────────────────────────────

function prod(p: Partial<ProductionCostsConfig> = {}): ProductionCostsConfig {
  return {
    mugPrintPerUnit: 0,
    notebookPrintPerUnit: 0,
    packagingPerOrder: 0,
    otherConsumablesPerOrder: 0,
    inkMlPerSqmLargeFormatRoll: 0,
    inkMlPerSqmUvRigid: 0,
    inkMlPerSqmDtfTextile: 0,
    minimumOrderPriceMdl: 0,
    lfMinimumLineTotalMdl: 0,
    lfRetailMarkupMultiplier: 0,
    lfDealerMarkupMultiplier: 0,
    lfInkRetailMarkupMultiplier: 0,
    lfInkDealerMarkupMultiplier: 0,
    bcMinimumLineTotalMdl: 0,
    ...p,
  };
}

/**
 * Build a `LargeFormatMaterial` row with rates that make the golden math
 * trivially checkable by hand.  `retailSellPerLm` / `dealerSellPerLm` populate
 * the unified `finalRetailPricePerLinearMeter` / `finalDealerPricePerLinearMeter`
 * — these are the "effective" sell rates used by the pricing engine.
 */
function makeMattRoll(overrides: {
  id: string;
  rollWidthM: string;
  printableWidthM: string;
  retailSellPerLm: number;
  dealerSellPerLm: number;
  costPerLm?: number;
}): LargeFormatMaterial {
  return {
    id: overrides.id,
    name: `ORACAL MATT ${overrides.rollWidthM}*50m`,
    rollWidthMeters: new Prisma.Decimal(overrides.rollWidthM),
    printableWidthMeters: new Prisma.Decimal(overrides.printableWidthM),
    rollLengthMeters: new Prisma.Decimal("50.000"),
    stockLinearMeters: new Prisma.Decimal("99"),
    avgPurchaseCostPerLinearMeter: null,
    costPerLinearMeter: overrides.costPerLm ?? 5,
    dealerPricePerLinearMeter: 0,
    retailPricePerLinearMeter: 0,
    dealerPrintPricePerLinearMeter: 0,
    retailPrintPricePerLinearMeter: 0,
    finalRetailPricePerLinearMeter: overrides.retailSellPerLm,
    finalDealerPricePerLinearMeter: overrides.dealerSellPerLm,
    manualFinalRetailPricePerLinearMeter: overrides.retailSellPerLm,
    manualFinalDealerPricePerLinearMeter: overrides.dealerSellPerLm,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  } as LargeFormatMaterial;
}

/** ORACAL-like family with 3 roll widths, ordered ascending. */
const familyMaterials = (): LargeFormatMaterial[] => [
  makeMattRoll({
    id: "mat-105",
    rollWidthM: "1.05",
    printableWidthM: "1.00",
    retailSellPerLm: 10,
    dealerSellPerLm: 8,
    costPerLm: 5,
  }),
  makeMattRoll({
    id: "mat-127",
    rollWidthM: "1.27",
    printableWidthM: "1.22",
    retailSellPerLm: 13,
    dealerSellPerLm: 10,
    costPerLm: 5,
  }),
  makeMattRoll({
    id: "mat-162",
    rollWidthM: "1.62",
    printableWidthM: "1.57",
    retailSellPerLm: 17,
    dealerSellPerLm: 13,
    costPerLm: 5,
  }),
];

// ─── pickCheapestFamilyMaterialForTiles ─────────────────────────────────────

describe("pickCheapestFamilyMaterialForTiles (pure)", () => {
  it("2× 50×50 → picks 1.27 (2 per row vs 1 per row on 1.05)", () => {
    const best = pickCheapestFamilyMaterialForTiles({
      materials: familyMaterials(),
      tiles: [
        { id: "T1", label: "T1", widthCm: 50, heightCm: 50, allowRotate: true },
        { id: "T2", label: "T2", widthCm: 50, heightCm: 50, allowRotate: true },
      ],
      customerType: "retail",
      prod: prod(),
    });
    expect(best?.mat.id).toBe("mat-127");
    // 1.27 printable 122cm: 51+51 = 102 ≤ 122 → 2 per row → 0.51m along.
    expect(best?.packResult.totalAlongCm).toBe(51);
  });

  it("3× 40×40 → picks 1.62 (3 per row) despite highest per-LM rate", () => {
    const best = pickCheapestFamilyMaterialForTiles({
      materials: familyMaterials(),
      tiles: [
        { id: "T1", label: "T1", widthCm: 40, heightCm: 40, allowRotate: true },
        { id: "T2", label: "T2", widthCm: 40, heightCm: 40, allowRotate: true },
        { id: "T3", label: "T3", widthCm: 40, heightCm: 40, allowRotate: true },
      ],
      customerType: "retail",
      prod: prod(),
    });
    expect(best?.mat.id).toBe("mat-162");
    // 1.62 printable 157cm: 41+41+41 = 123 ≤ 157 → 3 per row → 0.41m along.
    expect(best?.packResult.totalAlongCm).toBe(41);
  });

  it("single 20×20 → picks 1.05 (LM invariant, narrowest cheapest per-LM)", () => {
    const best = pickCheapestFamilyMaterialForTiles({
      materials: familyMaterials(),
      tiles: [
        { id: "T1", label: "T1", widthCm: 20, heightCm: 20, allowRotate: true },
      ],
      customerType: "retail",
      prod: prod(),
    });
    expect(best?.mat.id).toBe("mat-105");
    expect(best?.packResult.totalAlongCm).toBe(21);
  });

  it("returns null when no roll fits", () => {
    const best = pickCheapestFamilyMaterialForTiles({
      materials: familyMaterials(),
      tiles: [
        { id: "T1", label: "T1", widthCm: 200, heightCm: 200, allowRotate: true },
      ],
      customerType: "retail",
      prod: prod(),
    });
    expect(best).toBeNull();
  });
});

// ─── computeLargeFormatLineGroupBilling ─────────────────────────────────────

describe("computeLargeFormatLineGroupBilling (golden)", () => {
  it("reported scenario — dealer group 3× 20×20 + 1× 90×90", () => {
    // Rates: 1.05 dealer = 8, 1.27 dealer = 10, 1.62 dealer = 13.
    // Tiles inflated by 1cm gap: 91×91 (from 90×90) and 21×21 (from 20×20).
    // Fit / LM analysis:
    //   1.05 printable 100cm: 91 fits alone in row 1; 21+21+21 = 63 ≤ 100
    //     → 3 20s share row 2. Along = 91 + 21 = 112cm → LM = 1.12.
    //     Dealer sell = 1.12 × 8 = 8.96 → rounded to 9 MDL.
    //   1.27 printable 122cm: 91 + 21 = 112 ≤ 122 → 90 next to a single 20;
    //     remaining 20s stack — packer LM ≥ 0.91. Dealer sell ≥ 0.91×10 = 9.1.
    //   1.62 printable 157cm: 91 + 21×3 = 154 ≤ 157 → 90 + three 20s in one
    //     row → LM = 0.91. Dealer sell = 0.91 × 13 = 11.83 → 12 MDL.
    // Winner: 1.05 (cheapest at 9 MDL). Wider rolls have higher per-LM rate
    // and can't offset it here.
    const results = computeLargeFormatLineGroupBilling({
      familyKey: "ORACAL MATT",
      materials: familyMaterials(),
      customerType: "dealer",
      prod: prod({ lfMinimumLineTotalMdl: 100 }),
      avgInkCostPerMlMdl: 0,
      lines: [
        { lineIndex: 0, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
        { lineIndex: 1, printWidthCm: 90, printHeightCm: 90, quantity: 1 },
        { lineIndex: 2, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
        { lineIndex: 3, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
      ],
    });

    // 4 line results, one per input line, order-preserving.
    expect(results).toHaveLength(4);

    // Every result must share the same billing roll (group picked once).
    const rolls = new Set(results.map((r) => r.largeFormatMaterialId));
    expect(rolls.size).toBe(1);
    expect(results[0]!.largeFormatMaterialId).toBe("mat-105");

    // Total LM across group reconciles to 1.12m (91cm row 1 + 21cm row 2).
    const totalLm = results.reduce((s, r) => s + r.calculatedLinearMeters, 0);
    expect(totalLm).toBeCloseTo(1.12, 3);

    // Proportional-by-area allocation for 4 dealer lines:
    //   Total inner tile area = 90² + 3×20² = 8100 + 1200 = 9300 (cm²).
    //   90×90 share = 8100/9300 ≈ 87.10% → LM ≈ 1.12 × 0.871 = 0.9754.
    //   Each 20×20 share = 400/9300 ≈ 4.30% → LM ≈ 1.12 × 0.043 = 0.04817.
    // Line prices (rounded MDL): materialSell = LM × 8.
    //   90×90: 0.9754 × 8 = 7.80 → 8 MDL.
    //   20×20 (each): 0.04817 × 8 = 0.385 → 0 MDL.
    // Dealer exempt from 100 MDL minimum.
    expect(results[1]!.calculatedLinearMeters).toBeCloseTo(0.9754, 3);
    expect(results[0]!.calculatedLinearMeters).toBeCloseTo(0.04817, 3);

    expect(results[1]!.totalSellPriceMdl).toBe(8);
    expect(results[0]!.totalSellPriceMdl).toBe(0);
    expect(results[2]!.totalSellPriceMdl).toBe(0);
    expect(results[3]!.totalSellPriceMdl).toBe(0);

    // Group total sums to 8 MDL for dealer (no minimum uplift).
    const groupTotal = results.reduce((s, r) => s + r.totalSellPriceMdl, 0);
    expect(groupTotal).toBe(8);
  });

  it("reported scenario — same tiles but retail group applies 100 MDL floor", () => {
    // Retail rates: 1.05 = 10, 1.27 = 13, 1.62 = 17.
    // 1.05 packs LM = 1.12 → 1.12 × 10 = 11.2 → 11 MDL (naive).
    // Group minimum floors the sum-of-lines to 100 MDL when retail.
    const results = computeLargeFormatLineGroupBilling({
      familyKey: "ORACAL MATT",
      materials: familyMaterials(),
      customerType: "retail",
      prod: prod({ lfMinimumLineTotalMdl: 100 }),
      avgInkCostPerMlMdl: 0,
      lines: [
        { lineIndex: 0, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
        { lineIndex: 1, printWidthCm: 90, printHeightCm: 90, quantity: 1 },
        { lineIndex: 2, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
        { lineIndex: 3, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
      ],
    });

    expect(results[0]!.largeFormatMaterialId).toBe("mat-105");

    // Group total after uplift is exactly the floor (retail sub-100).
    const groupTotal = results.reduce((s, r) => s + r.totalSellPriceMdl, 0);
    expect(groupTotal).toBe(100);
  });

  it("dealer group with a single line — no group minimum applies (dealer exempt)", () => {
    const results = computeLargeFormatLineGroupBilling({
      familyKey: "ORACAL MATT",
      materials: familyMaterials(),
      customerType: "dealer",
      prod: prod({ lfMinimumLineTotalMdl: 100 }),
      avgInkCostPerMlMdl: 0,
      lines: [
        { lineIndex: 0, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
      ],
    });

    expect(results).toHaveLength(1);
    // 20×20 dealer on 1.05: LM = 0.21, sell = 0.21 × 8 = 1.68 → rounded to 1.68 MDL.
    // Dealer exempt from 100-MDL floor.
    expect(results[0]!.largeFormatMaterialId).toBe("mat-105");
    expect(results[0]!.totalSellPriceMdl).toBeLessThan(100);
  });

  it("retail group with a single 20×20 — floors up to lfMinimumLineTotalMdl", () => {
    const results = computeLargeFormatLineGroupBilling({
      familyKey: "ORACAL MATT",
      materials: familyMaterials(),
      customerType: "retail",
      prod: prod({ lfMinimumLineTotalMdl: 100 }),
      avgInkCostPerMlMdl: 0,
      lines: [
        { lineIndex: 0, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
      ],
    });

    expect(results).toHaveLength(1);
    // Under 100 MDL → uplift to 100.
    expect(results[0]!.totalSellPriceMdl).toBe(100);
  });

  it("parity: qty=2 on one line == two lines of qty=1 within ±1 MDL", () => {
    // MDL prices round to whole numbers per line, so splitting one qty=2
    // line into two qty=1 lines can drift by up to ±1 MDL per line due to
    // rounding of the halved LM. We assert the drift is bounded.
    const asOneLine = computeLargeFormatLineGroupBilling({
      familyKey: "ORACAL MATT",
      materials: familyMaterials(),
      customerType: "dealer",
      prod: prod(),
      avgInkCostPerMlMdl: 0,
      lines: [
        { lineIndex: 0, printWidthCm: 50, printHeightCm: 50, quantity: 2 },
      ],
    });

    const asTwoLines = computeLargeFormatLineGroupBilling({
      familyKey: "ORACAL MATT",
      materials: familyMaterials(),
      customerType: "dealer",
      prod: prod(),
      avgInkCostPerMlMdl: 0,
      lines: [
        { lineIndex: 0, printWidthCm: 50, printHeightCm: 50, quantity: 1 },
        { lineIndex: 1, printWidthCm: 50, printHeightCm: 50, quantity: 1 },
      ],
    });

    // Same billing roll picked (deterministic on same tile set).
    expect(asOneLine[0]!.largeFormatMaterialId).toBe(
      asTwoLines[0]!.largeFormatMaterialId,
    );
    // Same total LM (LM allocation is continuous, no rounding).
    expect(asOneLine[0]!.calculatedLinearMeters).toBeCloseTo(
      asTwoLines[0]!.calculatedLinearMeters +
        asTwoLines[1]!.calculatedLinearMeters,
      6,
    );

    const oneLineTotal = asOneLine[0]!.totalSellPriceMdl;
    const twoLinesTotal =
      asTwoLines[0]!.totalSellPriceMdl + asTwoLines[1]!.totalSellPriceMdl;
    // Per-line MDL rounding can shift each of the two split lines by up to
    // 0.5 MDL → sum drift bounded by number of lines.
    expect(Math.abs(twoLinesTotal - oneLineTotal)).toBeLessThanOrEqual(2);
  });

  it("empty lines throws", () => {
    expect(() =>
      computeLargeFormatLineGroupBilling({
        familyKey: "ORACAL MATT",
        materials: familyMaterials(),
        customerType: "dealer",
        prod: prod(),
        avgInkCostPerMlMdl: 0,
        lines: [],
      }),
    ).toThrow(/Empty line group/);
  });

  it("empty materials throws lf_family_not_found", () => {
    expect(() =>
      computeLargeFormatLineGroupBilling({
        familyKey: "ORACAL MATT",
        materials: [],
        customerType: "dealer",
        prod: prod(),
        avgInkCostPerMlMdl: 0,
        lines: [
          { lineIndex: 0, printWidthCm: 20, printHeightCm: 20, quantity: 1 },
        ],
      }),
    ).toThrow(/lf_family_not_found/);
  });

  it("no fitting roll throws lf_pack_does_not_fit", () => {
    expect(() =>
      computeLargeFormatLineGroupBilling({
        familyKey: "ORACAL MATT",
        materials: familyMaterials(),
        customerType: "dealer",
        prod: prod(),
        avgInkCostPerMlMdl: 0,
        lines: [
          { lineIndex: 0, printWidthCm: 200, printHeightCm: 200, quantity: 1 },
        ],
      }),
    ).toThrow(/lf_pack_does_not_fit/);
  });
});
