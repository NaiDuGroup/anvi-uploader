import { z } from "zod";
import { parseSettingsJson } from "@/lib/printMethods/parseSettingsJson";

/** DTF production norms and fees, stored in `PrintMethod('dtf').settings`. */
export const dtfSettingsSchema = z.object({
  /** Physical film roll width (cm). */
  filmWidthCm: z.number().positive().max(200),
  /** Width the printer can actually print across the film (cm). */
  printableWidthCm: z.number().positive().max(200),
  /** Spacing between transfers on the film and at its edges (cm). */
  gapCm: z.number().min(0).max(10),
  /** White + colour ink used per linear metre of printed film (ml). */
  inkMlPerLinearMeter: z.number().min(0).max(1000),
  /** Adhesive powder used per linear metre of printed film (g). */
  powderGramsPerLinearMeter: z.number().min(0).max(5000),
  /**
   * Value of the print included in a stock garment's price (MDL, the A4
   * transfer rate). The first zone is charged only above this amount.
   */
  includedPrintCreditMdl: z.number().min(0).max(100_000),
  /** Pressing fee added per print zone on every piece (MDL). */
  pressFeePerZoneMdl: z.number().min(0).max(100_000),
  /** Each DTF line's total is raised to at least this (MDL, 0 = off). */
  minimumLineTotalMdl: z.number().min(0).max(1_000_000),
});

export type DtfSettings = z.infer<typeof dtfSettingsSchema>;

export const DEFAULT_DTF_SETTINGS: DtfSettings = {
  filmWidthCm: 33,
  printableWidthCm: 32,
  gapCm: 1,
  inkMlPerLinearMeter: 14,
  powderGramsPerLinearMeter: 25,
  includedPrintCreditMdl: 180,
  pressFeePerZoneMdl: 0,
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
