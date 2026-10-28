import { roundMoney2 } from "@/lib/dtf/dtfLineCalc";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import { UV_INK_SLOT_LABELS, type UvItemSource, type UvPlacement } from "@/lib/uv/uvConstants";
import type {
  UvConsumption,
  UvCustomerType,
  UvLineCosts,
  UvLinePricing,
  UvLineZone,
} from "@/lib/uv/types";

export { roundMoney2 };

export enum UvLineErrorCode {
  ZoneSizeInvalid = "uv_zone_size_invalid",
  /** A zone has to be charged but neither a price per m² nor a zone minimum is set. */
  PriceNotSet = "uv_price_not_set",
  ItemNotFound = "uv_item_not_found",
  ItemNoPrice = "uv_item_no_price",
}

export class UvLineError extends Error {
  constructor(public readonly code: UvLineErrorCode) {
    super(code);
    this.name = "UvLineError";
  }
}

export interface UvZoneRequest {
  id: string;
  placement: UvPlacement;
  placementLabel?: string | null;
  /** Print size; the main zone of a stock item with print parameters takes the item's size instead. */
  widthCm?: number;
  heightCm?: number;
  whiteLayers: number;
  varnish: boolean;
  /** Primed by hand before printing. */
  primer?: boolean;
}

/** Print area of a stock item («Параметры печати»), cm. */
export interface UvPrintArea {
  widthCm: number;
  heightCm: number;
}

/** How the first zone of the line is treated. */
export interface UvMainZone {
  /** Stock item: the first zone is part of the item price. */
  included: boolean;
  /** The item's print parameters; the first zone takes this size when set. */
  printArea: UvPrintArea | null;
}

export const UV_CLIENT_MAIN_ZONE: UvMainZone = { included: false, printArea: null };

/** Print price of one zone per piece: area × rate per m², at least the zone minimum. */
export function uvZonePrintPrice(
  widthCm: number,
  heightCm: number,
  customerType: UvCustomerType,
  settings: Pick<
    UvSettings,
    "retailPricePerSqmMdl" | "dealerPricePerSqmMdl" | "minimumZonePriceRetailMdl" | "minimumZonePriceDealerMdl"
  >,
): number {
  const dealer: boolean = customerType === "dealer";
  const rate: number = dealer ? settings.dealerPricePerSqmMdl : settings.retailPricePerSqmMdl;
  const minimum: number = dealer ? settings.minimumZonePriceDealerMdl : settings.minimumZonePriceRetailMdl;
  if (!(rate > 0) && !(minimum > 0)) {
    throw new UvLineError(UvLineErrorCode.PriceNotSet);
  }
  const byArea: number = ((widthCm * heightCm) / SQCM_PER_SQM) * Math.max(0, rate);
  return roundMoney2(Math.max(byArea, Math.max(0, minimum)));
}

/** Cost of one ml from the UV printer's slots and the primer in stock (0 while unknown). */
export interface UvInkCosts {
  /** Share-weighted over the Cyan / Magenta / Yellow / Black slots. */
  cmykPerMlMdl: number;
  whitePerMlMdl: number;
  varnishPerMlMdl: number;
  /** `UV_PRIMER_SKU` variant (avg ?? purchase cost); absent / 0 while unknown. */
  primerPerMlMdl?: number;
}

export const ZERO_UV_INK_COSTS: UvInkCosts = { cmykPerMlMdl: 0, whitePerMlMdl: 0, varnishPerMlMdl: 0, primerPerMlMdl: 0 };

const SQCM_PER_SQM = 10_000;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Turn zone requests into priced zones; throws {@link UvLineError}.
 *
 * The first zone of a stock item is its main print: sized by the item's print
 * parameters (when set) and included in the item price, so it adds nothing to
 * the line. Every other zone — and every zone on a client's item — costs
 * area × rate per m², at least the zone minimum. Surcharges are percentages of
 * that price: white per layer above the first (one underbase layer is part of
 * the price), varnish and primer once.
 */
export function resolveUvZones(
  requests: readonly UvZoneRequest[],
  customerType: UvCustomerType,
  settings: UvSettings,
  mainZone: UvMainZone,
): UvLineZone[] {
  return requests.map((req, index): UvLineZone => {
    const included: boolean = mainZone.included && index === 0;
    const area: UvPrintArea | null = included ? mainZone.printArea : null;
    const widthCm: number = area?.widthCm ?? req.widthCm ?? NaN;
    const heightCm: number = area?.heightCm ?? req.heightCm ?? NaN;
    if (!(widthCm > 0) || !(heightCm > 0)) {
      throw new UvLineError(UvLineErrorCode.ZoneSizeInvalid);
    }
    const whiteLayers: number = Math.max(0, Math.trunc(req.whiteLayers));
    const extraWhiteLayers: number = Math.max(0, whiteLayers - 1);
    const primer: boolean = req.primer === true;
    const label: string = req.placementLabel?.trim() ?? "";
    const unitListPriceMdl: number = included ? 0 : uvZonePrintPrice(widthCm, heightCm, customerType, settings);
    return {
      id: req.id,
      placement: req.placement,
      placementLabel: label || null,
      customSize: area == null,
      widthCm,
      heightCm,
      whiteLayers,
      varnish: req.varnish,
      primer,
      includedInItem: included,
      unitListPriceMdl,
      unitPrintPriceMdl: unitListPriceMdl,
      unitWhiteSurchargeMdl: roundMoney2((unitListPriceMdl * settings.whiteLayerSurchargePct * extraWhiteLayers) / 100),
      unitVarnishSurchargeMdl: req.varnish ? roundMoney2((unitListPriceMdl * settings.varnishSurchargePct) / 100) : 0,
      unitPrimerSurchargeMdl: primer ? roundMoney2((unitListPriceMdl * settings.primerSurchargePct) / 100) : 0,
    };
  });
}

/**
 * Ink for `quantity` pieces: area m² × norm × layers × pieces × (1 + waste).
 * Primer is wiped on by hand: area × norm × pieces, no head-cleaning waste.
 */
export function computeUvConsumption(
  zones: readonly (Pick<UvLineZone, "widthCm" | "heightCm" | "whiteLayers" | "varnish"> & { primer?: boolean })[],
  quantity: number,
  settings: Pick<UvSettings, "cmykMlPerSqm" | "whiteMlPerSqmPerLayer" | "varnishMlPerSqmPerLayer" | "wastePct"> &
    Partial<Pick<UvSettings, "primerMlPerSqm">>,
): UvConsumption {
  const waste: number = 1 + settings.wastePct / 100;
  let area = 0;
  let whiteAreaLayers = 0;
  let varnishArea = 0;
  let primerArea = 0;
  for (const z of zones) {
    const a: number = (z.widthCm * z.heightCm) / SQCM_PER_SQM;
    area += a;
    whiteAreaLayers += a * z.whiteLayers;
    if (z.varnish) varnishArea += a;
    if (z.primer) primerArea += a;
  }
  const pieces: number = quantity > 0 ? quantity : 0;
  return {
    areaSqmPerPiece: Math.round(area * 1_000_000) / 1_000_000,
    cmykMl: round3(area * settings.cmykMlPerSqm * pieces * waste),
    whiteMl: round3(whiteAreaLayers * settings.whiteMlPerSqmPerLayer * pieces * waste),
    varnishMl: round3(varnishArea * settings.varnishMlPerSqmPerLayer * pieces * waste),
    primerMl: round3(primerArea * (settings.primerMlPerSqm ?? 0) * pieces),
  };
}

export interface UvLineTotals {
  consumption: UvConsumption;
  pricing: UvLinePricing;
  costs: UvLineCosts;
  estimatedProfitMdl: number;
}

export function computeUvLineTotals(input: {
  source: UvItemSource;
  quantity: number;
  zones: readonly UvLineZone[];
  /** Stock items: run-size (or dealer) price per piece; client items: 0. */
  unitItemPriceMdl: number;
  tierMinQty: number | null;
  itemPriceSource?: "tier" | "dealer" | null;
  unitItemCostMdl: number;
  settings: UvSettings;
  inkCosts: UvInkCosts;
}): UvLineTotals {
  const { source, quantity, zones, settings, inkCosts } = input;
  const consumption: UvConsumption = computeUvConsumption(zones, quantity, settings);

  const sumZones = (pick: (z: UvLineZone) => number): number => zones.reduce((s, z) => s + pick(z), 0);
  const itemSellTotalMdl: number = roundMoney2(quantity * input.unitItemPriceMdl);
  const printSellTotalMdl: number = roundMoney2(quantity * sumZones((z) => z.unitPrintPriceMdl));
  const whiteSurchargeTotalMdl: number = roundMoney2(quantity * sumZones((z) => z.unitWhiteSurchargeMdl));
  const varnishSurchargeTotalMdl: number = roundMoney2(quantity * sumZones((z) => z.unitVarnishSurchargeMdl));
  const primerSurchargeTotalMdl: number = roundMoney2(quantity * sumZones((z) => z.unitPrimerSurchargeMdl ?? 0));
  const setupFeeMdl: number = source === "client" ? roundMoney2(settings.clientItemSetupFeeMdl) : 0;
  const subtotal: number =
    itemSellTotalMdl +
    printSellTotalMdl +
    whiteSurchargeTotalMdl +
    varnishSurchargeTotalMdl +
    primerSurchargeTotalMdl +
    setupFeeMdl;
  const minimumLineUpliftMdl: number = roundMoney2(Math.max(0, settings.minimumLineTotalMdl - subtotal));
  const pricing: UvLinePricing = {
    tierMinQty: input.tierMinQty,
    itemPriceSource: input.itemPriceSource ?? null,
    unitItemPriceMdl: input.unitItemPriceMdl,
    itemSellTotalMdl,
    printSellTotalMdl,
    whiteSurchargeTotalMdl,
    varnishSurchargeTotalMdl,
    primerSurchargeTotalMdl,
    setupFeeMdl,
    minimumLineUpliftMdl,
    totalSellPriceMdl: roundMoney2(subtotal + minimumLineUpliftMdl),
  };

  const itemCostMdl: number = roundMoney2(quantity * input.unitItemCostMdl);
  const cmykInkCostMdl: number = roundMoney2(consumption.cmykMl * inkCosts.cmykPerMlMdl);
  const whiteInkCostMdl: number = roundMoney2(consumption.whiteMl * inkCosts.whitePerMlMdl);
  const varnishCostMdl: number = roundMoney2(consumption.varnishMl * inkCosts.varnishPerMlMdl);
  const primerCostMdl: number = roundMoney2((consumption.primerMl ?? 0) * (inkCosts.primerPerMlMdl ?? 0));
  const costs: UvLineCosts = {
    unitItemCostMdl: input.unitItemCostMdl,
    itemCostMdl,
    cmykInkCostMdl,
    whiteInkCostMdl,
    varnishCostMdl,
    primerCostMdl,
    totalCostMdl: roundMoney2(itemCostMdl + cmykInkCostMdl + whiteInkCostMdl + varnishCostMdl + primerCostMdl),
  };

  return {
    consumption,
    pricing,
    costs,
    estimatedProfitMdl: roundMoney2(pricing.totalSellPriceMdl - costs.totalCostMdl),
  };
}

/** Ink slot of the UV printer as the cost calc needs it. */
export interface UvInkSlotCost {
  label: string;
  share: number | null;
  /** Effective unit cost of the loaded variant (avg ?? hint); null when unknown or empty. */
  unitCost: number | null;
}

export function slotMatchesLabels(label: string, labels: readonly string[]): boolean {
  const key: string = label.trim().toLowerCase();
  return labels.some((l) => l.toLowerCase() === key);
}

/** Share-weighted cost over slots with a known cost; null when none is known. */
function blendedCost(slots: readonly UvInkSlotCost[]): number | null {
  const known = slots.filter((s): s is UvInkSlotCost & { unitCost: number } => s.unitCost != null);
  if (known.length === 0) return null;
  const weights: number[] = known.map((s) => (s.share != null && s.share > 0 ? s.share : 0));
  const weightSum: number = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) return known.reduce((acc, s) => acc + s.unitCost, 0) / known.length;
  return known.reduce((acc, s, i) => acc + s.unitCost * weights[i]!, 0) / weightSum;
}

/**
 * Per-ml costs of the UV heads from the printer's ink slots: CMYK blended over
 * the colour slots by share, white and varnish from their own slot.
 */
export function uvInkCostsFromSlots(slots: readonly UvInkSlotCost[]): UvInkCosts {
  const pick = (labels: readonly string[]): number =>
    blendedCost(slots.filter((s) => slotMatchesLabels(s.label, labels))) ?? 0;
  return {
    cmykPerMlMdl: pick(UV_INK_SLOT_LABELS.cmyk),
    whitePerMlMdl: pick(UV_INK_SLOT_LABELS.white),
    varnishPerMlMdl: pick(UV_INK_SLOT_LABELS.varnish),
  };
}
