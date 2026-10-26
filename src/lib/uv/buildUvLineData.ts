import { tierPriceForQuantity } from "@/lib/dtf/garmentPriceTiers";
import type { PrintPresetOption } from "@/lib/printMethods/presets";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { uvItemSnapshot } from "@/lib/uv/stockItems";
import {
  computeUvLineTotals,
  resolveUvZones,
  UvLineError,
  UvLineErrorCode,
  type UvInkCosts,
} from "@/lib/uv/uvLineCalc";
import type { UvLineInput } from "@/lib/uv/uvLineInput";
import {
  UV_LINE_DATA_VERSION,
  type UvClientItem,
  type UvCustomerType,
  type UvItemSnapshot,
  type UvLineData,
} from "@/lib/uv/types";

/** Everything needed to price a UV line; loaded from the DB or the wizard catalog. */
export interface UvPricingContext {
  /** The picked stock variant (null for client items or when not found). */
  item: UvStockItemJson | null;
  presets: readonly PrintPresetOption[];
  settings: UvSettings;
  inkCosts: UvInkCosts;
}

/**
 * Price one UV line and produce the persisted snapshot. Pure: the server and
 * the order wizard run the same code. Item prices come from the variant's
 * run-size tiers at the line quantity and do not depend on the customer type
 * (as DTF garments); print formats use the dealer price for dealers.
 * Throws {@link UvLineError}.
 */
export function buildUvLineData(
  input: UvLineInput,
  customerType: UvCustomerType,
  ctx: UvPricingContext,
): UvLineData {
  const isStock: boolean = input.source === "stock";
  let item: UvItemSnapshot | null = null;
  let clientItem: UvClientItem | null = null;
  let unitItemPriceMdl = 0;
  let unitItemCostMdl = 0;
  let tierMinQty: number | null = null;

  if (isStock) {
    if (!ctx.item || ctx.item.id !== input.variantId) {
      throw new UvLineError(UvLineErrorCode.ItemNotFound);
    }
    const tier = tierPriceForQuantity(ctx.item.priceTiers, input.quantity);
    if (!tier) throw new UvLineError(UvLineErrorCode.ItemNoPrice);
    item = uvItemSnapshot(ctx.item);
    unitItemPriceMdl = tier.priceMdl;
    tierMinQty = tier.minQty;
    unitItemCostMdl = ctx.item.unitCostMdl ?? 0;
  } else {
    clientItem = {
      description: input.clientItem?.description.trim() ?? "",
      notes: input.clientItem?.notes?.trim() || null,
    };
  }

  const zones = resolveUvZones(input.zones, ctx.presets, customerType, ctx.settings, isStock);
  const totals = computeUvLineTotals({
    source: input.source,
    quantity: input.quantity,
    zones,
    unitItemPriceMdl,
    tierMinQty,
    unitItemCostMdl,
    settings: ctx.settings,
    inkCosts: ctx.inkCosts,
  });

  return {
    version: UV_LINE_DATA_VERSION,
    source: input.source,
    item,
    clientItem,
    customerType,
    quantity: input.quantity,
    zones,
    ...totals,
  };
}
