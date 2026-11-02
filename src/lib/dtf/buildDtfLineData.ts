import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import {
  computeDtfLineTotals,
  DtfLineError,
  DtfLineErrorCode,
  resolveDtfZones,
  type DtfPresetOption,
  type DtfUnitCosts,
} from "@/lib/dtf/dtfLineCalc";
import type { DtfLineInput } from "@/lib/dtf/dtfLineInput";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import { tierPriceForQuantity } from "@/lib/dtf/garmentPriceTiers";
import {
  DTF_LINE_DATA_VERSION,
  type DtfCustomerType,
  type DtfGarmentSnapshot,
  type DtfLineData,
  type DtfLineSize,
} from "@/lib/dtf/types";

/** Everything needed to price a DTF line; loaded from the DB or the wizard catalog. */
export interface DtfPricingContext {
  /** The picked stock garment colour (null for client garments or when not found). */
  garment: DtfGarmentJson | null;
  presets: readonly DtfPresetOption[];
  settings: DtfSettings;
  unitCosts: DtfUnitCosts;
}

/**
 * Price each size from its own run-size tiers at the run quantity (the line's,
 * or of its layout across the order's lines); sizes of one colour normally
 * share the tiers. Dealers pay the variant's
 * fixed dealer price when it is set.
 */
function resolveStockSizes(
  input: DtfLineInput,
  garment: DtfGarmentJson | null,
  runQuantity: number,
  customerType: DtfCustomerType,
): { snapshot: DtfGarmentSnapshot; sizes: DtfLineSize[]; tierMinQty: number } {
  if (!garment || garment.id !== input.garmentProductId) {
    throw new DtfLineError(DtfLineErrorCode.GarmentNotFound);
  }
  const variantBySize = new Map(garment.variants.map((v) => [v.size.toUpperCase(), v]));
  let tierMinQty = 0;
  const sizes: DtfLineSize[] = input.sizes.map((s) => {
    const variant = variantBySize.get(s.size.toUpperCase());
    if (!variant) throw new DtfLineError(DtfLineErrorCode.SizeUnknown);
    const tier = tierPriceForQuantity(variant.priceTiers, runQuantity);
    if (!tier) throw new DtfLineError(DtfLineErrorCode.GarmentNoPrice);
    tierMinQty = Math.max(tierMinQty, tier.minQty);
    const dealer: number | null | undefined = variant.dealerPriceMdl;
    // Dealers pay their fixed item price (no run steps), like their print prices.
    const unitSellPriceMdl: number = customerType === "dealer" && dealer != null ? dealer : tier.priceMdl;
    return {
      garmentVariantId: variant.id,
      size: variant.size,
      quantity: s.quantity,
      unitSellPriceMdl,
      unitCostMdl: variant.unitCostMdl ?? 0,
    };
  });
  return {
    snapshot: {
      garmentProductId: garment.id,
      stockItemId: garment.stockItemId,
      categoryCode: garment.categoryCode,
      kind: garment.kind,
      name: garment.name,
      colorName: garment.colorName,
      colorHex: garment.colorHex,
    },
    sizes,
    tierMinQty,
  };
}

/**
 * Price one DTF line and produce the persisted snapshot. Pure: the server and
 * the order wizard run the same code. `layoutRunQuantity` — pieces of the same
 * layout across the order's lines (see `dtfLayoutRunQuantities`); run-size
 * prices use it instead of the line's own count. Throws {@link DtfLineError}.
 */
export function buildDtfLineData(
  input: DtfLineInput,
  customerType: DtfCustomerType,
  ctx: DtfPricingContext,
  layoutRunQuantity?: number,
): DtfLineData {
  const totalQuantity: number = input.sizes.reduce((sum, s) => sum + s.quantity, 0);
  const runQuantity: number = Math.max(totalQuantity, layoutRunQuantity ?? 0);
  const isStock: boolean = input.garmentSource === "stock";

  let garment: DtfGarmentSnapshot | null = null;
  let tierMinQty: number | null = null;
  let sizes: DtfLineSize[];
  if (isStock) {
    const stock = resolveStockSizes(input, ctx.garment, runQuantity, customerType);
    garment = stock.snapshot;
    sizes = stock.sizes;
    tierMinQty = stock.tierMinQty;
  } else {
    sizes = input.sizes.map((s) => ({
      garmentVariantId: null,
      size: s.size,
      quantity: s.quantity,
      unitSellPriceMdl: 0,
      unitCostMdl: 0,
    }));
  }

  const zones = resolveDtfZones(input.zones, [...ctx.presets], {
    customerType,
    garmentSource: input.garmentSource,
    quantity: runQuantity,
    settings: ctx.settings,
    includedPrint: isStock ? (ctx.garment?.includedPrint ?? null) : null,
  });
  const totals = computeDtfLineTotals({
    customerType,
    garmentSource: input.garmentSource,
    sizes,
    zones,
    tierMinQty,
    settings: ctx.settings,
    unitCosts: ctx.unitCosts,
  });

  return {
    version: DTF_LINE_DATA_VERSION,
    garmentSource: input.garmentSource,
    garment,
    customerType,
    sizes,
    quantity: totalQuantity,
    ...(input.layoutKey ? { layoutKey: input.layoutKey } : {}),
    ...(runQuantity > totalQuantity ? { runQuantity } : {}),
    zones,
    filmPrintableWidthCm: ctx.settings.printableWidthCm,
    filmGapCm: ctx.settings.gapCm,
    ...totals,
  };
}
