import { z } from "zod";
import { parseSettingsJson } from "@/lib/printMethods/parseSettingsJson";

const ml = z.number().min(0).max(1000);
const pct = z.number().min(0).max(1000);
const mdl = z.number().min(0).max(1_000_000);

/**
 * UV printer norms (three heads: white, CMYK, varnish) and pricing options,
 * stored in `PrintMethod('uv').settings`. Defaults are first estimates, refined
 * after test prints.
 */
export const uvSettingsSchema = z.object({
  /** CMYK ink per m² of print at full coverage (ml). */
  cmykMlPerSqm: ml,
  /** White ink per m² per white layer (ml). */
  whiteMlPerSqmPerLayer: ml,
  /** Varnish per m² per varnish layer (ml). */
  varnishMlPerSqmPerLayer: ml,
  /** Purges and head cleaning on top of the ink used (%). */
  wastePct: z.number().min(0).max(100),
  /** Added to a zone's format price when white is printed (%). */
  whiteLayerSurchargePct: pct,
  /** Added to a zone's format price when varnish is printed (%). */
  varnishSurchargePct: pct,
  /**
   * Part of the first zone's format price already included in a stock item's
   * price (MDL, e.g. pens and notebooks sold printed). The first zone of a
   * stock item is charged only above this amount; client items pay in full.
   */
  includedPrintCreditMdl: mdl,
  /** Set-up fee per line printed on a client's item (MDL). */
  clientItemSetupFeeMdl: mdl,
  /** Each UV line's total is raised to at least this (MDL, 0 = off). */
  minimumLineTotalMdl: mdl,
});

export type UvSettings = z.infer<typeof uvSettingsSchema>;

export const DEFAULT_UV_SETTINGS: UvSettings = {
  cmykMlPerSqm: 10,
  whiteMlPerSqmPerLayer: 12,
  varnishMlPerSqmPerLayer: 12,
  wastePct: 15,
  whiteLayerSurchargePct: 0,
  varnishSurchargePct: 0,
  includedPrintCreditMdl: 0,
  clientItemSetupFeeMdl: 0,
  minimumLineTotalMdl: 0,
};

/** Tolerant read of the stored JSON: unknown or invalid keys fall back to defaults. */
export function parseUvSettingsJson(raw: unknown): UvSettings {
  return parseSettingsJson(uvSettingsSchema, DEFAULT_UV_SETTINGS, raw);
}
