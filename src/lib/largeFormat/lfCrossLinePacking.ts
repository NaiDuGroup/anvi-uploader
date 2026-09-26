/**
 * Cross-line packing for material-family orders.
 *
 * When multiple lines in one order share the same material family (e.g. ORACAL
 * MATT) and the same print dimensions, pack them together on one billing roll
 * instead of billing each line independently. This eliminates overpayment from
 * separate roll allocations and matches workshop reality.
 *
 * Example: Two 30×40 cm lines (different designs) each qty 1 → pack 2 tiles
 * together, split the total lm between lines, and bill each for their share.
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
import { applyLfMinimumLineSellTotalMdl } from "./lfMinimumLineSell";
import { fetchFamilyRolls, pickBillingRoll } from "./lfFamilyBilling";

export interface CrossLinePackResult {
  largeFormatMaterialId: string;
  largeFormatLineData: LargeFormatLineData;
  totalSellPriceMdl: number;
  calculatedLinearMeters: number;
}

/**
 * Group lines by family + dimensions for cross-line packing.
 * Returns map: groupKey → array of line indices.
 */
export function groupLinesForPacking(
  lines: AdminOrderLineInput[],
): Map<string, number[]> {
  const groups = new Map<string, number[]>();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.productType !== "large_format_print") continue;
    if (!line.materialFamilyKey) continue;

    const key = `${line.materialFamilyKey}|${line.printWidthCm}|${line.printHeightCm}`;
    const indices = groups.get(key) ?? [];
    indices.push(i);
    groups.set(key, indices);
  }

  return groups;
}

/**
 * Resolve multiple same-family same-size LF lines with cross-line packing.
 * Returns per-line resolutions with allocated linear meters from the shared pack.
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

  // Validate all lines have same family and dimensions.
  const first = inputs[0]!.input;
  const familyKey = first.materialFamilyKey!;
  const printWidthCm = first.printWidthCm!;
  const printHeightCm = first.printHeightCm!;
  const customerType = first.customerType!;

  for (const { input } of inputs) {
    if (
      input.materialFamilyKey !== familyKey ||
      input.printWidthCm !== printWidthCm ||
      input.printHeightCm !== printHeightCm
    ) {
      throw new AdminOrderResolveError(
        "Cross-line packing requires same family and dimensions",
      );
    }
  }

  // Fetch family rolls and pick billing roll.
  const familyRolls = await fetchFamilyRolls(prisma, familyKey);
  if (familyRolls.length === 0) {
    throw new AdminOrderResolveError("lf_family_not_found");
  }

  const galleryWrapCm = resolveGalleryWrapCm(familyRolls[0]!.name);
  const effPrintWidthCm = printWidthCm + 2 * galleryWrapCm;
  const effPrintHeightCm = printHeightCm + 2 * galleryWrapCm;

  // Total quantity across all lines.
  const totalQuantity = inputs.reduce((sum, { input }) => sum + input.quantity!, 0);

  const { billingRoll } = pickBillingRoll({
    familyRolls,
    printWidthCm: effPrintWidthCm,
    printHeightCm: effPrintHeightCm,
    quantity: totalQuantity,
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

  // Create tiles for packing: one per copy across all lines.
  const tiles: GroupTilePackTile[] = [];
  for (const { lineIndex, input } of inputs) {
    for (let copy = 1; copy <= input.quantity!; copy++) {
      tiles.push({
        id: `L${lineIndex}::${copy}`,
        label: `Line ${lineIndex + 1} (${copy}/${input.quantity})`,
        widthCm: effPrintWidthCm,
        heightCm: effPrintHeightCm,
        allowRotate: true,
      });
    }
  }

  // Pack all tiles together.
  const packResult = packGroupTiles(tiles, printableCm, GROUP_TILE_PACK_DEFAULT_GAP_CM);

  if (packResult.unplacedTileIds.length > 0) {
    throw new AdminOrderResolveError("lf_pack_does_not_fit");
  }

  const totalLinearMeters = packResult.totalAlongCm / 100;

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

  // Allocate linear meters to each line based on actual placement extents.
  // Each line gets credit for the y-range it spans on the strip.
  const results: CrossLinePackResult[] = [];

  for (const { lineIndex, input } of inputs) {
    const lineQuantity = input.quantity!;

    // Find placements for this line's tiles.
    const linePlacements = packResult.placements.filter((p) =>
      p.tileId.startsWith(`L${lineIndex}::`),
    );

    // Calculate this line's linear meters from its actual placement extent.
    // The extent is from the minimum y-coordinate to the maximum (y + height).
    // This correctly handles:
    // - Stacked tiles: each line gets its y-range
    // - Side-by-side tiles: lines share the same y-range and get charged equally
    // - Mixed layouts: each line gets the range its tiles span
    const lineLinearMeters =
      linePlacements.length > 0
        ? (Math.max(...linePlacements.map((p) => p.yCm + p.heightCm)) -
            Math.min(...linePlacements.map((p) => p.yCm))) /
          100
        : 0;

    // Compute pricing for this line's allocated lm.
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

    // Compute economics (ink cost, etc).
    const econCosts = computeLfRollOrderEconomics({
      printWidthCm: effPrintWidthCm,
      printHeightCm: effPrintHeightCm,
      quantity: lineQuantity,
      calculatedLinearMeters: lineLinearMeters,
      rollWidthMeters: rollW,
      effectiveMaterialCostPerLinearMeterMdl: effLm,
      inkMlPerSqm: prod.inkMlPerSqmLargeFormatRoll,
      avgInkCostPerMlMdl: Number(inkInv.avgCostPerMl),
      totalSellPriceMdl: pricingMat.materialSellPrice,
    });

    // Compute ink sell price.
    const inkSellMdl = computeLfInkSellPriceMdl(
      econCosts.inkCostMdl,
      customerType,
      prod,
    );

    // Merge ink pricing.
    const mergedPricing = mergeLfPricingWithInkSell(pricingMat, inkSellMdl);

    // Apply 100 MDL minimum if configured.
    // Dealers are exempt from the per-line minimum.
    const effectiveMinTotalMdl =
      customerType === "dealer" ? 0 : prod.lfMinimumLineTotalMdl;
    const uplifted = applyLfMinimumLineSellTotalMdl(
      mergedPricing,
      effectiveMinTotalMdl,
    );
    const finalPricing = uplifted.pricing;

    // Build persisted layout from placements.
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
      printWidthCm,
      printHeightCm,
      galleryWrapCm: galleryWrapCm > 0 ? galleryWrapCm : undefined,
      quantity: lineQuantity,
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
