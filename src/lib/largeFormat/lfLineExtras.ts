import { computeLfFinishing, isEmptyLfFinishing, lfFinishingSummaryRu, type LfFinishingInput } from "./lfFinishing";
import { LF_KITS, lfKitSizeMatches, lfKitTitleRu, type LfKitId } from "./lfKits";
import type { LargeFormatLineData } from "./types";

/**
 * Banner finishing and roll-up / X-banner sets on a resolved large-format
 * line. Runs after the roll pricing (single line or same-material group,
 * minimum included), so a line without extras is exactly what it was:
 *
 * - finishing: its total is added to `totalSellPrice` (the 100-lei minimum
 *   is for the print; finishing comes on top), the ring cost to the direct cost;
 * - kit: the set price × pieces replaces the print price (like a size
 *   preset), the stand cost is added to the direct cost.
 *
 * Pure: the callers turn a failure code into their own error.
 */
export interface LfLineExtrasInput {
  finishing?: LfFinishingInput | null;
  kit?: LfKitId | null;
}

export type LfLineExtrasResult =
  | { ok: true; data: LargeFormatLineData }
  | { ok: false; code: "lf_kit_size_mismatch" | "lf_kit_with_finishing" | "lf_kit_with_preset" };

export function hasLfLineExtras(extras: LfLineExtrasInput | null | undefined): boolean {
  return !!extras && (!!extras.kit || !isEmptyLfFinishing(extras.finishing));
}

function marginPercent(total: number, cost: number): number {
  return total > 0 ? Math.round(((total - cost) / total) * 10000) / 100 : 0;
}

export function applyLfLineExtras(data: LargeFormatLineData, extras: LfLineExtrasInput | null | undefined): LfLineExtrasResult {
  if (!hasLfLineExtras(extras)) return { ok: true, data };
  const finishingInput: LfFinishingInput | null = isEmptyLfFinishing(extras!.finishing) ? null : extras!.finishing!;

  if (extras!.kit) {
    if (finishingInput) return { ok: false, code: "lf_kit_with_finishing" };
    if (data.sizePresetSnapshot) return { ok: false, code: "lf_kit_with_preset" };
    const kit = LF_KITS[extras!.kit];
    if (!lfKitSizeMatches(kit, data.printWidthCm, data.printHeightCm)) return { ok: false, code: "lf_kit_size_mismatch" };
    const total: number = kit.priceMdl * data.quantity;
    const directCost: number = (data.totalDirectCostMdl ?? data.materialCost) + kit.standCostMdl * data.quantity;
    const out: LargeFormatLineData = {
      ...data,
      kit: {
        id: kit.id,
        kind: kit.kind,
        widthCm: kit.widthCm,
        heightCm: kit.heightCm,
        hiddenBottomCm: kit.hiddenBottomCm,
        unitPriceMdl: kit.priceMdl,
        standSku: kit.standSku,
        standCostMdl: kit.standCostMdl,
        printFormulaSellMdl: data.totalSellPrice,
        cornerEyelets: kit.cornerEyelets,
      },
      materialSellPrice: total,
      printSellPrice: 0,
      totalSellPrice: total,
      totalDirectCostMdl: directCost,
      estimatedProfit: total - directCost,
      marginPercent: marginPercent(total, directCost),
      inkSellPriceMdl: undefined,
      inkSellPerSqmMdl: undefined,
      lfInkMarkupMultiplierUsed: undefined,
      lfMinimumLineSellUpliftMdl: undefined,
      lfMinimumLineTotalSettingMdl: undefined,
    };
    return { ok: true, data: out };
  }

  const finishing = computeLfFinishing(finishingInput, data.printWidthCm, data.printHeightCm, data.quantity);
  if (!finishing) return { ok: true, data };
  const total: number = data.totalSellPrice + finishing.totalMdl;
  const directCost: number = (data.totalDirectCostMdl ?? data.materialCost) + finishing.costMdl;
  return {
    ok: true,
    data: {
      ...data,
      finishing,
      totalSellPrice: total,
      totalDirectCostMdl: directCost,
      estimatedProfit: total - directCost,
      marginPercent: marginPercent(total, directCost),
    },
  };
}

/**
 * The studio wizard's line price with the line's extras (a shop line opened
 * for editing): the set price × pieces, or the print + finishing. Same rule
 * as {@link applyLfLineExtras}; the server re-prices on save.
 */
export function lfLineTotalWithExtrasMdl(
  printTotalMdl: number,
  line: { widthCm: number; heightCm: number; quantity: number },
  extras: LfLineExtrasInput | null | undefined,
): number {
  if (!hasLfLineExtras(extras)) return printTotalMdl;
  if (extras!.kit) return LF_KITS[extras!.kit].priceMdl * line.quantity;
  return printTotalMdl + (computeLfFinishing(extras!.finishing, line.widthCm, line.heightCm, line.quantity)?.totalMdl ?? 0);
}

/** «Roll-up 80×200 со стойкой» / «люверсы шаг ≤50 см по периметру (12 шт.), …» of a wizard line; "" without extras. */
export function lfLineExtrasInputRu(
  line: { widthCm: number; heightCm: number; quantity: number },
  extras: LfLineExtrasInput | null | undefined,
): string {
  if (!hasLfLineExtras(extras)) return "";
  if (extras!.kit) return lfKitTitleRu(LF_KITS[extras!.kit]);
  return lfFinishingSummaryRu(computeLfFinishing(extras!.finishing, line.widthCm, line.heightCm, line.quantity));
}
