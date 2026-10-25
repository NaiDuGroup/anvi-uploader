/**
 * Price identity of the stage-4 switch: a roll priced from its unified stock
 * variant (average cost, else the cost hint) gives exactly what the legacy
 * columns (`avg_purchase_cost_per_lm`, else `cost_per_lm`) gave, because the
 * migration copied them 1:1 into the variant.
 */
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { parseProductionCostsJson, type ProductionCostsConfig } from "@/lib/accounting/types";
import { roundMoneyMdl, effectiveLfSellRatePerLinearMeterMdl } from "./largeFormatLinePricing";
import { toLfPricingMaterial, type LfMaterialRow } from "./lfMaterialStock";
import { effectiveLfMaterialCostPerLinearMeterMdl, computeLfRollOrderEconomics } from "./lfRollOrderEconomics";
import { resolveLfSellRatesPerLinearMeterMdl } from "./lfResolveSellRates";
import { largeFormatMaterialToSnapshot } from "./toLargeFormatSnapshot";
import { toAdminLargeFormatMaterialJson } from "./toAdminLargeFormatMaterialJson";

const d = (v: string) => new Prisma.Decimal(v);

/** Legacy rule, as in the code before the switch (reference only). */
function legacyEffectiveCost(costPerLinearMeter: number, avg: number | null): number {
  if (avg == null || !Number.isFinite(avg) || avg < 0) return costPerLinearMeter;
  return avg;
}

function row(avg: string | null, hint: string, overrides: Partial<LfMaterialRow> = {}): LfMaterialRow {
  return {
    id: "m1",
    stockVariantId: "v1",
    name: "ORACAL MATT 1.27*50m",
    rollWidthMeters: d("1.27"),
    printableWidthMeters: d("1.22"),
    rollLengthMeters: d("50"),
    dealerPricePerLinearMeter: 80,
    retailPricePerLinearMeter: 120,
    dealerPrintPricePerLinearMeter: 25,
    retailPrintPricePerLinearMeter: 45,
    finalRetailPricePerLinearMeter: 0,
    finalDealerPricePerLinearMeter: 0,
    manualFinalRetailPricePerLinearMeter: null,
    manualFinalDealerPricePerLinearMeter: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    stockVariant: {
      id: "v1",
      sku: "ROLL-ED16FE76",
      stockQuantity: d("67.427"),
      avgCost: avg == null ? null : d(avg),
      purchaseCost: d(hint),
    },
    ...overrides,
  };
}

const PROD_MARKUP: ProductionCostsConfig = {
  ...parseProductionCostsJson({}),
  lfRetailMarkupMultiplier: 3.4,
  lfDealerMarkupMultiplier: 2.6,
};
const PROD_LEGACY: ProductionCostsConfig = {
  ...parseProductionCostsJson({}),
  lfRetailMarkupMultiplier: 0,
  lfDealerMarkupMultiplier: 0,
};

describe("toLfPricingMaterial", () => {
  it("flattens the variant's balance, average, hint and SKU", () => {
    const m = toLfPricingMaterial(row("44.3176", "0"));
    expect(m).toMatchObject({ stockLm: 67.427, avgCostPerLm: 44.3176, catalogCostPerLm: 0, stockSku: "ROLL-ED16FE76" });
    expect("stockVariant" in m).toBe(false);
  });

  it("a row without a variant prices at zero cost with zero stock (never reads the legacy columns)", () => {
    const m = toLfPricingMaterial(row(null, "0", { stockVariantId: null, stockVariant: null }));
    expect(m).toMatchObject({ stockLm: 0, avgCostPerLm: null, catalogCostPerLm: 0, stockSku: null });
  });
});

describe("roll price identity (variant vs legacy columns)", () => {
  const cases: [string | null, number][] = [
    [null, 40],
    ["44.3176", 0],
    ["58.8667", 12],
    ["0", 40],
    ["116.6656", 0],
  ];

  for (const [avg, hint] of cases) {
    it(`avg ${avg ?? "null"}, hint ${hint}`, () => {
      const m = toLfPricingMaterial(row(avg, String(hint)));
      const legacyEff = legacyEffectiveCost(hint, avg == null ? null : Number(avg));
      const eff = effectiveLfMaterialCostPerLinearMeterMdl(m);
      expect(eff).toBe(legacyEff);

      // Markup pricing (production) and the legacy split-rate fallback.
      const markup = resolveLfSellRatesPerLinearMeterMdl({ effectiveMaterialCostPerLinearMeterMdl: eff, production: PROD_MARKUP, material: m });
      expect(markup).toEqual({
        finalRetailPricePerLinearMeter: roundMoneyMdl(legacyEff * 3.4),
        finalDealerPricePerLinearMeter: roundMoneyMdl(legacyEff * 2.6),
      });
      const split = resolveLfSellRatesPerLinearMeterMdl({ effectiveMaterialCostPerLinearMeterMdl: eff, production: PROD_LEGACY, material: m });
      const legacyInput = {
        costPerLinearMeter: hint,
        finalRetailPricePerLinearMeter: 0,
        finalDealerPricePerLinearMeter: 0,
        dealerPricePerLinearMeter: 80,
        retailPricePerLinearMeter: 120,
        dealerPrintPricePerLinearMeter: 25,
        retailPrintPricePerLinearMeter: 45,
      };
      expect(split).toEqual({
        finalRetailPricePerLinearMeter: effectiveLfSellRatePerLinearMeterMdl("retail", legacyInput),
        finalDealerPricePerLinearMeter: effectiveLfSellRatePerLinearMeterMdl("dealer", legacyInput),
      });

      // Snapshot keeps the catalog hint in `costPerLinearMeter`, as before.
      expect(largeFormatMaterialToSnapshot(m, markup).costPerLinearMeter).toBe(hint);

      // Economics: material COGS = metres × effective cost.
      const econ = computeLfRollOrderEconomics({
        printWidthCm: 100,
        printHeightCm: 150,
        quantity: 2,
        calculatedLinearMeters: 3,
        rollWidthMeters: 1.27,
        effectiveMaterialCostPerLinearMeterMdl: eff,
        inkMlPerSqm: 8,
        avgInkCostPerMlMdl: 0.617,
        totalSellPriceMdl: 1000,
      });
      expect(econ.materialPurchaseCostMdl).toBe(roundMoneyMdl(3 * legacyEff));

      // Admin JSON keeps its field names, values from the variant.
      const json = toAdminLargeFormatMaterialJson(m, PROD_MARKUP);
      expect(json).toMatchObject({
        stockLinearMeters: 67.427,
        avgPurchaseCostPerLinearMeter: avg == null ? null : Number(avg),
        costPerLinearMeter: hint,
        effectiveRetailPricePerLinearMeter: markup.finalRetailPricePerLinearMeter,
        stockVariantId: "v1",
      });
    });
  }
});
