import { tierPriceForQuantity } from "@/lib/dtf/garmentPriceTiers";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { uvItemSnapshot } from "@/lib/uv/stockItems";
import {
  computeUvLineTotals,
  resolveUvZones,
  UV_CLIENT_MAIN_ZONE,
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
  settings: UvSettings;
  inkCosts: UvInkCosts;
}

/**
 * Price one UV line and produce the persisted snapshot. Pure: the server and
 * the order wizard run the same code.
 *
 * Stock item: the price per piece already includes its main print (first zone,
 * sized by the item's print parameters) — the retail run-size tier at the line
 * quantity, or for dealers the variant's dealer price when it is lower (as
 * sublimation blanks). Extra zones and client items are priced from the print
 * parameters (area × rate per m², at least the zone minimum).
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
  let itemPriceSource: "tier" | "dealer" | null = null;

  if (isStock) {
    if (!ctx.item || ctx.item.id !== input.variantId) {
      throw new UvLineError(UvLineErrorCode.ItemNotFound);
    }
    const tier = tierPriceForQuantity(ctx.item.priceTiers, input.quantity);
    if (!tier) throw new UvLineError(UvLineErrorCode.ItemNoPrice);
    item = uvItemSnapshot(ctx.item);
    tierMinQty = tier.minQty;
    const dealer: number | null = ctx.item.dealerPriceMdl;
    if (customerType === "dealer" && dealer != null && dealer < tier.priceMdl) {
      unitItemPriceMdl = dealer;
      itemPriceSource = "dealer";
    } else {
      unitItemPriceMdl = tier.priceMdl;
      itemPriceSource = "tier";
    }
    unitItemCostMdl = ctx.item.unitCostMdl ?? 0;
  } else {
    clientItem = {
      description: input.clientItem?.description.trim() ?? "",
      notes: input.clientItem?.notes?.trim() || null,
    };
  }

  const zones = resolveUvZones(
    input.zones,
    customerType,
    ctx.settings,
    isStock ? { included: true, printArea: ctx.item?.printArea ?? null } : UV_CLIENT_MAIN_ZONE,
  );
  const totals = computeUvLineTotals({
    source: input.source,
    quantity: input.quantity,
    zones,
    unitItemPriceMdl,
    tierMinQty,
    itemPriceSource,
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
