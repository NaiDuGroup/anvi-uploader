import type { z } from "zod";
import { DEFAULT_DTF_SETTINGS, dtfSettingsSchema, parseDtfSettingsJson, type DtfSettings } from "@/lib/dtf/dtfSettings";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { DEFAULT_UV_SETTINGS, parseUvSettingsJson, uvSettingsSchema, type UvSettings } from "@/lib/printMethods/uvSettings";
import {
  DEFAULT_SUBLIMATION_SETTINGS,
  mergeSublimationSettingsPatch,
  parseSublimationSettingsJson,
  sublimationSettingsSchema,
  type SublimationSettings,
} from "@/lib/printMethods/sublimationSettings";

/** Settings shape of each print method. */
export interface PrintMethodSettingsMap {
  [PrintMethodCode.Dtf]: DtfSettings;
  [PrintMethodCode.Uv]: UvSettings;
  [PrintMethodCode.Sublimation]: SublimationSettings;
}

export type PrintMethodSettings<C extends PrintMethodCode = PrintMethodCode> = PrintMethodSettingsMap[C];

/** Unit shown next to a settings field. */
export enum SettingsFieldUnit {
  Cm = "cm",
  Ml = "ml",
  MlPerSqm = "ml_per_sqm",
  MlPerLinearMeter = "ml_per_m",
  GramsPerLinearMeter = "g_per_m",
  Percent = "pct",
  Mdl = "mdl",
  MdlPerSqm = "mdl_per_sqm",
}

interface PrintMethodSettingsDef<T extends object> {
  schema: z.ZodObject<{ [K in keyof T]: z.ZodType<T[K]> }>;
  defaults: T;
  parse: (raw: unknown) => T;
  /**
   * Validate a patch and merge it onto `current` (throws `ZodError`). Flat
   * methods replace the patched keys; sublimation merges norms per category.
   */
  merge?: (current: T, patch: unknown) => T;
  /** Plain number fields of the generic form, in display order, with their units. */
  fields: readonly { key: keyof T & string; unit: SettingsFieldUnit }[];
}

const DTF_DEF: PrintMethodSettingsDef<DtfSettings> = {
  schema: dtfSettingsSchema,
  defaults: DEFAULT_DTF_SETTINGS,
  parse: parseDtfSettingsJson,
  fields: [
    { key: "filmWidthCm", unit: SettingsFieldUnit.Cm },
    { key: "printableWidthCm", unit: SettingsFieldUnit.Cm },
    { key: "gapCm", unit: SettingsFieldUnit.Cm },
    { key: "inkMlPerLinearMeter", unit: SettingsFieldUnit.MlPerLinearMeter },
    { key: "powderGramsPerLinearMeter", unit: SettingsFieldUnit.GramsPerLinearMeter },
    { key: "includedPrintCreditMdl", unit: SettingsFieldUnit.Mdl },
    { key: "pressFeePerZoneMdl", unit: SettingsFieldUnit.Mdl },
    { key: "minimumLineTotalMdl", unit: SettingsFieldUnit.Mdl },
  ],
};

const UV_DEF: PrintMethodSettingsDef<UvSettings> = {
  schema: uvSettingsSchema,
  defaults: DEFAULT_UV_SETTINGS,
  parse: parseUvSettingsJson,
  fields: [
    { key: "retailPricePerSqmMdl", unit: SettingsFieldUnit.MdlPerSqm },
    { key: "dealerPricePerSqmMdl", unit: SettingsFieldUnit.MdlPerSqm },
    { key: "minimumZonePriceRetailMdl", unit: SettingsFieldUnit.Mdl },
    { key: "minimumZonePriceDealerMdl", unit: SettingsFieldUnit.Mdl },
    { key: "whiteLayerSurchargePct", unit: SettingsFieldUnit.Percent },
    { key: "varnishSurchargePct", unit: SettingsFieldUnit.Percent },
    { key: "primerSurchargePct", unit: SettingsFieldUnit.Percent },
    { key: "clientItemSetupFeeMdl", unit: SettingsFieldUnit.Mdl },
    { key: "minimumLineTotalMdl", unit: SettingsFieldUnit.Mdl },
    { key: "cmykMlPerSqm", unit: SettingsFieldUnit.MlPerSqm },
    { key: "whiteMlPerSqmPerLayer", unit: SettingsFieldUnit.MlPerSqm },
    { key: "varnishMlPerSqmPerLayer", unit: SettingsFieldUnit.MlPerSqm },
    { key: "primerMlPerSqm", unit: SettingsFieldUnit.MlPerSqm },
    { key: "wastePct", unit: SettingsFieldUnit.Percent },
  ],
};

/** Sublimation: waste in the generic form; per-category norms in their own table. */
const SUBLIMATION_DEF: PrintMethodSettingsDef<SublimationSettings> = {
  schema: sublimationSettingsSchema,
  defaults: DEFAULT_SUBLIMATION_SETTINGS,
  parse: parseSublimationSettingsJson,
  merge: mergeSublimationSettingsPatch,
  fields: [{ key: "wastePct", unit: SettingsFieldUnit.Percent }],
};

export const PRINT_METHOD_SETTINGS: { [C in PrintMethodCode]: PrintMethodSettingsDef<PrintMethodSettingsMap[C]> } = {
  [PrintMethodCode.Dtf]: DTF_DEF,
  [PrintMethodCode.Uv]: UV_DEF,
  [PrintMethodCode.Sublimation]: SUBLIMATION_DEF,
};

/** Tolerant read of a method's stored settings JSON (invalid keys → defaults). */
export function parsePrintMethodSettings<C extends PrintMethodCode>(code: C, raw: unknown): PrintMethodSettingsMap[C] {
  return (PRINT_METHOD_SETTINGS[code] as PrintMethodSettingsDef<PrintMethodSettingsMap[C]>).parse(raw);
}

/**
 * Validate a settings patch (any subset of the method's keys; unknown keys are
 * dropped) and merge it onto `current`. Throws `ZodError` on an invalid value.
 */
export function mergePrintMethodSettingsPatch<C extends PrintMethodCode>(
  code: C,
  current: PrintMethodSettingsMap[C],
  patch: unknown,
): PrintMethodSettingsMap[C] {
  const def = PRINT_METHOD_SETTINGS[code] as PrintMethodSettingsDef<PrintMethodSettingsMap[C]>;
  if (def.merge) return def.merge(current, patch);
  const valid = def.schema.partial().parse(patch) as Partial<PrintMethodSettingsMap[C]>;
  return def.parse({ ...current, ...valid });
}
