/**
 * Golden pipeline test: when a size preset is supplied for an LF line,
 * `applyLfSizePresetOverride` replaces the auto-computed total, and we skip
 * `mergeLfPricingWithInkSell` + `applyLfMinimumLineSellTotalMdl`.
 *
 * Mirrors the LF branch of `resolveAdminOrderLineProducts` in
 * `src/lib/adminOrderCreateHelpers.ts`.
 */
import { describe, expect, it } from "vitest";
import type { LargeFormatMaterial } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { computeLargeFormatLinePricing } from "./largeFormatLinePricing";
import { resolveEffectivePrintableWidthMeters } from "./largeFormatRollConstants";
import { computeLargeFormatRollLayout } from "./largeFormatRollPack";
import {
  computeLfRollOrderEconomics,
  effectiveLfMaterialCostPerLinearMeterMdl,
  lfRollEconomicsWithRevenueMargin,
} from "./lfRollOrderEconomics";
import { resolveLfSellRatesPerLinearMeterMdl } from "./lfResolveSellRates";
import {
  applyLfSizePresetOverride,
  selectLfSizePresetPriceMdl,
} from "./lfPresetPricing";

function prod(p: Partial<ProductionCostsConfig>): ProductionCostsConfig {
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
    ...p,
  };
}

function goldenMaterial(overrides: Partial<LargeFormatMaterial> = {}): LargeFormatMaterial {
  const base = {
    id: "00000000-0000-4000-8000-000000000777",
    name: "golden-lf-canvas",
    rollWidthMeters: new Prisma.Decimal("1.270"),
    printableWidthMeters: new Prisma.Decimal("1.220"),
    rollLengthMeters: new Prisma.Decimal("50.000"),
    stockLinearMeters: new Prisma.Decimal("99"),
    avgPurchaseCostPerLinearMeter: null,
    costPerLinearMeter: 42,
    dealerPricePerLinearMeter: 80,
    retailPricePerLinearMeter: 120,
    dealerPrintPricePerLinearMeter: 25,
    retailPrintPricePerLinearMeter: 45,
    finalRetailPricePerLinearMeter: 165,
    finalDealerPricePerLinearMeter: 105,
    manualFinalRetailPricePerLinearMeter: null,
    manualFinalDealerPricePerLinearMeter: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...overrides } as LargeFormatMaterial;
}

/** Same pipeline as `resolveAdminOrderLineProducts` when `lfSizePresetId` is set. */
function computeLfPresetResolvedLine(input: {
  m: LargeFormatMaterial;
  preset: { widthCm: number; heightCm: number; retailPriceMdl: number; dealerPriceMdl: number };
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  customerType: "retail" | "dealer";
  production: ProductionCostsConfig;
  avgInkCostPerMlMdl: number;
}) {
  const m = input.m;
  const printableM = resolveEffectivePrintableWidthMeters({
    printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
    rollWidthMeters: m.rollWidthMeters.toString(),
  });
  const printableCm = printableM * 100;
  const pack = computeLargeFormatRollLayout({
    printableWidthCm: printableCm,
    nominalRollWidthMeters: Number(m.rollWidthMeters),
    printWidthCm: input.printWidthCm,
    printHeightCm: input.printHeightCm,
    quantity: input.quantity,
  });
  if (!pack.ok) throw new Error(`pack failed: ${pack.code}`);
  const effLm = effectiveLfMaterialCostPerLinearMeterMdl(m);
  const resolvedSell = resolveLfSellRatesPerLinearMeterMdl({
    effectiveMaterialCostPerLinearMeterMdl: effLm,
    production: input.production,
    material: m,
  });
  const pricingMat = computeLargeFormatLinePricing({
    calculatedLinearMeters: pack.layout.calculatedLinearMeters,
    customerType: input.customerType,
    material: {
      costPerLinearMeter: effLm,
      finalRetailPricePerLinearMeter: resolvedSell.finalRetailPricePerLinearMeter,
      finalDealerPricePerLinearMeter: resolvedSell.finalDealerPricePerLinearMeter,
      dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
      retailPricePerLinearMeter: m.retailPricePerLinearMeter,
      dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
      retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
    },
  });
  const econCosts = computeLfRollOrderEconomics({
    printWidthCm: input.printWidthCm,
    printHeightCm: input.printHeightCm,
    quantity: input.quantity,
    calculatedLinearMeters: pack.layout.calculatedLinearMeters,
    rollWidthMeters: Number(m.rollWidthMeters),
    effectiveMaterialCostPerLinearMeterMdl: effLm,
    inkMlPerSqm: input.production.inkMlPerSqmLargeFormatRoll,
    avgInkCostPerMlMdl: input.avgInkCostPerMlMdl,
    totalSellPriceMdl: pricingMat.materialSellPrice,
  });
  const unitPrice = selectLfSizePresetPriceMdl(input.preset, input.customerType);
  const pricingFinal = applyLfSizePresetOverride({
    pricing: pricingMat,
    presetPriceMdl: unitPrice,
    quantity: input.quantity,
    inkCostMdl: econCosts.inkCostMdl,
  });
  const econ = lfRollEconomicsWithRevenueMargin(econCosts, pricingFinal.totalSellPrice);
  return { pack, effLm, pricingMat, econCosts, pricingFinal, econ, unitPrice };
}

describe("LF preset line resolve (golden)", () => {
  const preset = { widthCm: 30, heightCm: 42, retailPriceMdl: 390, dealerPriceMdl: 290 };

  it("locks total to retail × qty and skips ink/min uplift", () => {
    const m = goldenMaterial();
    const production = prod({
      inkMlPerSqmLargeFormatRoll: 20,
      lfInkRetailMarkupMultiplier: 1.5,
      /** Even with a high min line floor, preset wins. */
      lfMinimumLineTotalMdl: 1_000,
    });
    const r = computeLfPresetResolvedLine({
      m,
      preset,
      printWidthCm: 30,
      printHeightCm: 42,
      quantity: 2,
      customerType: "retail",
      production,
      avgInkCostPerMlMdl: 0.5,
    });

    expect(r.unitPrice).toBe(390);
    expect(r.pricingFinal.totalSellPrice).toBe(780);
    expect(r.pricingFinal.materialSellPrice).toBe(780);
    expect(r.pricingFinal.printSellPrice).toBe(0);
    /** COGS still tracked. */
    expect(r.econCosts.inkCostMdl).toBeGreaterThan(0);
    expect(r.econCosts.materialPurchaseCostMdl).toBeGreaterThan(0);
  });

  it("uses dealer price for dealer customers", () => {
    const m = goldenMaterial();
    const production = prod({ inkMlPerSqmLargeFormatRoll: 20 });
    const r = computeLfPresetResolvedLine({
      m,
      preset,
      printWidthCm: 30,
      printHeightCm: 42,
      quantity: 1,
      customerType: "dealer",
      production,
      avgInkCostPerMlMdl: 0.5,
    });
    expect(r.unitPrice).toBe(290);
    expect(r.pricingFinal.totalSellPrice).toBe(290);
  });

  it("preset profit subtracts material + ink COGS", () => {
    const m = goldenMaterial();
    const production = prod({
      inkMlPerSqmLargeFormatRoll: 20,
      lfInkRetailMarkupMultiplier: 0,
    });
    const r = computeLfPresetResolvedLine({
      m,
      preset,
      printWidthCm: 30,
      printHeightCm: 42,
      quantity: 1,
      customerType: "retail",
      production,
      avgInkCostPerMlMdl: 0.5,
    });
    /** profit = 390 − materialCost − inkCost. */
    const expected = 390 - r.pricingMat.materialCost - r.econCosts.inkCostMdl;
    expect(r.pricingFinal.estimatedProfit).toBe(expected);
  });
});
