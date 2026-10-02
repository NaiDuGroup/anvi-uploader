import { describe, expect, it } from "vitest";
import {
  PEN_STANDARD_GEOMETRY,
} from "./composePenBatchPng";
import {
  PEN_PRESET_LONG,
  PEN_PRESET_STANDARD,
  clampGeometryCm,
  geometryCmEquals,
  geometryFromCm,
} from "./penBatchPresets";

describe("geometryFromCm", () => {
  it("standard preset round-trips to PEN_STANDARD_GEOMETRY", () => {
    const g = geometryFromCm(PEN_PRESET_STANDARD);
    expect(g).toEqual(PEN_STANDARD_GEOMETRY);
  });

  it("long preset converts cm → px correctly at 300 DPI", () => {
    // 7.5 cm * 300 / 2.54 = 885.826 → round to 886
    // 0.5 cm * 300 / 2.54 =  59.055 → round to 59
    // 2.9 cm * 300 / 2.54 = 342.519 → round to 343
    // 10.6 cm * 300 / 2.54 = 1251.969 → round to 1252
    const g = geometryFromCm(PEN_PRESET_LONG);
    expect(g.dpi).toBe(300);
    expect(g.cols).toBe(3);
    expect(g.slotWidthPx).toBe(886);
    expect(g.slotHeightPx).toBe(59);
    expect(g.gapHPx).toBe(343);
    expect(g.gapVPx).toBe(1252);
  });

  it("keeps cols fixed at 3 and dpi at 300 regardless of input", () => {
    const g = geometryFromCm({
      widthCm: 10,
      heightCm: 1,
      gapHCm: 0,
      gapVCm: 0,
    });
    expect(g.cols).toBe(3);
    expect(g.dpi).toBe(300);
  });
});

describe("clampGeometryCm", () => {
  it("passes through sane values untouched", () => {
    expect(clampGeometryCm(PEN_PRESET_STANDARD)).toEqual(PEN_PRESET_STANDARD);
    expect(clampGeometryCm(PEN_PRESET_LONG)).toEqual(PEN_PRESET_LONG);
  });

  it("clamps negatives / zeros for dimensions to the lower bound", () => {
    const out = clampGeometryCm({
      widthCm: -5,
      heightCm: 0,
      gapHCm: -1, // gap min is 0, so -1 → 0
      gapVCm: -0.5,
    });
    expect(out).toEqual({
      widthCm: 0.1,
      heightCm: 0.1,
      gapHCm: 0,
      gapVCm: 0,
    });
  });

  it("clamps absurdly large values to the upper bound", () => {
    const out = clampGeometryCm({
      widthCm: 10_000,
      heightCm: 500,
      gapHCm: 1_000,
      gapVCm: 10_000,
    });
    expect(out).toEqual({
      widthCm: 20,
      heightCm: 20,
      gapHCm: 50,
      gapVCm: 50,
    });
  });

  it("non-finite values collapse to the lower bound (safe default)", () => {
    // NaN / ±Infinity all fall to the lower bound rather than crash the
    // composer — the operator will see 0.1 / 0 and quickly re-dial.
    const out = clampGeometryCm({
      widthCm: NaN,
      heightCm: Infinity,
      gapHCm: -Infinity,
      gapVCm: NaN,
    });
    expect(out).toEqual({
      widthCm: 0.1,
      heightCm: 0.1,
      gapHCm: 0,
      gapVCm: 0,
    });
  });
});

describe("geometryCmEquals", () => {
  it("true for identical geometries", () => {
    expect(geometryCmEquals(PEN_PRESET_STANDARD, PEN_PRESET_STANDARD)).toBe(true);
  });

  it("true within 0.005 cm tolerance", () => {
    expect(
      geometryCmEquals(PEN_PRESET_STANDARD, {
        ...PEN_PRESET_STANDARD,
        widthCm: PEN_PRESET_STANDARD.widthCm + 0.004,
      }),
    ).toBe(true);
  });

  it("false when a dimension differs beyond tolerance", () => {
    expect(geometryCmEquals(PEN_PRESET_STANDARD, PEN_PRESET_LONG)).toBe(false);
    expect(
      geometryCmEquals(PEN_PRESET_STANDARD, {
        ...PEN_PRESET_STANDARD,
        gapHCm: PEN_PRESET_STANDARD.gapHCm + 0.01,
      }),
    ).toBe(false);
  });
});
