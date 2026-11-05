import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { computeLargeFormatLineGroupBilling } from "@/lib/largeFormat/lfCrossLinePacking";
import type { LfPricingMaterial } from "@/lib/largeFormat/lfMaterialStock";
import { lfPresetFloorMdl, lfShopLineTotalMdl, lfShopUnitPriceMdl, type LfShopPricingContext } from "./lfShopUnitPrice";

function prod(p: Partial<ProductionCostsConfig> = {}): ProductionCostsConfig {
  return {
    mugPrintPerUnit: 0,
    packagingPerOrder: 0,
    otherConsumablesPerOrder: 0,
    inkMlPerSqmLargeFormatRoll: 8,
    minimumOrderPriceMdl: 0,
    lfMinimumLineTotalMdl: 100,
    lfRetailMarkupMultiplier: 0,
    lfDealerMarkupMultiplier: 0,
    lfInkRetailMarkupMultiplier: 3,
    lfInkDealerMarkupMultiplier: 2,
    bcMinimumLineTotalMdl: 0,
    ...p,
  };
}

function roll(id: string, name: string, rollW: string, printableW: string, retailPerLm: number): LfPricingMaterial {
  return {
    id,
    name,
    rollWidthMeters: new Prisma.Decimal(rollW),
    printableWidthMeters: new Prisma.Decimal(printableW),
    rollLengthMeters: new Prisma.Decimal("50.000"),
    stockVariantId: null,
    stockSku: null,
    stockLm: 99,
    avgCostPerLm: null,
    catalogCostPerLm: 40,
    dealerPricePerLinearMeter: 0,
    retailPricePerLinearMeter: 0,
    dealerPrintPricePerLinearMeter: 0,
    retailPrintPricePerLinearMeter: 0,
    finalRetailPricePerLinearMeter: retailPerLm,
    finalDealerPricePerLinearMeter: retailPerLm,
    manualFinalRetailPricePerLinearMeter: retailPerLm,
    manualFinalDealerPricePerLinearMeter: retailPerLm,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
  } as LfPricingMaterial;
}

const oracalFamily = (): LfShopPricingContext => ({
  materials: [
    roll("m105", "ORACAL MATT 1.05*50m", "1.05", "1.00", 160),
    roll("m127", "ORACAL MATT 1.27*50m", "1.27", "1.22", 190),
    roll("m162", "ORACAL MATT 1.62*50m", "1.62", "1.57", 230),
  ],
  family: true,
  prod: prod(),
  avgInkCostPerMlMdl: 1.37,
  galleryWrapCm: 0,
});

const banner = (): LfShopPricingContext => ({
  materials: [roll("b137", "BANNER MATT 1.37*50m", "1.37", "1.32", 283)],
  family: false,
  prod: prod(),
  avgInkCostPerMlMdl: 1.37,
  galleryWrapCm: 0,
});

describe("lfShopLineTotalMdl", () => {
  it("equals the studio family group billing for a single line", () => {
    const ctx = oracalFamily();
    for (const [w, h] of [
      [100, 100],
      [50, 50],
      [30, 40],
      [157, 200],
      [10, 10],
    ] as const) {
      for (const q of [1, 2, 3, 4, 5, 7, 10]) {
        const studio = computeLargeFormatLineGroupBilling({
          familyKey: "ORACAL MATT",
          materials: ctx.materials,
          customerType: "retail",
          prod: ctx.prod,
          avgInkCostPerMlMdl: ctx.avgInkCostPerMlMdl,
          lines: [{ lineIndex: 0, printWidthCm: w, printHeightCm: h, quantity: q }],
        })[0]!;
        expect(lfShopLineTotalMdl(ctx, { widthCm: w, heightCm: h }, q), `${w}×${h} ×${q}`).toBe(studio.totalSellPriceMdl);
      }
    }
  });

  it("takes 157 cm on the short side of Oracal (printable 157 cm), not 158", () => {
    const ctx = oracalFamily();
    expect(lfShopLineTotalMdl(ctx, { widthCm: 157, heightCm: 157 }, 1)).not.toBeNull();
    expect(lfShopLineTotalMdl(ctx, { widthCm: 158, heightCm: 200 }, 1)).toBeNull();
  });

  it("adds banner finishing per piece on top of the print", () => {
    const ctx = banner();
    const plain = lfShopLineTotalMdl(ctx, { widthCm: 200, heightCm: 100 }, 1)!;
    // 4 corner eyelets × 3,5 lei = 14 per piece.
    expect(lfShopLineTotalMdl(ctx, { widthCm: 200, heightCm: 100, finishing: { eyelets: { mode: "corners" } } }, 1)).toBe(plain + 14);
    expect(lfShopLineTotalMdl(ctx, { widthCm: 200, heightCm: 100, finishing: { eyelets: { mode: "corners" } } }, 3)).toBe(
      lfShopLineTotalMdl(ctx, { widthCm: 200, heightCm: 100 }, 3)! + 42,
    );
  });
});

describe("lfShopUnitPriceMdl", () => {
  it("is a whole lei amount, never higher for more pieces, and never above the studio line", () => {
    for (const ctx of [oracalFamily(), banner()]) {
      for (const [w, h] of [
        [200, 100],
        [100, 100],
        [50, 50],
        [40, 60],
        [30, 30],
        [131, 90],
      ] as const) {
        let prev = Number.POSITIVE_INFINITY;
        for (let q = 1; q <= 25; q++) {
          const unit = lfShopUnitPriceMdl((k) => lfShopLineTotalMdl(ctx, { widthCm: w, heightCm: h }, k), q)!;
          expect(Number.isInteger(unit)).toBe(true);
          expect(unit, `${w}×${h} ×${q}`).toBeLessThanOrEqual(prev);
          expect(unit * q).toBeLessThanOrEqual(lfShopLineTotalMdl(ctx, { widthCm: w, heightCm: h }, q)!);
          prev = unit;
        }
      }
    }
  });

  it("rounds a fractional per-piece price down (QA: banner 647,20 → 647 × 5 = 3235)", () => {
    const totals: Record<number, number> = { 1: 647, 2: 1294, 5: 3236, 10: 6471 };
    const line = (k: number) => totals[k] ?? 647.15 * k;
    expect(lfShopUnitPriceMdl(line, 1)).toBe(647);
    expect(lfShopUnitPriceMdl(line, 5)).toBe(647);
    expect(lfShopUnitPriceMdl(line, 10)).toBe(647);
  });

  it("keeps the price per piece when one more piece opens a new row", () => {
    // 3 per row: 3 pcs = 300 (100 each), 4 pcs = 2 rows = 600 → 150 each without the rule.
    const line = (k: number) => Math.ceil(k / 3) * 300;
    expect(lfShopUnitPriceMdl(line, 3)).toBe(100);
    expect(lfShopUnitPriceMdl(line, 4)).toBe(100);
  });

  it("is null when nothing fits", () => {
    expect(lfShopUnitPriceMdl(() => null, 3)).toBeNull();
  });

  it("prices 100 pieces fast enough for a live quote", () => {
    const ctx = oracalFamily();
    const t0 = performance.now();
    lfShopUnitPriceMdl((k) => lfShopLineTotalMdl(ctx, { widthCm: 10, heightCm: 12 }, k), 100);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(3000);
  });
});

describe("lfPresetFloorMdl (poster «Altă mărime» vs fixed sizes)", () => {
  const presets = [
    { widthCm: 30, heightCm: 40, retailPriceMdl: 70 },
    { widthCm: 50, heightCm: 70, retailPriceMdl: 160 },
    { widthCm: 60, heightCm: 90, retailPriceMdl: 220 },
  ];

  it("custom 50×70 costs at least the fixed 50×70 (QA: 143 < 160)", () => {
    expect(lfPresetFloorMdl(presets, 50, 70)).toBe(160);
    expect(lfPresetFloorMdl(presets, 70, 50)).toBe(160);
  });

  it("uses the dearest fixed size that fits inside", () => {
    expect(lfPresetFloorMdl(presets, 55, 75)).toBe(160);
    expect(lfPresetFloorMdl(presets, 60, 90)).toBe(220);
  });

  it("no floor below the smallest fixed size", () => {
    expect(lfPresetFloorMdl(presets, 25, 38)).toBe(0);
    expect(lfPresetFloorMdl(presets, 49, 69)).toBe(70);
  });
});
