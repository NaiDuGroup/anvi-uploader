import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { DEFAULT_DTF_SETTINGS, dtfSettingsSchema, parseDtfSettingsJson } from "@/lib/dtf/dtfSettings";
import { printMethodsEn } from "@/lib/i18n/printMethods/en";
import { printMethodsRo } from "@/lib/i18n/printMethods/ro";
import { printMethodsRu } from "@/lib/i18n/printMethods/ru";
import { isPrintMethodCode, PRINT_METHOD_CODES, PrintMethodCode, printMethodHasPriceList } from "./methods";
import { mergePrintMethodSettingsPatch, parsePrintMethodSettings, PRINT_METHOD_SETTINGS } from "./settings";
import { DEFAULT_UV_SETTINGS, parseUvSettingsJson, uvSettingsSchema } from "./uvSettings";
import {
  DEFAULT_SUBLIMATION_SETTINGS,
  mergeSublimationSettingsPatch,
  parseSublimationSettingsJson,
  sublimationNormFor,
} from "./sublimationSettings";

describe("print method codes", () => {
  it("knows dtf, uv and sublimation; only dtf and uv have a format price list", () => {
    expect(PRINT_METHOD_CODES).toEqual(["dtf", "uv", "sublimation"]);
    expect(isPrintMethodCode("uv")).toBe(true);
    expect(isPrintMethodCode("sublimation")).toBe(true);
    expect(isPrintMethodCode("laser")).toBe(false);
    expect(isPrintMethodCode(undefined)).toBe(false);
    expect(printMethodHasPriceList(PrintMethodCode.Dtf)).toBe(true);
    expect(printMethodHasPriceList(PrintMethodCode.Uv)).toBe(true);
    expect(printMethodHasPriceList(PrintMethodCode.Sublimation)).toBe(false);
  });
});

describe("UV settings", () => {
  it("defaults are the first estimates and pass the schema", () => {
    expect(DEFAULT_UV_SETTINGS).toEqual({
      cmykMlPerSqm: 10,
      whiteMlPerSqmPerLayer: 12,
      varnishMlPerSqmPerLayer: 12,
      wastePct: 15,
      whiteLayerSurchargePct: 0,
      varnishSurchargePct: 0,
      includedPrintCreditMdl: 0,
      clientItemSetupFeeMdl: 0,
      minimumLineTotalMdl: 0,
    });
    expect(uvSettingsSchema.parse(DEFAULT_UV_SETTINGS)).toEqual(DEFAULT_UV_SETTINGS);
  });

  it("tolerant parse keeps valid keys and drops the rest", () => {
    expect(parseUvSettingsJson(null)).toEqual(DEFAULT_UV_SETTINGS);
    expect(parseUvSettingsJson([1, 2])).toEqual(DEFAULT_UV_SETTINGS);
    const s = parseUvSettingsJson({ cmykMlPerSqm: 8.5, wastePct: 150, varnishSurchargePct: "10", extra: 1 });
    expect(s.cmykMlPerSqm).toBe(8.5);
    expect(s.wastePct).toBe(15);
    expect(s.varnishSurchargePct).toBe(0);
    expect(s).not.toHaveProperty("extra");
  });
});

describe("sublimation settings (norms per category)", () => {
  it("defaults to zero waste and no norms (nothing is written off)", () => {
    expect(DEFAULT_SUBLIMATION_SETTINGS).toEqual({ wastePct: 0, norms: {} });
    expect(parseSublimationSettingsJson({})).toEqual(DEFAULT_SUBLIMATION_SETTINGS);
    expect(parseSublimationSettingsJson(null)).toEqual(DEFAULT_SUBLIMATION_SETTINGS);
    expect(sublimationNormFor(DEFAULT_SUBLIMATION_SETTINGS, "mugs")).toEqual({ paperSheets: 0, tapeCm: 0, inkMl: 0 });
  });

  it("tolerant parse: bad numbers → 0, bad category codes dropped, waste out of range → default", () => {
    const s = parseSublimationSettingsJson({
      wastePct: 150,
      norms: {
        mugs: { paperSheets: 1, tapeCm: 30, inkMl: "2" },
        pillows: { paperSheets: -1, tapeCm: 80, inkMl: 3.5, extra: 1 },
        "Bad Code": { paperSheets: 1, tapeCm: 1, inkMl: 1 },
        puzzles: "nope",
      },
    });
    expect(s).toEqual({
      wastePct: 0,
      norms: {
        mugs: { paperSheets: 1, tapeCm: 30, inkMl: 0 },
        pillows: { paperSheets: 0, tapeCm: 80, inkMl: 3.5 },
        puzzles: { paperSheets: 0, tapeCm: 0, inkMl: 0 },
      },
    });
  });

  it("patch merges norms per category and keeps the waste unless sent", () => {
    const current = { wastePct: 10, norms: { mugs: { paperSheets: 1, tapeCm: 30, inkMl: 1 } } };
    expect(mergeSublimationSettingsPatch(current, { norms: { clocks: { paperSheets: 2, tapeCm: 0, inkMl: 4 } } })).toEqual({
      wastePct: 10,
      norms: { mugs: current.norms.mugs, clocks: { paperSheets: 2, tapeCm: 0, inkMl: 4 } },
    });
    expect(mergePrintMethodSettingsPatch(PrintMethodCode.Sublimation, current, { wastePct: 5 })).toEqual({ ...current, wastePct: 5 });
    expect(() => mergeSublimationSettingsPatch(current, { norms: { mugs: { paperSheets: 1, tapeCm: 30 } } })).toThrow(ZodError);
    expect(() => mergeSublimationSettingsPatch(current, { wastePct: 101 })).toThrow(ZodError);
    expect(() => mergeSublimationSettingsPatch(current, { norms: { "A B": { paperSheets: 1, tapeCm: 1, inkMl: 1 } } })).toThrow(
      ZodError,
    );
  });
});

describe("DTF settings (moved to PrintMethod('dtf').settings)", () => {
  it("keeps the old tolerant parse semantics", () => {
    expect(parseDtfSettingsJson({})).toEqual(DEFAULT_DTF_SETTINGS);
    expect(parseDtfSettingsJson("nope")).toEqual(DEFAULT_DTF_SETTINGS);
    const s = parseDtfSettingsJson({ filmWidthCm: 30, printableWidthCm: 31, gapCm: -1, pressFeePerZoneMdl: 15 });
    expect(s).toEqual({ ...DEFAULT_DTF_SETTINGS, filmWidthCm: 30, printableWidthCm: 30, pressFeePerZoneMdl: 15 });
    expect(parsePrintMethodSettings(PrintMethodCode.Dtf, { gapCm: 2 })).toEqual({ ...DEFAULT_DTF_SETTINGS, gapCm: 2 });
  });
});

describe("mergePrintMethodSettingsPatch", () => {
  it("merges a partial patch and drops unknown keys", () => {
    const next = mergePrintMethodSettingsPatch(PrintMethodCode.Uv, DEFAULT_UV_SETTINGS, {
      clientItemSetupFeeMdl: 50,
      bogus: 3,
    });
    expect(next).toEqual({ ...DEFAULT_UV_SETTINGS, clientItemSetupFeeMdl: 50 });
  });

  it("rejects an invalid value", () => {
    expect(() => mergePrintMethodSettingsPatch(PrintMethodCode.Uv, DEFAULT_UV_SETTINGS, { wastePct: 101 })).toThrow(
      ZodError,
    );
    expect(() => mergePrintMethodSettingsPatch(PrintMethodCode.Dtf, DEFAULT_DTF_SETTINGS, { gapCm: "1" })).toThrow(
      ZodError,
    );
  });

  it("re-applies DTF invariants after the merge", () => {
    const next = mergePrintMethodSettingsPatch(PrintMethodCode.Dtf, DEFAULT_DTF_SETTINGS, { filmWidthCm: 30 });
    expect(next.printableWidthCm).toBe(30);
  });

  it("accepts a full DTF settings body like the old route", () => {
    const body = { ...DEFAULT_DTF_SETTINGS, inkMlPerLinearMeter: 16 };
    expect(mergePrintMethodSettingsPatch(PrintMethodCode.Dtf, DEFAULT_DTF_SETTINGS, body)).toEqual(body);
  });
});

describe("settings form fields", () => {
  const dictionaries = { ru: printMethodsRu, ro: printMethodsRo, en: printMethodsEn };

  it.each(PRINT_METHOD_CODES)("%s lists every number key of its schema once", (code) => {
    const def = PRINT_METHOD_SETTINGS[code];
    const keys = def.fields.map((f) => f.key).sort();
    // Sublimation norms are edited in their own per-category table, not as form fields.
    const numberKeys = Object.keys(def.schema.shape).filter((k) => k !== "norms").sort();
    expect(keys).toEqual(numberKeys);
    expect(Object.keys(def.defaults).filter((k) => k !== "norms").sort()).toEqual(keys);
  });

  it("every field has a label in each language, and every UV field a hint", () => {
    for (const dict of Object.values(dictionaries)) {
      for (const code of PRINT_METHOD_CODES) {
        const texts = dict.fields[code] as Record<string, { label: string; hint?: string }>;
        for (const field of PRINT_METHOD_SETTINGS[code].fields) {
          expect(texts[field.key]?.label, `${code}.${field.key}`).toBeTruthy();
          if (code === PrintMethodCode.Uv) expect(texts[field.key]?.hint, `${code}.${field.key}`).toBeTruthy();
          expect(dict.units[field.unit]).toBeTruthy();
        }
      }
    }
  });

  it("DTF schema is the existing one", () => {
    expect(PRINT_METHOD_SETTINGS[PrintMethodCode.Dtf].schema).toBe(dtfSettingsSchema);
  });
});
