import { sublimationNormFor, type SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import type { SublimationStockItemJson } from "@/lib/sublimation/dto";
import { sublimationItemSnapshot } from "@/lib/sublimation/stockItems";
import {
  computeSublimationLineTotals,
  SublimationLineError,
  SublimationLineErrorCode,
  sublimationUnitPrice,
  type SublimationConsumableCosts,
} from "@/lib/sublimation/sublimationLineCalc";
import type { SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import {
  SUBLIMATION_LINE_DATA_VERSION,
  type SublimationCustomerType,
  type SublimationLineData,
} from "@/lib/sublimation/types";

/** Everything needed to price a sublimation line; loaded from the DB or the wizard catalog. */
export interface SublimationPricingContext {
  /** The picked blank (null when not found / not printable). */
  item: SublimationStockItemJson | null;
  settings: SublimationSettings;
  consumableCosts: SublimationConsumableCosts;
}

/**
 * Price one sublimation line and produce the persisted snapshot. Pure: the
 * server and the order wizard run the same code. The print is included in the
 * blank's price (run-size tier; dealer price for dealers when set); Epson use
 * comes from the blank's category norm. Throws {@link SublimationLineError}.
 */
export function buildSublimationLineData(
  input: SublimationLineInput,
  customerType: SublimationCustomerType,
  ctx: SublimationPricingContext,
): SublimationLineData {
  if (!ctx.item || ctx.item.id !== input.variantId) {
    throw new SublimationLineError(SublimationLineErrorCode.ItemNotFound);
  }
  const unitPrice = sublimationUnitPrice(ctx.item, input.quantity, customerType);
  if (!unitPrice) throw new SublimationLineError(SublimationLineErrorCode.ItemNoPrice);
  const totals = computeSublimationLineTotals({
    quantity: input.quantity,
    unitPrice,
    unitItemCostMdl: ctx.item.unitCostMdl ?? 0,
    norm: sublimationNormFor(ctx.settings, ctx.item.categoryCode),
    wastePct: ctx.settings.wastePct,
    consumableCosts: ctx.consumableCosts,
  });
  return {
    version: SUBLIMATION_LINE_DATA_VERSION,
    item: sublimationItemSnapshot(ctx.item),
    customerType,
    quantity: input.quantity,
    ...totals,
  };
}
