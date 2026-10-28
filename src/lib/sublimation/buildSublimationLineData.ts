import { sublimationNormFor, type SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import type { SublimationStockItemJson } from "@/lib/sublimation/dto";
import { sublimationItemSnapshot } from "@/lib/sublimation/stockItems";
import {
  computeSublimationClientLineTotals,
  computeSublimationLineTotals,
  SublimationLineError,
  SublimationLineErrorCode,
  sublimationClientUnitPrice,
  sublimationUnitPrice,
  type SublimationConsumableCosts,
} from "@/lib/sublimation/sublimationLineCalc";
import type { SublimationLineInput } from "@/lib/sublimation/sublimationLineInput";
import {
  SUBLIMATION_LINE_DATA_VERSION,
  type SublimationClientItem,
  type SublimationCustomerType,
  type SublimationLineData,
} from "@/lib/sublimation/types";

/** Everything needed to price a sublimation line; loaded from the DB or the wizard catalog. */
export interface SublimationPricingContext {
  /** The picked blank (null for client items or when not found / not printable). */
  item: SublimationStockItemJson | null;
  settings: SublimationSettings;
  consumableCosts: SublimationConsumableCosts;
}

/**
 * Price one sublimation line and produce the persisted snapshot. Pure: the
 * server and the order wizard run the same code.
 *
 * Stock blank: the print is included in the blank's price (run-size tier;
 * dealer price for dealers when set); Epson use comes from the blank's
 * category norm. Client item: priced from the print size (area × rate per m²,
 * at least the per-piece minimum, + set-up fee, raised to the line minimum);
 * Epson use from the area. Throws {@link SublimationLineError}.
 */
export function buildSublimationLineData(
  input: SublimationLineInput,
  customerType: SublimationCustomerType,
  ctx: SublimationPricingContext,
): SublimationLineData {
  if (input.source === "client") return buildClientLine(input, customerType, ctx);
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
    source: "stock",
    item: sublimationItemSnapshot(ctx.item),
    clientItem: null,
    customerType,
    quantity: input.quantity,
    ...totals,
  };
}

function buildClientLine(
  input: SublimationLineInput,
  customerType: SublimationCustomerType,
  ctx: SublimationPricingContext,
): SublimationLineData {
  const c = input.clientItem;
  if (!c) throw new SublimationLineError(SublimationLineErrorCode.ClientItemRequired);
  const clientItem: SublimationClientItem = {
    description: c.description.trim(),
    notes: c.notes?.trim() || null,
    widthCm: c.widthCm,
    heightCm: c.heightCm,
  };
  const unitPrice = sublimationClientUnitPrice(c.widthCm, c.heightCm, customerType, ctx.settings.clientItem);
  const totals = computeSublimationClientLineTotals({
    quantity: input.quantity,
    unitPrice,
    settings: ctx.settings.clientItem,
    wastePct: ctx.settings.wastePct,
    consumableCosts: ctx.consumableCosts,
  });
  return {
    version: SUBLIMATION_LINE_DATA_VERSION,
    source: "client",
    item: null,
    clientItem,
    customerType,
    quantity: input.quantity,
    ...totals,
  };
}
