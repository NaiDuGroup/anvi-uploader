import type { z } from "zod";
import { DEFAULT_DTF_SETTINGS, dtfSettingsSchema, parseDtfSettingsJson, type DtfSettings } from "@/lib/dtf/dtfSettings";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { DEFAULT_UV_SETTINGS, parseUvSettingsJson, uvSettingsSchema, type UvSettings } from "@/lib/printMethods/uvSettings";

/** Settings shape of each print method. */
export interface PrintMethodSettingsMap {
  [PrintMethodCode.Dtf]: DtfSettings;
  [PrintMethodCode.Uv]: UvSettings;
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
}

interface PrintMethodSettingsDef<T extends object> {
  schema: z.ZodObject<{ [K in keyof T]: z.ZodNumber }>;
  defaults: T;
  parse: (raw: unknown) => T;
  /** Form fields in display order, with their units. */
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
    { key: "cmykMlPerSqm", unit: SettingsFieldUnit.MlPerSqm },
    { key: "whiteMlPerSqmPerLayer", unit: SettingsFieldUnit.MlPerSqm },
    { key: "varnishMlPerSqmPerLayer", unit: SettingsFieldUnit.MlPerSqm },
    { key: "wastePct", unit: SettingsFieldUnit.Percent },
    { key: "whiteLayerSurchargePct", unit: SettingsFieldUnit.Percent },
    { key: "varnishSurchargePct", unit: SettingsFieldUnit.Percent },
    { key: "includedPrintCreditMdl", unit: SettingsFieldUnit.Mdl },
    { key: "clientItemSetupFeeMdl", unit: SettingsFieldUnit.Mdl },
    { key: "minimumLineTotalMdl", unit: SettingsFieldUnit.Mdl },
  ],
};

export const PRINT_METHOD_SETTINGS: { [C in PrintMethodCode]: PrintMethodSettingsDef<PrintMethodSettingsMap[C]> } = {
  [PrintMethodCode.Dtf]: DTF_DEF,
  [PrintMethodCode.Uv]: UV_DEF,
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
  const valid = def.schema.partial().parse(patch) as Partial<PrintMethodSettingsMap[C]>;
  return def.parse({ ...current, ...valid });
}
