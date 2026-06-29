import { describe, expect, it } from "vitest";
import type { LargeFormatMaterial } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { computeLargeFormatLinePricing, roundMoneyMdl } from "./largeFormatLinePricing";
import { resolveEffectivePrintableWidthMeters } from "./largeFormatRollConstants";
import { computeLargeFormatRollLayout } from "./largeFormatRollPack";
import {
  computeLfInkSellPriceMdl,
  lfInkMarkupMultiplierUsed,
  mergeLfPricingWithInkSell,
} from "./lfInkSellPricing";
import { applyLfMinimumLineSellTotalMdl } from "./lfMinimumLineSell";
import {
  computeLfRollOrderEconomics,
  effectiveLfMaterialCostPerLinearMeterMdl,
  lfRollEconomicsWithRevenueMargin,
} from "./lfRollOrderEconomics";
import { resolveLfSellRatesPerLinearMeterMdl } from "./lfResolveSellRates";

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

/** Minimal DB row shape for resolver math (matches `resolveAdminOrderLineProducts` LF branch). */
function goldenMaterial(overrides: Partial<LargeFormatMaterial> = {}): LargeFormatMaterial {
  const base = {
    id: "00000000-0000-4000-8000-000000000001",
    name: "golden-lf",
    rollWidthMeters: new Prisma.Decimal("1.520"),
    printableWidthMeters: new Prisma.Decimal("1.220"),
    rollLengthMeters: new Prisma.Decimal("30.000"),
    stockLinearMeters: new Prisma.Decimal("99"),
    avgPurchaseCostPerLinearMeter: null,
    costPerLinearMeter: 40,
    dealerPricePerLinearMeter: 80,
    retailPricePerLinearMeter: 120,
    dealerPrintPricePerLinearMeter: 25,
    retailPrintPricePerLinearMeter: 45,
    finalRetailPricePerLinearMeter: 100,
    finalDealerPricePerLinearMeter: 80,
    manualFinalRetailPricePerLinearMeter: null,
    manualFinalDealerPricePerLinearMeter: null,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  return { ...base, ...overrides } as LargeFormatMaterial;
}

/**
 * Mirrors `resolveAdminOrderLineProducts` LF calculations without Prisma
 * (same pure-function sequence as in `src/lib/adminOrderCreateHelpers.ts`).
 */
function computeLfResolvedLineLikeAdmin(input: {
  m: LargeFormatMaterial;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
  customerType: "retail" | "dealer";
  production: ProductionCostsConfig;
  avgInkCostPerMlMdl: number;
  lfMinimumLineTotalMdl?: number;
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
  if (!pack.ok) {
    throw new Error(`pack failed: ${pack.code}`);
  }
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
  const rollW = Number(m.rollWidthMeters);
  const econCosts = computeLfRollOrderEconomics({
    printWidthCm: input.printWidthCm,
    printHeightCm: input.printHeightCm,
    quantity: input.quantity,
    calculatedLinearMeters: pack.layout.calculatedLinearMeters,
    rollWidthMeters: rollW,
    effectiveMaterialCostPerLinearMeterMdl: effLm,
    inkMlPerSqm: input.production.inkMlPerSqmLargeFormatRoll,
    avgInkCostPerMlMdl: input.avgInkCostPerMlMdl,
    totalSellPriceMdl: pricingMat.materialSellPrice,
  });
  const inkSellMdl = computeLfInkSellPriceMdl(
    econCosts.inkCostMdl,
    input.customerType,
    input.production,
  );
  const multiplierUsedSnapshot = lfInkMarkupMultiplierUsed(input.customerType, input.production);
  const pricing = mergeLfPricingWithInkSell(pricingMat, inkSellMdl);
  // Mirror the core: dealers are exempt from the per-line minimum total.
  const effectiveMinTotalMdl =
    input.customerType === "dealer"
      ? 0
      : (input.lfMinimumLineTotalMdl ?? input.production.lfMinimumLineTotalMdl);
  const { pricing: pricingFinal, upliftMdl: lfMinUpliftMdl } = applyLfMinimumLineSellTotalMdl(
    pricing,
    effectiveMinTotalMdl,
  );
  const econ = lfRollEconomicsWithRevenueMargin(econCosts, pricingFinal.totalSellPrice);
  const inkSellPerSqmMdl =
    econCosts.usefulAreaSqm > 1e-9 ? roundMoneyMdl(inkSellMdl / econCosts.usefulAreaSqm) : 0;

  return {
    pack,
    effLm,
    pricingMat,
    econCosts,
    inkSellMdl,
    multiplierUsedSnapshot,
    pricingFinal,
    lfMinUpliftMdl,
    econ,
    inkSellPerSqmMdl,
  };
}

describe("LF admin line resolve (golden pure pipeline)", () => {
  it("matches roll pack + pricing + ink COGS/sell + margin (retail, no minimum)", () => {
    const m = goldenMaterial();
    const production = prod({
      inkMlPerSqmLargeFormatRoll: 20,
      lfInkRetailMarkupMultiplier: 1.5,
    });
    const r = computeLfResolvedLineLikeAdmin({
      m,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
      customerType: "retail",
      production,
      avgInkCostPerMlMdl: 0.5,
    });

    expect(r.pack.layout.calculatedLinearMeters).toBe(0.7);
    expect(r.pricingMat.calculatedLinearMeters).toBe(0.7);
    expect(r.effLm).toBe(40);
    expect(r.pricingMat.materialCost).toBe(28);
    expect(r.pricingMat.materialSellPrice).toBe(70);
    expect(r.pricingMat.totalSellPrice).toBe(70);
    expect(r.econCosts.usefulAreaSqm).toBe(0.7);
    expect(r.econCosts.writtenOffAreaSqm).toBeCloseTo(1.064, 6);
    expect(r.econCosts.materialPurchaseCostMdl).toBe(28);
    expect(r.econCosts.inkMlUsed).toBe(14);
    expect(r.econCosts.inkCostMdl).toBe(7);
    expect(r.econCosts.totalDirectCostMdl).toBe(35);

    expect(r.inkSellMdl).toBe(11);
    expect(r.pricingFinal.printSellPrice).toBe(11);
    expect(r.pricingFinal.totalSellPrice).toBe(81);
    expect(r.pricingFinal.estimatedProfit).toBe(53);
    expect(r.multiplierUsedSnapshot).toBe(1.5);
    expect(r.inkSellPerSqmMdl).toBe(16);

    expect(r.econ.totalDirectCostMdl).toBe(35);
    expect(r.econ.marginPercent).toBe(56.79);
    expect(r.econ.materialPurchaseCostMdl).toBe(28);
    expect(r.lfMinUpliftMdl).toBe(0);
  });

  it("applies lfMinimumLineTotalMdl uplift after ink sell (same geometry)", () => {
    const m = goldenMaterial();
    const production = prod({
      inkMlPerSqmLargeFormatRoll: 20,
      lfInkRetailMarkupMultiplier: 1.5,
      lfMinimumLineTotalMdl: 250,
    });
    const r = computeLfResolvedLineLikeAdmin({
      m,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
      customerType: "retail",
      production,
      avgInkCostPerMlMdl: 0.5,
    });

    expect(r.pricingFinal.printSellPrice).toBe(11);
    expect(r.pricingFinal.materialSellPrice).toBe(239);
    expect(r.pricingFinal.totalSellPrice).toBe(250);
    expect(r.lfMinUpliftMdl).toBe(169);

    const econ = lfRollEconomicsWithRevenueMargin(r.econCosts, r.pricingFinal.totalSellPrice);
    expect(econ.marginPercent).toBe(86);
  });

  it("does NOT apply lfMinimumLineTotalMdl uplift for dealers", () => {
    const m = goldenMaterial();
    const production = prod({
      inkMlPerSqmLargeFormatRoll: 20,
      lfInkRetailMarkupMultiplier: 1.5,
      lfMinimumLineTotalMdl: 250,
    });
    const r = computeLfResolvedLineLikeAdmin({
      m,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
      customerType: "dealer",
      production,
      avgInkCostPerMlMdl: 0.5,
    });

    // Dealer is exempt: no uplift, total stays below the 250 retail floor.
    expect(r.lfMinUpliftMdl).toBe(0);
    expect(r.pricingFinal.totalSellPrice).toBeLessThan(250);
  });
});
