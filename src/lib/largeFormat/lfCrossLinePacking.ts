/**
 * Cross-line packing for material-family orders.
 *
 * When multiple lines in one order share the same material family (e.g. ORACAL
 * MATT), pack them together on one billing roll instead of billing each line
 * independently — even if the lines have different print dimensions. This
 * eliminates overpayment from separate roll allocations and matches workshop
 * reality where all same-family positions are printed on one physical roll.
 *
 * Example: Two ORACAL MATT lines — 30×40 cm and 50×70 cm — → pack both tiles
 * on the narrowest sufficient roll, split the total lm between lines, and bill
 * each for their share.  The 100 MDL retail minimum is applied to the group
 * total, not per line.
 */

import { resolveGalleryWrapCm } from "./lfLayoutBorder";
import { packGroupTiles, GROUP_TILE_PACK_DEFAULT_GAP_CM } from "./groupTilePack";
import type { GroupTilePackTile, GroupTilePackPlacement } from "./groupTilePack";
import type { LargeFormatLineData, LargeFormatCustomerType } from "./types";
import type { AdminOrderLineInput } from "../validations";
import { prisma } from "../prisma";
import { resolveEffectivePrintableWidthMeters } from "./largeFormatRollConstants";
import { AdminOrderResolveError } from "../adminOrderCreateHelpers";
import { getOrCreateAccountingSettings } from "../accounting/accountingSettings";
import { parseProductionCostsJson } from "../accounting/types";
import { getOrCreateInkInventory } from "../ink/inkInventory";
import { DEFAULT_PRINT_PROCESS } from "../printProcess";
import {
  effectiveLfMaterialCostPerLinearMeterMdl,
  computeLfRollOrderEconomics,
} from "./lfRollOrderEconomics";
import { resolveLfSellRatesPerLinearMeterMdl } from "./lfResolveSellRates";
import { largeFormatMaterialToSnapshot } from "./toLargeFormatSnapshot";
import { computeLargeFormatLinePricing } from "./largeFormatLinePricing";
import {
  mergeLfPricingWithInkSell,
  computeLfInkSellPriceMdl,
} from "./lfInkSellPricing";
import { applyGroupMinimumSellTotal } from "./lfMinimumLineSell";
import { fetchFamilyRolls, type LfFamilyRollCandidate } from "./lfFamilyBilling";
import type { LargeFormatMaterial } from "@prisma/client";
import type { ProductionCostsConfig } from "../accounting/types";
import type { GroupTilePackResult } from "./groupTilePack";

export interface CrossLinePackResult {
  largeFormatMaterialId: string;
  largeFormatLineData: LargeFormatLineData;
  totalSellPriceMdl: number;
  calculatedLinearMeters: number;
}

/**
 * Cheapest-total-cost family billing roll selection.
 *
 * For each fitting roll in the family, runs `packGroupTiles` and computes the
 * customer-facing material sell price (`totalLM × sellRate`).  Returns the
 * roll with the lowest sell price.
 *
 * Ink cost is roll-invariant (based on print area, not roll dimensions), so it
 * does NOT affect the ranking. Comparing material sell alone is sufficient.
 *
 * Replaces the older `pickBillingRoll` "narrowest-sufficient" strategy: for
 * multi-tile groups a wider roll can dramatically reduce total roll length,
 * more than offsetting its higher per-LM rate.
 */
export interface CheapestFamilyRollResult {
  mat: LargeFormatMaterial;
  packResult: GroupTilePackResult;
  printableCm: number;
  totalMaterialSellMdl: number;
  effLm: number;
  resolvedSell: {
    finalRetailPricePerLinearMeter: number;
    finalDealerPricePerLinearMeter: number;
  };
}

export async function pickCheapestFamilyRollForTiles(params: {
  familyRolls: readonly LfFamilyRollCandidate[];
  tiles: readonly GroupTilePackTile[];
  customerType: LargeFormatCustomerType;
  prod: ProductionCostsConfig;
}): Promise<CheapestFamilyRollResult | null> {
  const { familyRolls, tiles, customerType, prod } = params;
  if (familyRolls.length === 0 || tiles.length === 0) return null;

  // Batch-fetch all family materials in a single query (avoids N findUnique).
  const rollIds = familyRolls.map((r) => r.id);
  const materials = await prisma.largeFormatMaterial.findMany({
    where: { id: { in: rollIds }, isActive: true },
  });
  const matById = new Map<string, LargeFormatMaterial>(
    materials.map((m) => [m.id, m]),
  );

  let best: CheapestFamilyRollResult | null = null;

  // Iterate family rolls in ascending-width order (deterministic tie-break).
  for (const roll of familyRolls) {
    const m = matById.get(roll.id);
    if (!m) continue;

    const printableM = resolveEffectivePrintableWidthMeters({
      printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
      rollWidthMeters: m.rollWidthMeters.toString(),
    });
    const printableCm = printableM * 100;

    const pack = packGroupTiles(
      tiles,
      printableCm,
      GROUP_TILE_PACK_DEFAULT_GAP_CM,
    );
    if (pack.unplacedTileIds.length > 0) continue; // doesn't fit

    const effLm = effectiveLfMaterialCostPerLinearMeterMdl(m);
    const resolvedSell = resolveLfSellRatesPerLinearMeterMdl({
      effectiveMaterialCostPerLinearMeterMdl: effLm,
      production: prod,
      material: m,
    });

    const totalLm = pack.totalAlongCm / 100;
    const pricingMat = computeLargeFormatLinePricing({
      calculatedLinearMeters: totalLm,
      customerType,
      material: {
        costPerLinearMeter: effLm,
        finalRetailPricePerLinearMeter:
          resolvedSell.finalRetailPricePerLinearMeter,
        finalDealerPricePerLinearMeter:
          resolvedSell.finalDealerPricePerLinearMeter,
        dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
        retailPricePerLinearMeter: m.retailPricePerLinearMeter,
        dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
        retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
      },
    });

    const totalMaterialSellMdl = pricingMat.materialSellPrice;

    if (!best || totalMaterialSellMdl < best.totalMaterialSellMdl) {
      best = {
        mat: m,
        packResult: pack,
        printableCm,
        totalMaterialSellMdl,
        effLm,
        resolvedSell,
      };
    }
  }

  return best;
}

/**
 * Group lines by material family for cross-line packing.
 * All same-family LF lines (regardless of print dimensions) are packed
 * together on one billing roll.
 * Returns map: familyKey → array of line indices.
 */
export function groupLinesForPacking(
  lines: AdminOrderLineInput[],
): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.productType !== "large_format_print") continue;
    if (!line.materialFamilyKey) continue;

    const key = line.materialFamilyKey;
    const indices = groups.get(key) ?? [];
    indices.push(i);
    groups.set(key, indices);
  }

  return groups;
}

/**
 * Resolve multiple same-family LF lines with cross-line packing.
 *
 * Lines may have **different** print dimensions — the packer handles mixed
 * tile sizes. The billing roll is chosen as the narrowest roll that fits the
 * widest tile.  The 100 MDL retail minimum is applied to the **group total**,
 * not per line.
 */
export async function resolveLargeFormatLineGroup(
  inputs: Array<{
    lineIndex: number;
    input: AdminOrderLineInput;
  }>,
): Promise<CrossLinePackResult[]> {
  if (inputs.length === 0) {
    throw new AdminOrderResolveError("Empty line group for cross-line packing");
  }

  // Validate all lines share the same material family.
  const first = inputs[0]!.input;
  const familyKey = first.materialFamilyKey!;
  const customerType = first.customerType!;

  for (const { input } of inputs) {
    if (input.materialFamilyKey !== familyKey) {
      throw new AdminOrderResolveError(
        "Cross-line packing requires same material family",
      );
    }
  }

  // Fetch family rolls.
  const familyRolls = await fetchFamilyRolls(prisma, familyKey);
  if (familyRolls.length === 0) {
    throw new AdminOrderResolveError("lf_family_not_found");
  }

  const galleryWrapCm = resolveGalleryWrapCm(familyRolls[0]!.name);

  // Compute effective dimensions per line (gallery-wrap inflated).
  const lineDims = inputs.map(({ input }) => ({
    effW: input.printWidthCm! + 2 * galleryWrapCm,
    effH: input.printHeightCm! + 2 * galleryWrapCm,
    rawW: input.printWidthCm!,
    rawH: input.printHeightCm!,
  }));

  // Create tiles for packing — each tile uses its own line's dimensions.
  const tiles: GroupTilePackTile[] = [];
  for (let idx = 0; idx < inputs.length; idx++) {
    const { lineIndex, input } = inputs[idx]!;
    const { effW, effH } = lineDims[idx]!;
    for (let copy = 1; copy <= input.quantity!; copy++) {
      tiles.push({
        id: `L${lineIndex}::${copy}`,
        label: `Line ${lineIndex + 1} (${copy}/${input.quantity})`,
        widthCm: effW,
        heightCm: effH,
        allowRotate: true,
      });
    }
  }

  // Load pricing/costing data once (needed both for cheapest-roll pick and
  // downstream per-line pricing).
  const acct = await getOrCreateAccountingSettings();
  const prod = parseProductionCostsJson(acct.productionCosts);

  // Pick the cheapest-total-cost roll for this tile set (rather than the
  // narrowest sufficient). Wider rolls sometimes save enough LM to beat their
  // higher per-LM rate — this policy always minimises the customer's material
  // sell price.
  const cheapest = await pickCheapestFamilyRollForTiles({
    familyRolls,
    tiles,
    customerType,
    prod,
  });
  if (!cheapest) {
    throw new AdminOrderResolveError("lf_pack_does_not_fit");
  }

  const {
    mat: m,
    packResult,
    printableCm,
    effLm,
    resolvedSell,
  } = cheapest;
  const snap = largeFormatMaterialToSnapshot(m, resolvedSell);
  const inkInv = await getOrCreateInkInventory(prisma, DEFAULT_PRINT_PROCESS);
  const rollW = Number(m.rollWidthMeters);

  // ── Phase 1: compute pricing for each line WITHOUT the group minimum ──

  // Proportional LM allocation: total roll consumption is shared across lines
  // by the ratio of each line's tile area to the group total.  This ensures
  // two separate lines packed side-by-side cost the same as one line with
  // qty=2 (both consume the same physical roll area).
  const totalLinearMeters = packResult.totalAlongCm / 100;
  const totalTileArea = packResult.placements.reduce(
    (sum, p) => sum + p.widthCm * p.heightCm,
    0,
  );

  interface LineIntermediate {
    lineIndex: number;
    input: AdminOrderLineInput;
    dims: typeof lineDims[number];
    linePlacements: GroupTilePackPlacement[];
    lineLinearMeters: number;
    pricing: Parameters<typeof applyGroupMinimumSellTotal>[0][number];
    econCosts: ReturnType<typeof computeLfRollOrderEconomics>;
  }
  const intermediates: LineIntermediate[] = [];

  for (let idx = 0; idx < inputs.length; idx++) {
    const { lineIndex, input } = inputs[idx]!;
    const dims = lineDims[idx]!;
    const lineQuantity = input.quantity!;

    const linePlacements = packResult.placements.filter((p) =>
      p.tileId.startsWith(`L${lineIndex}::`),
    );

    // Allocate linear meters proportionally by tile area.
    const lineTileArea = linePlacements.reduce(
      (sum, p) => sum + p.widthCm * p.heightCm,
      0,
    );
    const lineLinearMeters =
      totalTileArea > 0 ? totalLinearMeters * (lineTileArea / totalTileArea) : 0;

    const pricingMat = computeLargeFormatLinePricing({
      calculatedLinearMeters: lineLinearMeters,
      customerType,
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
      printWidthCm: dims.effW,
      printHeightCm: dims.effH,
      quantity: lineQuantity,
      calculatedLinearMeters: lineLinearMeters,
      rollWidthMeters: rollW,
      effectiveMaterialCostPerLinearMeterMdl: effLm,
      inkMlPerSqm: prod.inkMlPerSqmLargeFormatRoll,
      avgInkCostPerMlMdl: Number(inkInv.avgCostPerMl),
      totalSellPriceMdl: pricingMat.materialSellPrice,
    });

    const inkSellMdl = computeLfInkSellPriceMdl(
      econCosts.inkCostMdl,
      customerType,
      prod,
    );
    const pricing = mergeLfPricingWithInkSell(pricingMat, inkSellMdl);

    intermediates.push({
      lineIndex, input, dims, linePlacements, lineLinearMeters, pricing, econCosts,
    });
  }

  // ── Phase 2: apply group minimum (100 MDL retail, 0 dealer) ──

  const effectiveMinTotalMdl =
    customerType === "dealer" ? 0 : prod.lfMinimumLineTotalMdl;
  const { pricings: adjustedPricings } = applyGroupMinimumSellTotal(
    intermediates.map((r) => r.pricing),
    effectiveMinTotalMdl,
  );

  // ── Phase 3: build final results ──

  const results: CrossLinePackResult[] = [];

  for (let i = 0; i < intermediates.length; i++) {
    const { lineIndex, dims, linePlacements, econCosts } = intermediates[i]!;
    const finalPricing = adjustedPricings[i]!;

    const layout = {
      algorithmVersion: 2,
      printableWidthCm: printableCm,
      nominalRollWidthMeters: rollW,
      placements: linePlacements.map((p) => ({
        xCm: p.xCm,
        yCm: p.yCm,
        crossCm: p.widthCm,
        alongCm: p.heightCm,
        rotated: p.rotated,
      })),
    };

    const lineData: LargeFormatLineData = {
      materialSnapshot: snap,
      pricingPolicy: "min_sufficient_width",
      materialFamilyKey: familyKey,
      billingRoll: {
        materialId: m.id,
        materialSnapshot: snap,
      },
      printWidthCm: dims.rawW,
      printHeightCm: dims.rawH,
      galleryWrapCm: galleryWrapCm > 0 ? galleryWrapCm : undefined,
      quantity: intermediates[i]!.input.quantity!,
      customerType,
      calculatedLinearMeters: finalPricing.calculatedLinearMeters,
      materialCost: finalPricing.materialCost,
      materialSellPrice: finalPricing.materialSellPrice,
      printSellPrice: finalPricing.printSellPrice,
      totalSellPrice: finalPricing.totalSellPrice,
      estimatedProfit: finalPricing.estimatedProfit,
      layout,
      usefulAreaSqm: econCosts.usefulAreaSqm,
      writtenOffAreaSqm: econCosts.writtenOffAreaSqm,
      materialEfficiencyPct: econCosts.materialEfficiencyPct,
      materialPurchaseCostMdl: econCosts.materialPurchaseCostMdl,
      inkMlUsed: econCosts.inkMlUsed,
      inkCostMdl: econCosts.inkCostMdl,
    };

    results.push({
      largeFormatMaterialId: m.id,
      largeFormatLineData: lineData,
      totalSellPriceMdl: finalPricing.totalSellPrice,
      calculatedLinearMeters: finalPricing.calculatedLinearMeters,
    });
  }

  return results;
}
