import { z } from "zod";
import { parseSettingsJson } from "@/lib/printMethods/parseSettingsJson";

const ml = z.number().min(0).max(1000);
const pct = z.number().min(0).max(1000);
const mdl = z.number().min(0).max(1_000_000);

/**
 * UV printer norms (three heads: white, CMYK, varnish) and pricing options,
 * stored in `PrintMethod('uv').settings`. Defaults are first estimates, refined
 * after test prints.
 *
 * Print is priced from the print parameters (area × rate per m², at least the
 * zone minimum), like large format — there is no price list of formats. The
 * main zone of a stock item is included in the item price.
 */
export const uvSettingsSchema = z.object({
  /** Retail print price per m² of a zone (MDL). */
  retailPricePerSqmMdl: mdl,
  /** Dealer print price per m² of a zone (MDL). */
  dealerPricePerSqmMdl: mdl,
  /** A zone costs at least this per piece, retail (MDL): small prints still pay for positioning. */
  minimumZonePriceRetailMdl: mdl,
  /** Same for dealers (MDL). */
  minimumZonePriceDealerMdl: mdl,
  /** CMYK ink per m² of print at full coverage (ml). */
  cmykMlPerSqm: ml,
  /** White ink per m² per white layer (ml). */
  whiteMlPerSqmPerLayer: ml,
  /** Varnish per m² per varnish layer (ml). */
  varnishMlPerSqmPerLayer: ml,
  /** Primer wiped on by hand, per m² of a primed zone (ml); no head-cleaning waste. */
  primerMlPerSqm: ml,
  /** Purges and head cleaning on top of the ink used (%). */
  wastePct: z.number().min(0).max(100),
  /** Added to a zone's print price per white layer above the first (%): one underbase layer is included. */
  whiteLayerSurchargePct: pct,
  /** Added to a zone's print price when varnish is printed (%). */
  varnishSurchargePct: pct,
  /** Added to a zone's print price when it is primed (%). */
  primerSurchargePct: pct,
  /** Set-up fee per line printed on a client's item (MDL). */
  clientItemSetupFeeMdl: mdl,
  /** Each UV line's total is raised to at least this (MDL, 0 = off). */
  minimumLineTotalMdl: mdl,
  /** UV-DTF: price per linear metre of film, retail (MDL). */
  uvDtfRetailPerMeterMdl: mdl,
  /** UV-DTF: price per linear metre of film, dealer (MDL). */
  uvDtfDealerPerMeterMdl: mdl,
  /** UV-DTF stickers / client item: a line costs at least this, retail (MDL). */
  uvDtfMinimumRetailMdl: mdl,
  /** Same for dealers (MDL). */
  uvDtfMinimumDealerMdl: mdl,
  /** UV-DTF film width the stickers are laid out on (cm; the 32 cm roll prints 30). */
  uvDtfPrintableWidthCm: z.number().min(1).max(200),
  /** Gap between stickers on the film (cm). */
  uvDtfGapCm: z.number().min(0).max(10),
  /** The film price is rounded to this (MDL, 0 = no rounding). */
  uvDtfRoundToMdl: mdl,
});

export type UvSettings = z.infer<typeof uvSettingsSchema>;

/** Prices default to 0: the studio sets them on «UV: цены и нормы» before taking client prints. */
export const DEFAULT_UV_SETTINGS: UvSettings = {
  retailPricePerSqmMdl: 0,
  dealerPricePerSqmMdl: 0,
  minimumZonePriceRetailMdl: 0,
  minimumZonePriceDealerMdl: 0,
  cmykMlPerSqm: 10,
  whiteMlPerSqmPerLayer: 12,
  varnishMlPerSqmPerLayer: 12,
  primerMlPerSqm: 10,
  wastePct: 15,
  whiteLayerSurchargePct: 0,
  varnishSurchargePct: 0,
  primerSurchargePct: 0,
  clientItemSetupFeeMdl: 0,
  minimumLineTotalMdl: 0,
  // UV-DTF prices agreed with the owner on 2026-11-02 (A3 ≈ 0.42 m → 210 / 100).
  uvDtfRetailPerMeterMdl: 500,
  uvDtfDealerPerMeterMdl: 240,
  uvDtfMinimumRetailMdl: 100,
  uvDtfMinimumDealerMdl: 50,
  uvDtfPrintableWidthCm: 30,
  uvDtfGapCm: 0.5,
  uvDtfRoundToMdl: 5,
};

/** Tolerant read of the stored JSON: unknown or invalid keys fall back to defaults. */
export function parseUvSettingsJson(raw: unknown): UvSettings {
  return parseSettingsJson(uvSettingsSchema, DEFAULT_UV_SETTINGS, raw);
}
