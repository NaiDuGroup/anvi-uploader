import { describe, expect, it } from "vitest";
import { MUG_SURFACE_DEFAULTS, parseMugSurface } from "./mugSurface";
import { mugAttributesJson, parseMugAttributes } from "./mugVariantAttributes";
import { parseMugProductSnapshot } from "./mugProductSnapshot";

describe("parseMugSurface", () => {
  it("falls back to glossy without gradient for old data", () => {
    expect(parseMugSurface({})).toEqual(MUG_SURFACE_DEFAULTS);
    expect(parseMugSurface(null)).toEqual(MUG_SURFACE_DEFAULTS);
  });

  it("keeps valid values and clamps the fade height", () => {
    expect(parseMugSurface({ finish: "glitter", gradientColorHex: "#c0392b", gradientHeightPct: 250 })).toEqual({
      finish: "glitter",
      gradientColorHex: "#c0392b",
      gradientHeightPct: 100,
    });
  });

  it("drops an unknown finish and a bad colour", () => {
    expect(parseMugSurface({ finish: "chrome", gradientColorHex: "red" })).toEqual(MUG_SURFACE_DEFAULTS);
  });
});

describe("mug attributes round-trip", () => {
  it("stores and reads finish and gradient", () => {
    const a = parseMugAttributes({ finish: "matte", gradientColorHex: "#2980b9", gradientHeightPct: 40 });
    const back = parseMugAttributes(mugAttributesJson(a));
    expect(back.finish).toBe("matte");
    expect(back.gradientColorHex).toBe("#2980b9");
    expect(back.gradientHeightPct).toBe(40);
  });

  it("order snapshot keeps the surface fields", () => {
    const snap = parseMugProductSnapshot({
      id: "7d3f8d0e-2f53-4f4e-9b8f-1d1c0f6a2b11",
      nameRo: "Cană",
      nameRu: "Кружка",
      nameEn: "Mug",
      imageUrl: null,
      bodyColorHex: "#ffffff",
      handleColorHex: "#ffffff",
      innerColorHex: null,
      finish: "metallic",
      gradientColorHex: "#27ae60",
      gradientHeightPct: 35,
    });
    expect(parseMugSurface(snap)).toEqual({ finish: "metallic", gradientColorHex: "#27ae60", gradientHeightPct: 35 });
  });
});
