import { pickPresetForSize, presetUnitPrice, roundMoney2 } from "@/lib/dtf/dtfLineCalc";
import type { PrintPresetOption } from "@/lib/printMethods/presets";
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
  PresetNotFound = "uv_preset_not_found",
  ZoneSizeInvalid = "uv_zone_size_invalid",
  ZoneTooLarge = "uv_zone_too_large",
  NoPriceList = "uv_price_list_empty",
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
  /** Null: custom size, priced by the smallest preset that contains it. */
  presetId: string | null;
  widthCm?: number;
  heightCm?: number;
  whiteLayers: number;
  varnish: boolean;
}

/** Cost of one ml from the UV printer's slots (0 while unknown). */
export interface UvInkCosts {
  /** Share-weighted over the Cyan / Magenta / Yellow / Black slots. */
  cmykPerMlMdl: number;
  whitePerMlMdl: number;
  varnishPerMlMdl: number;
}

export const ZERO_UV_INK_COSTS: UvInkCosts = { cmykPerMlMdl: 0, whitePerMlMdl: 0, varnishPerMlMdl: 0 };

const SQCM_PER_SQM = 10_000;

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Turn zone requests into priced zones; throws {@link UvLineError}.
 * With `itemIncludesPrint` (stock item) the first zone is charged only above
 * `settings.includedPrintCreditMdl`. Surcharges are taken from the full format
 * price: white per layer, varnish once.
 */
export function resolveUvZones(
  requests: readonly UvZoneRequest[],
  presets: readonly PrintPresetOption[],
  customerType: UvCustomerType,
  settings: UvSettings,
  itemIncludesPrint: boolean,
): UvLineZone[] {
  if (presets.length === 0) {
    throw new UvLineError(UvLineErrorCode.NoPriceList);
  }
  return requests.map((req, index): UvLineZone => {
    let preset: PrintPresetOption | null;
    let widthCm: number;
    let heightCm: number;
    const customSize: boolean = req.presetId == null;
    if (req.presetId != null) {
      preset = presets.find((p) => p.id === req.presetId) ?? null;
      if (!preset) throw new UvLineError(UvLineErrorCode.PresetNotFound);
      widthCm = preset.widthCm;
      heightCm = preset.heightCm;
    } else {
      widthCm = req.widthCm ?? NaN;
      heightCm = req.heightCm ?? NaN;
      if (!(widthCm > 0) || !(heightCm > 0)) {
        throw new UvLineError(UvLineErrorCode.ZoneSizeInvalid);
      }
      preset = pickPresetForSize(presets, widthCm, heightCm);
      if (!preset) throw new UvLineError(UvLineErrorCode.ZoneTooLarge);
    }
    const unitListPriceMdl: number = presetUnitPrice(preset, customerType);
    const unitIncludedCreditMdl: number =
      itemIncludesPrint && index === 0 ? Math.min(unitListPriceMdl, settings.includedPrintCreditMdl) : 0;
    const whiteLayers: number = Math.max(0, Math.trunc(req.whiteLayers));
    const label: string = req.placementLabel?.trim() ?? "";
    return {
      id: req.id,
      placement: req.placement,
      placementLabel: label || null,
      presetId: preset.id,
      presetLabel: preset.label,
      customSize,
      widthCm,
      heightCm,
      whiteLayers,
      varnish: req.varnish,
      unitListPriceMdl,
      unitIncludedCreditMdl,
      unitPrintPriceMdl: roundMoney2(unitListPriceMdl - unitIncludedCreditMdl),
      unitWhiteSurchargeMdl: roundMoney2(
        (unitListPriceMdl * settings.whiteLayerSurchargePct * whiteLayers) / 100,
      ),
      unitVarnishSurchargeMdl: req.varnish
        ? roundMoney2((unitListPriceMdl * settings.varnishSurchargePct) / 100)
        : 0,
    };
  });
}

/** Ink for `quantity` pieces: area m² × norm × layers × pieces × (1 + waste). */
export function computeUvConsumption(
  zones: readonly Pick<UvLineZone, "widthCm" | "heightCm" | "whiteLayers" | "varnish">[],
  quantity: number,
  settings: Pick<UvSettings, "cmykMlPerSqm" | "whiteMlPerSqmPerLayer" | "varnishMlPerSqmPerLayer" | "wastePct">,
): UvConsumption {
  const waste: number = 1 + settings.wastePct / 100;
  let area = 0;
  let whiteAreaLayers = 0;
  let varnishArea = 0;
  for (const z of zones) {
    const a: number = (z.widthCm * z.heightCm) / SQCM_PER_SQM;
    area += a;
    whiteAreaLayers += a * z.whiteLayers;
    if (z.varnish) varnishArea += a;
  }
  const pieces: number = quantity > 0 ? quantity : 0;
  return {
    areaSqmPerPiece: Math.round(area * 1_000_000) / 1_000_000,
    cmykMl: round3(area * settings.cmykMlPerSqm * pieces * waste),
    whiteMl: round3(whiteAreaLayers * settings.whiteMlPerSqmPerLayer * pieces * waste),
    varnishMl: round3(varnishArea * settings.varnishMlPerSqmPerLayer * pieces * waste),
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
  /** Stock items: run-size price per piece; client items: 0. */
  unitItemPriceMdl: number;
  tierMinQty: number | null;
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
  const setupFeeMdl: number = source === "client" ? roundMoney2(settings.clientItemSetupFeeMdl) : 0;
  const subtotal: number =
    itemSellTotalMdl + printSellTotalMdl + whiteSurchargeTotalMdl + varnishSurchargeTotalMdl + setupFeeMdl;
  const minimumLineUpliftMdl: number = roundMoney2(Math.max(0, settings.minimumLineTotalMdl - subtotal));
  const pricing: UvLinePricing = {
    tierMinQty: input.tierMinQty,
    unitItemPriceMdl: input.unitItemPriceMdl,
    itemSellTotalMdl,
    printSellTotalMdl,
    whiteSurchargeTotalMdl,
    varnishSurchargeTotalMdl,
    setupFeeMdl,
    minimumLineUpliftMdl,
    totalSellPriceMdl: roundMoney2(subtotal + minimumLineUpliftMdl),
  };

  const itemCostMdl: number = roundMoney2(quantity * input.unitItemCostMdl);
  const cmykInkCostMdl: number = roundMoney2(consumption.cmykMl * inkCosts.cmykPerMlMdl);
  const whiteInkCostMdl: number = roundMoney2(consumption.whiteMl * inkCosts.whitePerMlMdl);
  const varnishCostMdl: number = roundMoney2(consumption.varnishMl * inkCosts.varnishPerMlMdl);
  const costs: UvLineCosts = {
    unitItemCostMdl: input.unitItemCostMdl,
    itemCostMdl,
    cmykInkCostMdl,
    whiteInkCostMdl,
    varnishCostMdl,
    totalCostMdl: roundMoney2(itemCostMdl + cmykInkCostMdl + whiteInkCostMdl + varnishCostMdl),
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
