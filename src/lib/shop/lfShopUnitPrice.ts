import type { ProductionCostsConfig } from "@/lib/accounting/types";
import { packGroupTiles, GROUP_TILE_PACK_DEFAULT_GAP_CM, type GroupTilePackTile } from "@/lib/largeFormat/groupTilePack";
import { computeLargeFormatLinePricing } from "@/lib/largeFormat/largeFormatLinePricing";
import { resolveEffectivePrintableWidthMeters } from "@/lib/largeFormat/largeFormatRollConstants";
import { computeLargeFormatRollLayout } from "@/lib/largeFormat/largeFormatRollPack";
import { computeLfFinishing, type LfFinishingInput } from "@/lib/largeFormat/lfFinishing";
import { computeLfInkSellPriceMdl, mergeLfPricingWithInkSell } from "@/lib/largeFormat/lfInkSellPricing";
import type { LfPricingMaterial } from "@/lib/largeFormat/lfMaterialStock";
import { applyGroupMinimumSellTotal, applyLfMinimumLineSellTotalMdl } from "@/lib/largeFormat/lfMinimumLineSell";
import { resolveLfSellRatesPerLinearMeterMdl } from "@/lib/largeFormat/lfResolveSellRates";
import { computeLfRollOrderEconomics, effectiveLfMaterialCostPerLinearMeterMdl } from "@/lib/largeFormat/lfRollOrderEconomics";

/**
 * Storefront wide-format per-piece price (custom sizes). Pure.
 *
 * The studio pipeline prices a whole line (roll metres of all pieces, ink,
 * the 100-lei minimum, finishing) and rounds the total, so the price per
 * piece wanders with the quantity (banner 647 → 647,20 → 647,10) and can even
 * go up when one more piece opens a new row on the roll. The shop rule is
 * whole lei per piece and a bigger order never costs more per piece, so:
 *
 *   unit(q) = ⌊ min over k = 1…q of lineTotal(k) / k ⌋,   line = unit(q) × q
 *
 * where `lineTotal(k)` is the studio's line price for k pieces, computed by
 * the same pure steps as `resolveLargeFormatLine` (one roll) or the family
 * group path (`lfCrossLinePacking`, cheapest roll of the family). The minimum
 * over k makes the unit price non-increasing in q; the floor keeps every
 * line at or below the studio formula. Size presets and roll-up sets have
 * fixed per-piece prices and do not come here.
 */

export interface LfShopPricingContext {
  /** One roll, or every active roll of the material family. */
  materials: readonly LfPricingMaterial[];
  /** Family billing (cheapest roll per quantity, group packer) vs one concrete roll. */
  family: boolean;
  prod: ProductionCostsConfig;
  avgInkCostPerMlMdl: number;
  /** Canvas mirrored wrap per side, cm (0 for everything else). */
  galleryWrapCm: number;
}

export interface LfShopPieceSpec {
  widthCm: number;
  heightCm: number;
  finishing?: LfFinishingInput | null;
}

function printableCmOf(m: LfPricingMaterial): number {
  return (
    resolveEffectivePrintableWidthMeters({
      printableWidthMeters: m.printableWidthMeters?.toString() ?? null,
      rollWidthMeters: m.rollWidthMeters.toString(),
    }) * 100
  );
}

function sellRatesOf(m: LfPricingMaterial, prod: ProductionCostsConfig) {
  const effLm: number = effectiveLfMaterialCostPerLinearMeterMdl(m);
  const resolvedSell = resolveLfSellRatesPerLinearMeterMdl({ effectiveMaterialCostPerLinearMeterMdl: effLm, production: prod, material: m });
  return {
    effLm,
    material: {
      costPerLinearMeter: effLm,
      finalRetailPricePerLinearMeter: resolvedSell.finalRetailPricePerLinearMeter,
      finalDealerPricePerLinearMeter: resolvedSell.finalDealerPricePerLinearMeter,
      dealerPricePerLinearMeter: m.dealerPricePerLinearMeter,
      retailPricePerLinearMeter: m.retailPricePerLinearMeter,
      dealerPrintPricePerLinearMeter: m.dealerPrintPricePerLinearMeter,
      retailPrintPricePerLinearMeter: m.retailPrintPricePerLinearMeter,
    },
  };
}

/** Roll metres + material sell of `q` pieces on roll `m`, or null when they do not fit. */
function packOn(
  m: LfPricingMaterial,
  ctx: LfShopPricingContext,
  effW: number,
  effH: number,
  q: number,
): { lm: number; materialSell: number; effLm: number; pricing: ReturnType<typeof computeLargeFormatLinePricing> } | null {
  const printableCm: number = printableCmOf(m);
  let lm: number;
  if (ctx.family) {
    const tiles: GroupTilePackTile[] = Array.from({ length: q }, (_, i) => ({
      id: `T${i + 1}`,
      label: "",
      widthCm: effW,
      heightCm: effH,
      allowRotate: true,
    }));
    const pack = packGroupTiles(tiles, printableCm, GROUP_TILE_PACK_DEFAULT_GAP_CM);
    if (pack.unplacedTileIds.length > 0) return null;
    lm = pack.totalAlongCm / 100;
  } else {
    const pack = computeLargeFormatRollLayout({
      printableWidthCm: printableCm,
      nominalRollWidthMeters: Number(m.rollWidthMeters),
      printWidthCm: effW,
      printHeightCm: effH,
      quantity: q,
    });
    if (!pack.ok) return null;
    lm = pack.layout.calculatedLinearMeters;
  }
  const { effLm, material } = sellRatesOf(m, ctx.prod);
  const pricing = computeLargeFormatLinePricing({ calculatedLinearMeters: lm, customerType: "retail", material });
  return { lm, materialSell: pricing.materialSellPrice, effLm, pricing };
}

/**
 * Studio retail line price of `q` pieces (print + ink + minimum + finishing),
 * whole lei, as the order pipeline computes it; null when the piece does not fit.
 */
export function lfShopLineTotalMdl(ctx: LfShopPricingContext, piece: LfShopPieceSpec, q: number): number | null {
  const effW: number = piece.widthCm + 2 * ctx.galleryWrapCm;
  const effH: number = piece.heightCm + 2 * ctx.galleryWrapCm;
  // Family: the cheapest material sell wins (first roll on a tie), as `pickCheapestFamilyMaterialForTiles`.
  let best: { m: LfPricingMaterial; packed: NonNullable<ReturnType<typeof packOn>> } | null = null;
  for (const m of ctx.family ? ctx.materials : ctx.materials.slice(0, 1)) {
    if (!m.isActive) continue;
    const packed = packOn(m, ctx, effW, effH, q);
    if (packed && (!best || packed.materialSell < best.packed.materialSell)) best = { m, packed };
  }
  if (!best) return null;
  const econ = computeLfRollOrderEconomics({
    printWidthCm: effW,
    printHeightCm: effH,
    quantity: q,
    calculatedLinearMeters: best.packed.lm,
    rollWidthMeters: Number(best.m.rollWidthMeters),
    effectiveMaterialCostPerLinearMeterMdl: best.packed.effLm,
    inkMlPerSqm: ctx.prod.inkMlPerSqmLargeFormatRoll,
    avgInkCostPerMlMdl: ctx.avgInkCostPerMlMdl,
    totalSellPriceMdl: best.packed.materialSell,
  });
  const inkSell: number = computeLfInkSellPriceMdl(econ.inkCostMdl, "retail", ctx.prod);
  const merged = mergeLfPricingWithInkSell(best.packed.pricing, inkSell);
  const print: number = ctx.family
    ? applyGroupMinimumSellTotal([merged], ctx.prod.lfMinimumLineTotalMdl).pricings[0]!.totalSellPrice
    : applyLfMinimumLineSellTotalMdl(merged, ctx.prod.lfMinimumLineTotalMdl).pricing.totalSellPrice;
  const finishing: number = computeLfFinishing(piece.finishing ?? null, piece.widthCm, piece.heightCm, q)?.totalMdl ?? 0;
  return print + finishing;
}

/**
 * Whole-lei price per piece for `q` pieces: the lowest per-piece price of any
 * quantity up to `q`, rounded down. `lineTotal(k)` → studio line price of k pieces.
 */
export function lfShopUnitPriceMdl(lineTotal: (k: number) => number | null, q: number): number | null {
  let best: number = Number.POSITIVE_INFINITY;
  for (let k = 1; k <= q; k++) {
    const t: number | null = lineTotal(k);
    if (t != null && t / k < best) best = t / k;
  }
  // A hair of tolerance so 647,0000001 (float) stays 647.
  return Number.isFinite(best) ? Math.floor(best + 1e-6) : null;
}

/**
 * Fixed sizes of the material that fit inside a custom size (either
 * orientation): a custom size never costs less per piece than the dearest of
 * them — 50×70 custom is at least the 50×70 fixed price.
 */
export function lfPresetFloorMdl(
  presets: readonly { widthCm: number; heightCm: number; retailPriceMdl: number }[],
  widthCm: number,
  heightCm: number,
): number {
  const eps = 1e-9;
  let floor = 0;
  for (const p of presets) {
    const fits =
      (p.widthCm <= widthCm + eps && p.heightCm <= heightCm + eps) || (p.widthCm <= heightCm + eps && p.heightCm <= widthCm + eps);
    if (fits && p.retailPriceMdl > floor) floor = p.retailPriceMdl;
  }
  return floor;
}
