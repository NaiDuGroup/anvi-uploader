import { z } from "zod";
import { parseSettingsJson } from "@/lib/printMethods/parseSettingsJson";

const pieces = z.number().int().min(0).max(100_000);
const pct = z.number().min(0).max(100);
const mdl = z.number().min(0).max(1_000_000);

/** DTF production norms and fees, stored in `PrintMethod('dtf').settings`. */
export const dtfSettingsSchema = z.object({
  /** Physical film roll width (cm). */
  filmWidthCm: z.number().positive().max(200),
  /** Width the printer can actually print across the film (cm). */
  printableWidthCm: z.number().positive().max(200),
  /** Spacing between transfers on the film and at its edges (cm). */
  gapCm: z.number().min(0).max(10),
  /**
   * Workshop film layout: smallest gap between the real outlines of two
   * transfers (mm). Transparent canvas margins are ignored.
   */
  layoutGapMm: z.number().min(0).max(50),
  /** White underbase spot channel is shrunk this much inside the artwork edge (mm). */
  whiteChokeMm: z.number().min(0).max(5),
  /** White + colour ink used per linear metre of printed film (ml). */
  inkMlPerLinearMeter: z.number().min(0).max(1000),
  /** Adhesive powder used per linear metre of printed film (g). */
  powderGramsPerLinearMeter: z.number().min(0).max(5000),
  /**
   * Retail run-size discount on print prices: from `runDiscountNMinQty` pieces
   * of one layout the format price drops by `runDiscountNPct` %. 0 pieces = step off.
   */
  runDiscount1MinQty: pieces,
  runDiscount1Pct: pct,
  runDiscount2MinQty: pieces,
  runDiscount2Pct: pct,
  runDiscount3MinQty: pieces,
  runDiscount3Pct: pct,
  /** Discounted prices are rounded to this step (MDL, 0 = to the bani). */
  runDiscountRoundToMdl: mdl,
  /** Pressing fee added per print zone on every piece (MDL). */
  pressFeePerZoneMdl: mdl,
  /** Lines printed on the client's item (no stock garment) are raised to at least this, retail (MDL). */
  minimumPrintOnlyRetailMdl: mdl,
  /** Same minimum for dealers (MDL). */
  minimumPrintOnlyDealerMdl: mdl,
  /** Every DTF line's total is raised to at least this (MDL, 0 = off). */
  minimumLineTotalMdl: mdl,
});

export type DtfSettings = z.infer<typeof dtfSettingsSchema>;

/**
 * Defaults = the studio price list (2026-11): −7 / −14 / −29 % from 2 / 10 / 50
 * pieces rounded to 5 lei (gives the «Ofertă» T-shirt prices), print-only
 * minimum 100 / 40. Ink and powder norms from a year of purchases.
 */
export const DEFAULT_DTF_SETTINGS: DtfSettings = {
  filmWidthCm: 33,
  printableWidthCm: 32,
  gapCm: 1,
  layoutGapMm: 3,
  whiteChokeMm: 0.2,
  inkMlPerLinearMeter: 15,
  powderGramsPerLinearMeter: 10,
  runDiscount1MinQty: 2,
  runDiscount1Pct: 7,
  runDiscount2MinQty: 10,
  runDiscount2Pct: 14,
  runDiscount3MinQty: 50,
  runDiscount3Pct: 29,
  runDiscountRoundToMdl: 5,
  pressFeePerZoneMdl: 0,
  minimumPrintOnlyRetailMdl: 100,
  minimumPrintOnlyDealerMdl: 40,
  minimumLineTotalMdl: 0,
};

/** Tolerant read of the stored JSON: unknown or invalid keys fall back to defaults. */
export function parseDtfSettingsJson(raw: unknown): DtfSettings {
  const merged: DtfSettings = parseSettingsJson(dtfSettingsSchema, DEFAULT_DTF_SETTINGS, raw);
  if (merged.printableWidthCm > merged.filmWidthCm) {
    merged.printableWidthCm = merged.filmWidthCm;
  }
  return merged;
}

/** Retail run-size discount (%) for `quantity` pieces of one layout. */
export function dtfRunDiscountPct(
  settings: Pick<
    DtfSettings,
    | "runDiscount1MinQty"
    | "runDiscount1Pct"
    | "runDiscount2MinQty"
    | "runDiscount2Pct"
    | "runDiscount3MinQty"
    | "runDiscount3Pct"
  >,
  quantity: number,
): number {
  const steps: [number, number][] = [
    [settings.runDiscount1MinQty, settings.runDiscount1Pct],
    [settings.runDiscount2MinQty, settings.runDiscount2Pct],
    [settings.runDiscount3MinQty, settings.runDiscount3Pct],
  ];
  let pctOff = 0;
  let bestMin = 0;
  for (const [minQty, p] of steps) {
    if (minQty > 0 && quantity >= minQty && minQty >= bestMin) {
      bestMin = minQty;
      pctOff = p;
    }
  }
  return pctOff;
}

/** `price` less `pctOff` %, rounded to `roundTo` lei (0 = to the bani). */
export function discountedPrice(price: number, pctOff: number, roundTo: number): number {
  if (pctOff <= 0) return price;
  const raw: number = (price * (100 - pctOff)) / 100;
  if (roundTo > 0) return Math.round(raw / roundTo) * roundTo;
  return Math.round(raw * 100) / 100;
}
