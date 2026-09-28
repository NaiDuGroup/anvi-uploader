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

/**
 * Pure variant of {@link pickCheapestFamilyRollForTiles}: caller supplies the
 * full `LargeFormatMaterial` rows (typically fetched once at the call site),
 * so this function is synchronous and trivially unit-testable.
 *
 * Materials are iterated in the order given by the caller — pass them sorted
 * by ascending roll width for deterministic tie-breaks (or in any order when
 * ties are not possible for the given tiles).
 */
export function pickCheapestFamilyMaterialForTiles(params: {
  materials: readonly LargeFormatMaterial[];
  tiles: readonly GroupTilePackTile[];
  customerType: LargeFormatCustomerType;
  prod: ProductionCostsConfig;
}): CheapestFamilyRollResult | null {
  const { materials, tiles, customerType, prod } = params;
  if (materials.length === 0 || tiles.length === 0) return null;

  let best: CheapestFamilyRollResult | null = null;

  for (const m of materials) {
    if (!m.isActive) continue;

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
 * Async wrapper that batch-fetches family materials from Prisma and delegates
 * to {@link pickCheapestFamilyMaterialForTiles}. Kept for callers that only
 * have `LfFamilyRollCandidate` on hand.
 */
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
  // Iterate in the roll order the caller supplied (usually ascending width).
  const ordered = familyRolls
    .map((r) => matById.get(r.id))
    .filter((m): m is LargeFormatMaterial => m != null);

  return pickCheapestFamilyMaterialForTiles({
    materials: ordered,
    tiles,
    customerType,
    prod,
  });
}

/**
 * Composite group key for cross-line packing. Groups only pool lines that
 * share both the material family AND the customer tier — a dealer line and a
 * retail line for the same material family are billed on separate rolls at
 * separate sell rates and cannot share a group.
 */
function familyGroupKey(familyKey: string, customerType: string): string {
  return `${familyKey}::${customerType}`;
}

/**
 * Group lines by (materialFamilyKey, customerType) for cross-line packing.
 * All lines with the same family AND the same customer type (regardless of
 * print dimensions) are packed together on one billing roll.
 * Returns map: compositeKey → array of line indices.
 */
export function groupLinesForPacking(
  lines: AdminOrderLineInput[],
): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.productType !== "large_format_print") continue;
    if (!line.materialFamilyKey) continue;
    if (!line.customerType) continue;

    const key = familyGroupKey(line.materialFamilyKey, line.customerType);
    const indices = groups.get(key) ?? [];
    indices.push(i);
    groups.set(key, indices);
  }

  return groups;
}

/**
 * Simple per-line input shape used by the pure billing computer. Keeps the
 * computer independent of the wider `AdminOrderLineInput` validation schema.
 */
export interface LargeFormatLineGroupLineInput {
  lineIndex: number;
  printWidthCm: number;
  printHeightCm: number;
  quantity: number;
}

/**
 * Pure end-to-end family-group billing computation. No I/O — caller supplies
 * the fetched materials, production settings and ink inventory. This is the
 * single place where per-line pricing, ink markup, LM allocation and the
 * group-minimum uplift live, so any change here shows up in golden tests.
 */
export function computeLargeFormatLineGroupBilling(params: {
  familyKey: string;
  materials: readonly LargeFormatMaterial[];
  customerType: LargeFormatCustomerType;
  prod: ProductionCostsConfig;
  avgInkCostPerMlMdl: number;
  lines: readonly LargeFormatLineGroupLineInput[];
}): CrossLinePackResult[] {
  const { familyKey, materials, customerType, prod, avgInkCostPerMlMdl, lines } =
    params;

  if (lines.length === 0) {
    throw new AdminOrderResolveError("Empty line group for cross-line packing");
  }
  if (materials.length === 0) {
    throw new AdminOrderResolveError("lf_family_not_found");
  }

  const galleryWrapCm = resolveGalleryWrapCm(materials[0]!.name);

  // Compute effective dimensions per line (gallery-wrap inflated).
  const lineDims = lines.map((l) => ({
    effW: l.printWidthCm + 2 * galleryWrapCm,
    effH: l.printHeightCm + 2 * galleryWrapCm,
    rawW: l.printWidthCm,
    rawH: l.printHeightCm,
  }));

  // Create tiles for packing — each tile uses its own line's dimensions.
  const tiles: GroupTilePackTile[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    const { effW, effH } = lineDims[idx]!;
    for (let copy = 1; copy <= line.quantity; copy++) {
      tiles.push({
        id: `L${line.lineIndex}::${copy}`,
        label: `Line ${line.lineIndex + 1} (${copy}/${line.quantity})`,
        widthCm: effW,
        heightCm: effH,
        allowRotate: true,
      });
    }
  }

  // Pick the cheapest-total-cost roll for this tile set (rather than the
  // narrowest sufficient). Wider rolls sometimes save enough LM to beat their
  // higher per-LM rate — this policy always minimises the customer's material
  // sell price.
  const cheapest = pickCheapestFamilyMaterialForTiles({
    materials,
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
    line: LargeFormatLineGroupLineInput;
    dims: typeof lineDims[number];
    linePlacements: GroupTilePackPlacement[];
    lineLinearMeters: number;
    pricing: Parameters<typeof applyGroupMinimumSellTotal>[0][number];
    econCosts: ReturnType<typeof computeLfRollOrderEconomics>;
  }
  const intermediates: LineIntermediate[] = [];

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx]!;
    const dims = lineDims[idx]!;
    const lineQuantity = line.quantity;

    const linePlacements = packResult.placements.filter((p) =>
      p.tileId.startsWith(`L${line.lineIndex}::`),
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
      avgInkCostPerMlMdl,
      totalSellPriceMdl: pricingMat.materialSellPrice,
    });

    const inkSellMdl = computeLfInkSellPriceMdl(
      econCosts.inkCostMdl,
      customerType,
      prod,
    );
    const pricing = mergeLfPricingWithInkSell(pricingMat, inkSellMdl);

    intermediates.push({
      line, dims, linePlacements, lineLinearMeters, pricing, econCosts,
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
    const { line, dims, linePlacements, econCosts } = intermediates[i]!;
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
      quantity: line.quantity,
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

/**
 * Resolve multiple same-family, same-customer-type LF lines with cross-line
 * packing. Fetches materials + accounting + ink inventory, then delegates the
 * pricing math to {@link computeLargeFormatLineGroupBilling} (which is a pure
 * function and covered by golden tests).
 *
 * Lines may have **different** print dimensions — the packer handles mixed
 * tile sizes. The billing roll is chosen as the cheapest-total-cost roll.
 * The 100 MDL retail minimum is applied to the **group total**, not per line.
 * All lines must share the same `materialFamilyKey` AND the same
 * `customerType`; grouping is done upstream via {@link groupLinesForPacking}.
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

  // Validate all lines share the same material family AND customer type.
  const first = inputs[0]!.input;
  const familyKey = first.materialFamilyKey!;
  const customerType = first.customerType!;

  for (const { input } of inputs) {
    if (input.materialFamilyKey !== familyKey) {
      throw new AdminOrderResolveError(
        "Cross-line packing requires same material family",
      );
    }
    if (input.customerType !== customerType) {
      throw new AdminOrderResolveError(
        "Cross-line packing requires same customer type",
      );
    }
  }

  // Fetch family rolls (id-only metadata for existence check).
  const familyRolls = await fetchFamilyRolls(prisma, familyKey);
  if (familyRolls.length === 0) {
    throw new AdminOrderResolveError("lf_family_not_found");
  }

  // Batch-fetch the full material rows in the same ascending-width order as
  // `familyRolls` for deterministic tie-breaks in the picker.
  const rollIds = familyRolls.map((r) => r.id);
  const materials = await prisma.largeFormatMaterial.findMany({
    where: { id: { in: rollIds }, isActive: true },
  });
  const matById = new Map<string, LargeFormatMaterial>(
    materials.map((m) => [m.id, m]),
  );
  const orderedMaterials = familyRolls
    .map((r) => matById.get(r.id))
    .filter((m): m is LargeFormatMaterial => m != null);

  const acct = await getOrCreateAccountingSettings();
  const prod = parseProductionCostsJson(acct.productionCosts);
  const inkInv = await getOrCreateInkInventory(prisma, DEFAULT_PRINT_PROCESS);

  return computeLargeFormatLineGroupBilling({
    familyKey,
    materials: orderedMaterials,
    customerType,
    prod,
    avgInkCostPerMlMdl: Number(inkInv.avgCostPerMl),
    lines: inputs.map(({ lineIndex, input }) => ({
      lineIndex,
      printWidthCm: input.printWidthCm!,
      printHeightCm: input.printHeightCm!,
      quantity: input.quantity!,
    })),
  });
}
