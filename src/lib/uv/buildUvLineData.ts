import { cappedTierTotal, tierPriceForQuantity } from "@/lib/dtf/garmentPriceTiers";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { uvItemSnapshot } from "@/lib/uv/stockItems";
import {
  computeUvLineTotals,
  resolveUvZones,
  roundMoney2,
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

/** `StockCategory.code` of pens (as `PENS_CATEGORY_CODE`; not imported — that module pulls in Prisma). */
const PENS_CATEGORY_CODE = "pens";

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
 * sublimation blanks). Pens at the retail tier: a bigger package is never
 * cheaper — the item total is capped by every higher tier at its minimum
 * quantity (4 pens cost 300 like 5 at 60); the unit is that total / quantity.
 * Extra zones and client items are priced from the print
 * parameters (area × rate per m², at least the zone minimum).
 * UV-DTF (technique «transfer», always for stickers): the zones are laid out on
 * the film and the line pays the film metres × price per metre (zones a stock
 * item includes cost nothing), at least the UV-DTF minimum without an item.
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
  let itemSellTotalMdl: number | undefined;

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
      if (ctx.item.categoryCode === PENS_CATEGORY_CODE && input.quantity > 0) {
        const capped: number = cappedTierTotal(ctx.item.priceTiers, input.quantity, tier.priceMdl);
        if (capped < roundMoney2(input.quantity * tier.priceMdl)) {
          itemSellTotalMdl = capped;
          unitItemPriceMdl = roundMoney2(capped / input.quantity);
        }
      }
    }
    unitItemCostMdl = ctx.item.unitCostMdl ?? 0;
  } else if (input.source === "client") {
    clientItem = {
      description: input.clientItem?.description.trim() ?? "",
      notes: input.clientItem?.notes?.trim() || null,
    };
  }

  const technique = input.source === "stickers" ? "transfer" : (input.technique ?? "direct");
  const zones = resolveUvZones(
    input.zones,
    customerType,
    ctx.settings,
    isStock ? { included: true, printArea: ctx.item?.printArea ?? null } : UV_CLIENT_MAIN_ZONE,
    technique,
  );
  const totals = computeUvLineTotals({
    source: input.source,
    quantity: input.quantity,
    zones,
    unitItemPriceMdl,
    itemSellTotalMdl,
    tierMinQty,
    itemPriceSource,
    unitItemCostMdl,
    settings: ctx.settings,
    inkCosts: ctx.inkCosts,
    customerType,
    technique,
  });

  return {
    version: UV_LINE_DATA_VERSION,
    source: input.source,
    item,
    clientItem,
    customerType,
    ...(technique === "transfer" ? { technique } : {}),
    quantity: input.quantity,
    zones,
    ...totals,
  };
}
