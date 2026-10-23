import {
  packGroupTiles,
  type GroupTilePackTile,
} from "@/lib/largeFormat/groupTilePack";
import { DTF_PACK_TILE_LIMIT, type DtfPlacement } from "@/lib/dtf/dtfConstants";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
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
  NoPriceList = "dtf_price_list_empty",
  GarmentNotFound = "dtf_garment_not_found",
  GarmentNoPrice = "dtf_garment_no_price",
  SizeUnknown = "dtf_size_unknown",
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
}

export interface DtfZoneRequest {
  id: string;
  placement: DtfPlacement;
  /** Null: custom size, priced by the smallest preset that contains it. */
  presetId: string | null;
  widthCm?: number;
  heightCm?: number;
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

function fitsWithin(w: number, h: number, preset: DtfPresetOption): boolean {
  const pw = preset.widthCm + SIZE_EPS_CM;
  const ph = preset.heightCm + SIZE_EPS_CM;
  return (w <= pw && h <= ph) || (w <= ph && h <= pw);
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

export function presetUnitPrice(
  preset: DtfPresetOption,
  customerType: DtfCustomerType,
): number {
  if (customerType === "dealer" && preset.dealerPrice != null) {
    return preset.dealerPrice;
  }
  return preset.retailPrice;
}

/**
 * Turn zone requests into priced zones; throws {@link DtfLineError}.
 * With `garmentIncludesPrint` (studio garment) the first zone is charged only
 * above `settings.includedPrintCreditMdl`.
 */
export function resolveDtfZones(
  requests: readonly DtfZoneRequest[],
  presets: readonly DtfPresetOption[],
  customerType: DtfCustomerType,
  settings: DtfSettings,
  garmentIncludesPrint: boolean,
): DtfLineZone[] {
  if (presets.length === 0) {
    throw new DtfLineError(DtfLineErrorCode.NoPriceList);
  }
  return requests.map((req, index): DtfLineZone => {
    let preset: DtfPresetOption | null;
    let widthCm: number;
    let heightCm: number;
    const customSize: boolean = req.presetId == null;
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
    const unitListPriceMdl: number = presetUnitPrice(preset, customerType);
    const unitIncludedCreditMdl: number =
      garmentIncludesPrint && index === 0
        ? Math.min(unitListPriceMdl, settings.includedPrintCreditMdl)
        : 0;
    return {
      id: req.id,
      placement: req.placement,
      presetId: preset.id,
      presetLabel: preset.label,
      customSize,
      widthCm,
      heightCm,
      unitListPriceMdl,
      unitIncludedCreditMdl,
      unitPrintPriceMdl: roundMoney2(unitListPriceMdl - unitIncludedCreditMdl),
      unitPressFeeMdl: settings.pressFeePerZoneMdl,
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
  const subtotal: number = garmentSellTotalMdl + printSellTotalMdl + pressSellTotalMdl;
  const minimumLineUpliftMdl: number = roundMoney2(
    Math.max(0, settings.minimumLineTotalMdl - subtotal),
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
