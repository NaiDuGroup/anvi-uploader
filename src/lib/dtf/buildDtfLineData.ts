import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import {
  computeDtfLineTotals,
  DtfLineError,
  DtfLineErrorCode,
  resolveDtfZones,
  roundMoney2,
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
      names: garment.itemNames,
      colorName: garment.colorName,
      colorHex: garment.colorHex,
    },
    sizes,
    tierMinQty,
  };
}

/** Garment + print + press of the line's own pieces priced at a run of `runQuantity`. */
function lineSubtotalAt(
  input: DtfLineInput,
  customerType: DtfCustomerType,
  ctx: DtfPricingContext,
  runQuantity: number,
): number {
  const isStock: boolean = input.garmentSource === "stock";
  const sizes = isStock
    ? resolveStockSizes(input, ctx.garment, runQuantity, customerType).sizes
    : input.sizes.map((s) => ({ quantity: s.quantity, unitSellPriceMdl: 0 }));
  const zones = resolveDtfZones(input.zones, [...ctx.presets], {
    customerType,
    garmentSource: input.garmentSource,
    quantity: runQuantity,
    settings: ctx.settings,
    includedPrint: isStock ? (ctx.garment?.includedPrint ?? null) : null,
    maxPrint: isStock ? (ctx.garment?.maxPrint ?? null) : null,
  });
  const pieces: number = sizes.reduce((sum, s) => sum + s.quantity, 0);
  const garmentTotal: number = sizes.reduce((sum, s) => sum + s.quantity * s.unitSellPriceMdl, 0);
  const perPiece: number = zones.reduce((sum, z) => sum + z.unitPrintPriceMdl + z.unitPressFeeMdl, 0);
  return Math.max(0, roundMoney2(garmentTotal + pieces * perPiece));
}

/** Run sizes where a price steps down: the item's tiers and the print run discount. */
function priceBoundaries(input: DtfLineInput, ctx: DtfPricingContext): number[] {
  const out = new Set<number>();
  if (input.garmentSource === "stock" && ctx.garment) {
    const wanted = new Set(input.sizes.map((s) => s.size.toUpperCase()));
    for (const v of ctx.garment.variants) {
      if (!wanted.has(v.size.toUpperCase())) continue;
      for (const tier of v.priceTiers) out.add(tier.minQty);
    }
  }
  const st = ctx.settings;
  for (const minQty of [st.runDiscount1MinQty, st.runDiscount2MinQty, st.runDiscount3MinQty]) {
    if (minQty > 0) out.add(minQty);
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The owner's rule (as for pens): a bigger package is never cheaper. The line
 * total is capped by what the same layout costs at every higher price step —
 * item tiers and the print run discount together — scaled to that step's run
 * (`subtotal(B) × B / run`), rounded down to whole lei. Null when nothing caps it.
 */
export function dtfRunCapTotal(
  input: DtfLineInput,
  customerType: DtfCustomerType,
  ctx: DtfPricingContext,
  runQuantity: number,
  ownSubtotal: number,
): number | null {
  if (runQuantity <= 0) return null;
  let best: number | null = null;
  for (const boundary of priceBoundaries(input, ctx)) {
    if (boundary <= runQuantity) continue;
    let atBoundary: number;
    try {
      atBoundary = lineSubtotalAt(input, customerType, ctx, boundary);
    } catch {
      continue;
    }
    const cap: number = Math.floor(roundMoney2((atBoundary * boundary) / runQuantity));
    if (cap < ownSubtotal && (best == null || cap < best)) best = cap;
  }
  return best;
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
    maxPrint: isStock ? (ctx.garment?.maxPrint ?? null) : null,
  });
  const ownSubtotal: number = lineSubtotalAt(input, customerType, ctx, runQuantity);
  const runCapTotalMdl: number | null = dtfRunCapTotal(input, customerType, ctx, runQuantity, ownSubtotal);
  const totals = computeDtfLineTotals({
    customerType,
    runCapTotalMdl,
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
