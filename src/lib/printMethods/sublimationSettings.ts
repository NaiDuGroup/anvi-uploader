import { z } from "zod";

/**
 * Epson L1800 usage per printed blank, stored in `PrintMethod('sublimation').settings`:
 * transfer paper (sheets), heat tape (cm) and ink (ml, spread over the six ink
 * slots by share) per category of blanks, plus a waste allowance. Everything
 * starts at 0 — nothing is written off until the owner fills the norms in.
 */

/** `StockCategory.code`, e.g. `mugs`, `pillows`. */
export const sublimationCategoryCodeSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,47}$/);

export const sublimationNormSchema = z.object({
  /** Transfer paper sheets per printed item. */
  paperSheets: z.number().min(0).max(100),
  /** Heat tape per printed item (cm). */
  tapeCm: z.number().min(0).max(10_000),
  /** Ink per printed item (ml, all colours together). */
  inkMl: z.number().min(0).max(1000),
});
export type SublimationNorm = z.infer<typeof sublimationNormSchema>;

export const sublimationSettingsSchema = z.object({
  /** Misprints and nozzle cleaning on top of the norms (%). */
  wastePct: z.number().min(0).max(100),
  norms: z.record(sublimationCategoryCodeSchema, sublimationNormSchema),
});
export type SublimationSettings = z.infer<typeof sublimationSettingsSchema>;

export const ZERO_SUBLIMATION_NORM: SublimationNorm = { paperSheets: 0, tapeCm: 0, inkMl: 0 };

export const DEFAULT_SUBLIMATION_SETTINGS: SublimationSettings = { wastePct: 0, norms: {} };

const NORM_KEYS = ["paperSheets", "tapeCm", "inkMl"] as const;

function asRecord(raw: unknown): Record<string, unknown> {
  return raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** One category's norm, key by key (invalid keys → 0). */
function parseNorm(raw: unknown): SublimationNorm {
  const base: Record<string, unknown> = asRecord(raw);
  const out: SublimationNorm = { ...ZERO_SUBLIMATION_NORM };
  for (const key of NORM_KEYS) {
    const v = sublimationNormSchema.shape[key].safeParse(base[key]);
    if (v.success) out[key] = v.data;
  }
  return out;
}

/** Tolerant read of the stored JSON: invalid keys fall back to 0, foreign category codes are dropped. */
export function parseSublimationSettingsJson(raw: unknown): SublimationSettings {
  const base: Record<string, unknown> = asRecord(raw);
  const waste = sublimationSettingsSchema.shape.wastePct.safeParse(base.wastePct);
  const norms: Record<string, SublimationNorm> = {};
  for (const [code, value] of Object.entries(asRecord(base.norms))) {
    if (sublimationCategoryCodeSchema.safeParse(code).success) norms[code] = parseNorm(value);
  }
  return { wastePct: waste.success ? waste.data : DEFAULT_SUBLIMATION_SETTINGS.wastePct, norms };
}

/** Patch body: waste and / or norms of some categories (each category replaced whole). */
export const sublimationSettingsPatchSchema = sublimationSettingsSchema.partial();

/**
 * Validate a patch and merge it: norms merge per category, so saving one row
 * keeps the others. Throws `ZodError` on an invalid value.
 */
export function mergeSublimationSettingsPatch(current: SublimationSettings, patch: unknown): SublimationSettings {
  const valid = sublimationSettingsPatchSchema.parse(patch);
  return parseSublimationSettingsJson({
    wastePct: valid.wastePct ?? current.wastePct,
    norms: { ...current.norms, ...(valid.norms ?? {}) },
  });
}

/** Norm for one category; zeros when not set. */
export function sublimationNormFor(settings: SublimationSettings, categoryCode: string): SublimationNorm {
  return settings.norms[categoryCode] ?? ZERO_SUBLIMATION_NORM;
}
