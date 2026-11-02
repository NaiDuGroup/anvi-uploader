import {
  packGroupTiles,
  type GroupTilePackTile,
} from "@/lib/largeFormat/groupTilePack";
import { DTF_PACK_TILE_LIMIT, type DtfPlacement } from "@/lib/dtf/dtfConstants";
import { discountedPrice, dtfRunDiscountPct, type DtfSettings } from "@/lib/dtf/dtfSettings";
import type { DtfGarmentSource } from "@/lib/dtf/dtfConstants";
import type {
  DtfConsumption,
  DtfCustomerType,
  DtfLineCosts,
  DtfLinePricing,
  DtfLineSize,
  DtfLineZone,
} from "@/lib/dtf/types";

export enum DtfLineErrorCode {
  PresetNotFound = "dtf_preset_not_found",
  ZoneSizeInvalid = "dtf_zone_size_invalid",
  ZoneTooLarge = "dtf_zone_too_large",
  /** The print is bigger than the item takes (caps, socks: up to 10×10). */
  ZoneTooLargeForItem = "dtf_zone_too_large_for_item",
  NoPriceList = "dtf_price_list_empty",
  GarmentNotFound = "dtf_garment_not_found",
  GarmentNoPrice = "dtf_garment_no_price",
  SizeUnknown = "dtf_size_unknown",
  /** «Без прессовки» only for dealers, on a format that has such a price, without a stock garment. */
  NoPressUnavailable = "dtf_no_press_unavailable",
}

export class DtfLineError extends Error {
  constructor(public readonly code: DtfLineErrorCode) {
    super(code);
    this.name = "DtfLineError";
  }
}

/** Price list entry in plain numbers. */
export interface DtfPresetOption {
  id: string;
  label: string;
  widthCm: number;
  heightCm: number;
  retailPrice: number;
  dealerPrice: number | null;
  /** Dealer price of the transfer handed over unpressed (null = not offered). */
  dealerNoPressPrice?: number | null;
}

export interface DtfZoneRequest {
  id: string;
  placement: DtfPlacement;
  /** Null: custom size, priced by the smallest preset that contains it. */
  presetId: string | null;
  widthCm?: number;
  heightCm?: number;
  /** Dealer takes the baked transfer without pressing. */
  noPress?: boolean;
}

/** Print size already paid for in a stock item's price (caps, socks: a logo). */
export interface DtfIncludedPrint {
  widthCm: number;
  heightCm: number;
}

/** Who the line is for and how many pieces of one layout it prints. */
export interface DtfZonePricingContext {
  customerType: DtfCustomerType;
  garmentSource: DtfGarmentSource;
  /** Pieces of the line (one layout): drives the retail run-size discount. */
  quantity: number;
  settings: DtfSettings;
  /** Print included in the stock item's price (first zone only); null = none. */
  includedPrint: DtfIncludedPrint | null;
  /** Largest print the stock item takes (caps, socks: 10×10); null/absent = no limit. */
  maxPrint?: DtfIncludedPrint | null;
}

export interface DtfUnitCosts {
  filmPerLinearMeterMdl: number;
  inkPerMlMdl: number;
  powderPerGramMdl: number;
}

const SIZE_EPS_CM = 0.05;

export function roundMoney2(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function fitsWithin(w: number, h: number, preset: { widthCm: number; heightCm: number }): boolean {
  const pw = preset.widthCm + SIZE_EPS_CM;
  const ph = preset.heightCm + SIZE_EPS_CM;
  return (w <= pw && h <= ph) || (w <= ph && h <= pw);
}

/** True when a print of `w`×`h` fits the item's largest print (either orientation; no limit = true). */
export function dtfPrintFitsItem(
  w: number,
  h: number,
  maxPrint: { widthCm: number; heightCm: number } | null | undefined,
): boolean {
  return maxPrint == null || fitsWithin(w, h, maxPrint);
}

/** Smallest price list entry (by area) that the transfer fits into, in either orientation. */
export function pickPresetForSize(
  presets: readonly DtfPresetOption[],
  widthCm: number,
  heightCm: number,
): DtfPresetOption | null {
  let best: DtfPresetOption | null = null;
  for (const preset of presets) {
    if (!fitsWithin(widthCm, heightCm, preset)) continue;
    if (best == null || preset.widthCm * preset.heightCm < best.widthCm * best.heightCm) {
      best = preset;
    }
  }
  return best;
}

/**
 * Price of one transfer of `preset` for the customer: retail = list price less
 * the run-size discount (rounded); dealer = the dealer price, never above
 * what retail would pay for the same run.
 */
export function presetUnitPrice(
  preset: DtfPresetOption,
  customerType: DtfCustomerType,
  settings?: Pick<
    DtfSettings,
    | "runDiscount1MinQty"
    | "runDiscount1Pct"
    | "runDiscount2MinQty"
    | "runDiscount2Pct"
    | "runDiscount3MinQty"
    | "runDiscount3Pct"
    | "runDiscountRoundToMdl"
  >,
  quantity: number = 1,
): number {
  const pctOff: number = settings ? dtfRunDiscountPct(settings, quantity) : 0;
  const retail: number = discountedPrice(preset.retailPrice, pctOff, settings?.runDiscountRoundToMdl ?? 0);
  if (customerType === "dealer" && preset.dealerPrice != null) {
    return Math.min(preset.dealerPrice, retail);
  }
  return retail;
}

/** Preset a zone request prices with (custom sizes: the smallest that contains them). */
function zonePreset(
  req: DtfZoneRequest,
  presets: readonly DtfPresetOption[],
  settings: DtfSettings,
): { preset: DtfPresetOption; widthCm: number; heightCm: number } {
  let preset: DtfPresetOption | null;
  let widthCm: number;
  let heightCm: number;
  if (req.presetId != null) {
    preset = presets.find((p) => p.id === req.presetId) ?? null;
    if (!preset) throw new DtfLineError(DtfLineErrorCode.PresetNotFound);
    widthCm = preset.widthCm;
    heightCm = preset.heightCm;
  } else {
    widthCm = req.widthCm ?? NaN;
    heightCm = req.heightCm ?? NaN;
    if (!(widthCm > 0) || !(heightCm > 0)) {
      throw new DtfLineError(DtfLineErrorCode.ZoneSizeInvalid);
    }
    preset = pickPresetForSize(presets, widthCm, heightCm);
    if (!preset) throw new DtfLineError(DtfLineErrorCode.ZoneTooLarge);
  }
  if (Math.min(widthCm, heightCm) > settings.printableWidthCm + SIZE_EPS_CM) {
    throw new DtfLineError(DtfLineErrorCode.ZoneTooLarge);
  }
  return { preset, widthCm, heightCm };
}

/**
 * Turn zone requests into priced zones; throws {@link DtfLineError}.
 * Format prices take the retail run-size discount (dealers pay their own
 * price). A stock item's price already includes its standard print (A4 on
 * T-shirts, a logo on caps and socks): the first zone adds the difference to
 * that print's price — negative for a smaller one. A dealer may take a
 * transfer unpressed when the format has such a price.
 */
export function resolveDtfZones(
  requests: readonly DtfZoneRequest[],
  presets: readonly DtfPresetOption[],
  ctx: DtfZonePricingContext,
): DtfLineZone[] {
  if (presets.length === 0) {
    throw new DtfLineError(DtfLineErrorCode.NoPriceList);
  }
  const { customerType, settings, quantity } = ctx;
  const pctOff: number = customerType === "retail" ? dtfRunDiscountPct(settings, quantity) : 0;
  const priceOf = (preset: DtfPresetOption): number =>
    presetUnitPrice(preset, customerType, settings, quantity);
  const includedPreset: DtfPresetOption | null = ctx.includedPrint
    ? pickPresetForSize(presets, ctx.includedPrint.widthCm, ctx.includedPrint.heightCm)
    : null;

  return requests.map((req, index): DtfLineZone => {
    const { preset, widthCm, heightCm } = zonePreset(req, presets, settings);
    if (!dtfPrintFitsItem(widthCm, heightCm, ctx.maxPrint)) {
      throw new DtfLineError(DtfLineErrorCode.ZoneTooLargeForItem);
    }
    const noPress: boolean = req.noPress === true;
    if (
      noPress &&
      (customerType !== "dealer" || ctx.garmentSource !== "client" || preset.dealerNoPressPrice == null)
    ) {
      throw new DtfLineError(DtfLineErrorCode.NoPressUnavailable);
    }
    const unitListPriceMdl: number = noPress ? (preset.dealerNoPressPrice as number) : priceOf(preset);
    let unitIncludedCreditMdl = 0;
    if (index === 0 && ctx.includedPrint && !noPress) {
      // The item price already holds its standard print: another size moves the
      // price by the difference, either way (A3 on a T-shirt +40, A6 −80).
      // A size larger than every format counts as this zone's own.
      unitIncludedCreditMdl = includedPreset ? priceOf(includedPreset) : unitListPriceMdl;
    }
    return {
      id: req.id,
      placement: req.placement,
      presetId: preset.id,
      presetLabel: preset.label,
      customSize: req.presetId == null,
      widthCm,
      heightCm,
      unitFormatPriceMdl: customerType === "dealer" && preset.dealerPrice != null ? preset.dealerPrice : preset.retailPrice,
      runDiscountPct: pctOff,
      noPress,
      unitListPriceMdl,
      unitIncludedCreditMdl,
      unitPrintPriceMdl: roundMoney2(unitListPriceMdl - unitIncludedCreditMdl),
      unitPressFeeMdl: noPress ? 0 : settings.pressFeePerZoneMdl,
    };
  });
}

function zoneTiles(
  zone: Pick<DtfLineZone, "id" | "widthCm" | "heightCm">,
  copies: number,
  idPrefix: string,
): GroupTilePackTile[] {
  return Array.from({ length: copies }, (_, i): GroupTilePackTile => ({
    id: `${idPrefix}${zone.id}::${i}`,
    label: `${i + 1}`,
    widthCm: zone.widthCm,
    heightCm: zone.heightCm,
    allowRotate: true,
  }));
}

/**
 * Film length needed to print `quantity` sets of the zones. Large runs pack
 * one capped block per zone and scale it, which keeps the packer fast and
 * stays within a few percent of the full layout.
 */
export function estimateDtfFilmLinearMeters(
  zones: readonly Pick<DtfLineZone, "id" | "widthCm" | "heightCm">[],
  quantity: number,
  settings: Pick<DtfSettings, "printableWidthCm" | "gapCm">,
): number {
  if (quantity <= 0 || zones.length === 0) return 0;
  const { printableWidthCm, gapCm } = settings;
  if (zones.length * quantity <= DTF_PACK_TILE_LIMIT) {
    const tiles = zones.flatMap((z) => zoneTiles(z, quantity, ""));
    return packGroupTiles(tiles, printableWidthCm, gapCm).totalAlongCm / 100;
  }
  let totalCm = 0;
  for (const zone of zones) {
    const block = Math.min(quantity, DTF_PACK_TILE_LIMIT);
    const packed = packGroupTiles(zoneTiles(zone, block, ""), printableWidthCm, gapCm);
    totalCm += (packed.totalAlongCm * quantity) / block;
  }
  return totalCm / 100;
}

export interface DtfLineTotals {
  consumption: DtfConsumption;
  pricing: DtfLinePricing;
  costs: DtfLineCosts;
  estimatedProfitMdl: number;
}

export function computeDtfLineTotals(input: {
  /** Retail / dealer and garment source pick the print-only minimum (default: no such minimum). */
  customerType?: DtfCustomerType;
  garmentSource?: DtfGarmentSource;
  sizes: readonly DtfLineSize[];
  zones: readonly DtfLineZone[];
  tierMinQty: number | null;
  settings: DtfSettings;
  unitCosts: DtfUnitCosts;
}): DtfLineTotals {
  const { sizes, zones, tierMinQty, settings, unitCosts } = input;
  const quantity: number = sizes.reduce((sum, s) => sum + s.quantity, 0);

  const filmLinearMeters: number =
    Math.round(estimateDtfFilmLinearMeters(zones, quantity, settings) * 1000) / 1000;
  const consumption: DtfConsumption = {
    filmLinearMeters,
    inkMl: Math.round(filmLinearMeters * settings.inkMlPerLinearMeter * 1000) / 1000,
    powderGrams:
      Math.round(filmLinearMeters * settings.powderGramsPerLinearMeter * 1000) / 1000,
  };

  const garmentSellTotalMdl: number = roundMoney2(
    sizes.reduce((sum, s) => sum + s.quantity * s.unitSellPriceMdl, 0),
  );
  const printSellTotalMdl: number = roundMoney2(
    quantity * zones.reduce((sum, z) => sum + z.unitPrintPriceMdl, 0),
  );
  const pressSellTotalMdl: number = roundMoney2(
    quantity * zones.reduce((sum, z) => sum + z.unitPressFeeMdl, 0),
  );
  // A smaller print than the item includes lowers the price, never below zero.
  const subtotal: number = Math.max(0, garmentSellTotalMdl + printSellTotalMdl + pressSellTotalMdl);
  const printOnlyMinimum: number =
    input.garmentSource === "client"
      ? input.customerType === "dealer"
        ? settings.minimumPrintOnlyDealerMdl
        : settings.minimumPrintOnlyRetailMdl
      : 0;
  const minimumLineUpliftMdl: number = roundMoney2(
    Math.max(0, Math.max(settings.minimumLineTotalMdl, printOnlyMinimum) - subtotal),
  );
  const pricing: DtfLinePricing = {
    tierMinQty,
    garmentSellTotalMdl,
    printSellTotalMdl,
    pressSellTotalMdl,
    minimumLineUpliftMdl,
    totalSellPriceMdl: roundMoney2(subtotal + minimumLineUpliftMdl),
  };

  const garmentCostMdl: number = roundMoney2(
    sizes.reduce((sum, s) => sum + s.quantity * s.unitCostMdl, 0),
  );
  const filmCostMdl: number = roundMoney2(filmLinearMeters * unitCosts.filmPerLinearMeterMdl);
  const inkCostMdl: number = roundMoney2(consumption.inkMl * unitCosts.inkPerMlMdl);
  const powderCostMdl: number = roundMoney2(consumption.powderGrams * unitCosts.powderPerGramMdl);
  const costs: DtfLineCosts = {
    garmentCostMdl,
    filmCostMdl,
    inkCostMdl,
    powderCostMdl,
    totalCostMdl: roundMoney2(garmentCostMdl + filmCostMdl + inkCostMdl + powderCostMdl),
  };

  return {
    consumption,
    pricing,
    costs,
    estimatedProfitMdl: roundMoney2(pricing.totalSellPriceMdl - costs.totalCostMdl),
  };
}
