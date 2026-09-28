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
import { fetchFamilyRolls, pickBillingRoll } from "./lfFamilyBilling";

export interface CrossLinePackResult {
  largeFormatMaterialId: string;
  largeFormatLineData: LargeFormatLineData;
  totalSellPriceMdl: number;
  calculatedLinearMeters: number;
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

  // Pick the billing roll using the "critical" tile — the one requiring the
  // widest roll (max of min(effW, effH), since tiles can rotate).
  let criticalIdx = 0;
  let maxMinDim = 0;
  for (let i = 0; i < lineDims.length; i++) {
    const { effW, effH } = lineDims[i]!;
    const minDim = Math.min(effW, effH);
    if (minDim > maxMinDim) {
      maxMinDim = minDim;
      criticalIdx = i;
    }
  }

  const { billingRoll } = pickBillingRoll({
    familyRolls,
    printWidthCm: lineDims[criticalIdx]!.effW,
    printHeightCm: lineDims[criticalIdx]!.effH,
    quantity: 1,
  });

  if (!billingRoll) {
    throw new AdminOrderResolveError("lf_pack_does_not_fit");
  }

  // Fetch the full material record.
  const m = await prisma.largeFormatMaterial.findUnique({
    where: { id: billingRoll.id },
  });
  if (!m || !m.isActive) {
    throw new AdminOrderResolveError("lf_billing_roll_inactive");
  }

  const printableM = resolveEffectivePrintableWidthMeters({
    printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
    rollWidthMeters: m.rollWidthMeters.toString(),
  });
  const printableCm = printableM * 100;

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

  // Pack all tiles together.
  const packResult = packGroupTiles(tiles, printableCm, GROUP_TILE_PACK_DEFAULT_GAP_CM);

  if (packResult.unplacedTileIds.length > 0) {
    throw new AdminOrderResolveError("lf_pack_does_not_fit");
  }

  // Fetch pricing/costing data.
  const acct = await getOrCreateAccountingSettings();
  const prod = parseProductionCostsJson(acct.productionCosts);
  const effLm = effectiveLfMaterialCostPerLinearMeterMdl(m);
  const resolvedSell = resolveLfSellRatesPerLinearMeterMdl({
    effectiveMaterialCostPerLinearMeterMdl: effLm,
    production: prod,
    material: m,
  });
  const snap = largeFormatMaterialToSnapshot(m, resolvedSell);
  const inkInv = await getOrCreateInkInventory(prisma, DEFAULT_PRINT_PROCESS);
  const rollW = Number(m.rollWidthMeters);

  // ── Phase 1: compute pricing for each line WITHOUT the group minimum ──

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

    const lineLinearMeters =
      linePlacements.length > 0
        ? (Math.max(...linePlacements.map((p) => p.yCm + p.heightCm)) -
            Math.min(...linePlacements.map((p) => p.yCm))) /
          100
        : 0;

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
