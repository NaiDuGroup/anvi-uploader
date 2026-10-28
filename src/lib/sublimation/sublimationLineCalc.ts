import { tierPriceForQuantity, type GarmentPriceTier } from "@/lib/dtf/garmentPriceTiers";
import { roundMoney2 } from "@/lib/dtf/dtfLineCalc";
import type { SublimationClientItemSettings, SublimationNorm } from "@/lib/printMethods/sublimationSettings";
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
  /** Client item: neither a price per m² nor a per-piece minimum is set. */
  PriceNotSet = "subl_price_not_set",
  /** Client item: print size missing or not positive. */
  SizeInvalid = "subl_size_required",
  /** Client source without the client item. */
  ClientItemRequired = "subl_client_item_required",
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
const SQCM_PER_SQM = 10_000;
/** One sheet of transfer paper (A4), m². */
export const SUBLIMATION_SHEET_AREA_SQM = 0.21 * 0.297;

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

/** Print area of one client piece, m² (6 decimals). */
export function sublimationClientArea(widthCm: number, heightCm: number): number {
  return Math.round(((widthCm * heightCm) / SQCM_PER_SQM) * 1_000_000) / 1_000_000;
}

/** Price of one client piece: area × rate per m², at least the per-piece minimum. */
export interface SublimationClientUnitPrice {
  areaSqmPerPiece: number;
  ratePerSqmMdl: number;
  unitByAreaPriceMdl: number;
  minimumApplied: boolean;
  unitPriceMdl: number;
}

/**
 * Print price per piece on a client's item. Throws
 * {@link SublimationLineErrorCode.SizeInvalid} without a size and
 * {@link SublimationLineErrorCode.PriceNotSet} when both the rate and the
 * minimum are 0 (like UV `uv_price_not_set`).
 */
export function sublimationClientUnitPrice(
  widthCm: number,
  heightCm: number,
  customerType: SublimationCustomerType,
  settings: SublimationClientItemSettings,
): SublimationClientUnitPrice {
  if (!(widthCm > 0) || !(heightCm > 0)) throw new SublimationLineError(SublimationLineErrorCode.SizeInvalid);
  const dealer: boolean = customerType === "dealer";
  const rate: number = Math.max(0, dealer ? settings.dealerPricePerSqmMdl : settings.retailPricePerSqmMdl);
  const minimum: number = Math.max(0, dealer ? settings.minimumPriceDealerMdl : settings.minimumPriceRetailMdl);
  if (!(rate > 0) && !(minimum > 0)) throw new SublimationLineError(SublimationLineErrorCode.PriceNotSet);
  const area: number = sublimationClientArea(widthCm, heightCm);
  const byArea: number = roundMoney2(((widthCm * heightCm) / SQCM_PER_SQM) * rate);
  const minimumApplied: boolean = minimum > byArea;
  return {
    areaSqmPerPiece: area,
    ratePerSqmMdl: rate,
    unitByAreaPriceMdl: byArea,
    minimumApplied,
    unitPriceMdl: roundMoney2(minimumApplied ? minimum : byArea),
  };
}

/**
 * Epson use for `quantity` client pieces of `areaSqm` each: ink = area ×
 * ml/m²; paper in whole A4 sheets for the total area; tape per piece — all ×
 * (1 + waste %).
 */
export function computeSublimationClientConsumption(
  areaSqm: number,
  quantity: number,
  settings: Pick<SublimationClientItemSettings, "inkMlPerSqm" | "tapeCmPerPiece">,
  wastePct: number,
): SublimationConsumption {
  const pieces: number = quantity > 0 ? quantity : 0;
  const k: number = pieces * (1 + Math.max(0, wastePct) / 100);
  return {
    paperSheets: Math.ceil(round3((areaSqm / SUBLIMATION_SHEET_AREA_SQM) * k)),
    tapeM: round3((settings.tapeCmPerPiece / CM_PER_M) * k),
    inkMl: round3(areaSqm * settings.inkMlPerSqm * k),
  };
}

/**
 * Totals of a client line: pieces × price per piece + set-up fee, raised to
 * the line minimum. Costs are the Epson consumables only (no blank).
 */
export function computeSublimationClientLineTotals(input: {
  quantity: number;
  unitPrice: SublimationClientUnitPrice;
  settings: SublimationClientItemSettings;
  wastePct: number;
  consumableCosts: SublimationConsumableCosts;
}): SublimationLineTotals {
  const { quantity, unitPrice: u, settings, consumableCosts: c } = input;
  const consumption: SublimationConsumption = computeSublimationClientConsumption(
    u.areaSqmPerPiece,
    quantity,
    settings,
    input.wastePct,
  );
  const piecesTotal: number = roundMoney2(quantity * u.unitPriceMdl);
  const setupFeeMdl: number = roundMoney2(Math.max(0, settings.setupFeeMdl));
  const subtotal: number = roundMoney2(piecesTotal + setupFeeMdl);
  const minimumLineUpliftMdl: number = roundMoney2(Math.max(0, settings.minimumLineTotalMdl - subtotal));
  const pricing: SublimationLinePricing = {
    tierMinQty: 1,
    priceSource: "area",
    unitPriceMdl: u.unitPriceMdl,
    totalSellPriceMdl: roundMoney2(subtotal + minimumLineUpliftMdl),
    areaSqmPerPiece: u.areaSqmPerPiece,
    ratePerSqmMdl: u.ratePerSqmMdl,
    unitByAreaPriceMdl: u.unitByAreaPriceMdl,
    minimumApplied: u.minimumApplied,
    unitPrintPriceMdl: u.unitPriceMdl,
    setupFeeMdl,
    minimumLineUpliftMdl,
  };
  const paperCostMdl: number = roundMoney2(consumption.paperSheets * c.paperPerSheetMdl);
  const tapeCostMdl: number = roundMoney2(consumption.tapeM * c.tapePerMMdl);
  const inkCostMdl: number = roundMoney2(consumption.inkMl * c.inkPerMlMdl);
  const costs: SublimationLineCosts = {
    unitItemCostMdl: 0,
    itemCostMdl: 0,
    paperCostMdl,
    tapeCostMdl,
    inkCostMdl,
    totalCostMdl: roundMoney2(paperCostMdl + tapeCostMdl + inkCostMdl),
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
