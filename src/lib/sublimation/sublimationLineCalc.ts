import { tierPriceForQuantity, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { roundMoney2 } from "@/lib/dtf/dtfLineCalc";
import type { SublimationNorm } from "@/lib/printMethods/sublimationSettings";
import { blendedInkCost } from "@/lib/stock/unified/printerMath";
import type {
  SublimationConsumption,
  SublimationCustomerType,
  SublimationLineCosts,
  SublimationLinePricing,
} from "@/lib/sublimation/types";

export { roundMoney2 };

export enum SublimationLineErrorCode {
  ItemNotFound = "subl_item_not_found",
  ItemNoPrice = "subl_item_no_price",
}

export class SublimationLineError extends Error {
  constructor(public readonly code: SublimationLineErrorCode) {
    super(code);
    this.name = "SublimationLineError";
  }
}

/** Unit costs of the Epson L1800 consumables (0 while unknown). */
export interface SublimationConsumableCosts {
  paperPerSheetMdl: number;
  tapePerMMdl: number;
  /** Share-weighted over the six ink slots. */
  inkPerMlMdl: number;
}

export const ZERO_SUBLIMATION_CONSUMABLE_COSTS: SublimationConsumableCosts = {
  paperPerSheetMdl: 0,
  tapePerMMdl: 0,
  inkPerMlMdl: 0,
};

const CM_PER_M = 100;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Price per piece (print included). Retail: the variant's run-size tier for the
 * line quantity (`priceTiers`, else `sellPrice` from 1 piece). Dealers: the
 * variant's `dealerPrice` when set — never above the retail tier price, so a
 * large run is not dearer for a dealer — else the same retail tier price.
 * Null when the blank has no price at all.
 */
export function sublimationUnitPrice(
  item: { priceTiers: readonly GarmentPriceTier[]; dealerPriceMdl: number | null },
  quantity: number,
  customerType: SublimationCustomerType,
): Pick<SublimationLinePricing, "tierMinQty" | "priceSource" | "unitPriceMdl"> | null {
  const tier: GarmentPriceTier | null = tierPriceForQuantity(item.priceTiers, quantity);
  if (!tier) return null;
  if (customerType === "dealer" && item.dealerPriceMdl != null && item.dealerPriceMdl < tier.priceMdl) {
    return { tierMinQty: tier.minQty, priceSource: "dealer", unitPriceMdl: item.dealerPriceMdl };
  }
  return { tierMinQty: tier.minQty, priceSource: "tier", unitPriceMdl: tier.priceMdl };
}

/**
 * Epson use for `quantity` items: category norm × pieces × (1 + waste %).
 * Paper is taken in whole sheets per line (rounded up: several small blanks
 * share a sheet); tape is converted to metres (the slot unit).
 */
export function computeSublimationConsumption(
  norm: SublimationNorm,
  quantity: number,
  wastePct: number,
): SublimationConsumption {
  const pieces: number = quantity > 0 ? quantity : 0;
  const k: number = pieces * (1 + Math.max(0, wastePct) / 100);
  return {
    paperSheets: Math.ceil(round3(norm.paperSheets * k)),
    tapeM: round3((norm.tapeCm / CM_PER_M) * k),
    inkMl: round3(norm.inkMl * k),
  };
}

export function isZeroSublimationConsumption(c: SublimationConsumption): boolean {
  return !(c.paperSheets > 0) && !(c.tapeM > 0) && !(c.inkMl > 0);
}

export interface SublimationLineTotals {
  consumption: SublimationConsumption;
  pricing: SublimationLinePricing;
  costs: SublimationLineCosts;
  estimatedProfitMdl: number;
}

export function computeSublimationLineTotals(input: {
  quantity: number;
  unitPrice: Pick<SublimationLinePricing, "tierMinQty" | "priceSource" | "unitPriceMdl">;
  unitItemCostMdl: number;
  norm: SublimationNorm;
  wastePct: number;
  consumableCosts: SublimationConsumableCosts;
}): SublimationLineTotals {
  const { quantity, consumableCosts: c } = input;
  const consumption: SublimationConsumption = computeSublimationConsumption(input.norm, quantity, input.wastePct);
  const pricing: SublimationLinePricing = {
    ...input.unitPrice,
    totalSellPriceMdl: roundMoney2(quantity * input.unitPrice.unitPriceMdl),
  };
  const itemCostMdl: number = roundMoney2(quantity * input.unitItemCostMdl);
  const paperCostMdl: number = roundMoney2(consumption.paperSheets * c.paperPerSheetMdl);
  const tapeCostMdl: number = roundMoney2(consumption.tapeM * c.tapePerMMdl);
  const inkCostMdl: number = roundMoney2(consumption.inkMl * c.inkPerMlMdl);
  const costs: SublimationLineCosts = {
    unitItemCostMdl: input.unitItemCostMdl,
    itemCostMdl,
    paperCostMdl,
    tapeCostMdl,
    inkCostMdl,
    totalCostMdl: roundMoney2(itemCostMdl + paperCostMdl + tapeCostMdl + inkCostMdl),
  };
  return {
    consumption,
    pricing,
    costs,
    estimatedProfitMdl: roundMoney2(pricing.totalSellPriceMdl - costs.totalCostMdl),
  };
}

/** A printer slot as the cost calc needs it. */
export interface SublimationSlotCost {
  share: number | null;
  /** Effective unit cost of the loaded variant (avg ?? hint); null when unknown or empty. */
  unitCost: number | null;
}

/** Consumable unit costs from the Epson slots: ink blended by share, paper and tape from their slot. */
export function sublimationConsumableCostsFromSlots(slots: {
  ink: readonly SublimationSlotCost[];
  paper: readonly SublimationSlotCost[];
  tape: readonly SublimationSlotCost[];
}): SublimationConsumableCosts {
  const first = (list: readonly SublimationSlotCost[]): number => list.find((s) => s.unitCost != null)?.unitCost ?? 0;
  return {
    paperPerSheetMdl: first(slots.paper),
    tapePerMMdl: first(slots.tape),
    inkPerMlMdl: blendedInkCost(slots.ink) ?? 0,
  };
}
