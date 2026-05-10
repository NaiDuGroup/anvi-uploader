import { describe, expect, it } from "vitest";
import {
  BG_COLOR_OPTIONS,
  PALETTE_MIN_DISTANCE,
  TEXT_COLOR_OPTIONS,
  TRANSPARENT_BACKGROUND,
  colorDistance,
  filterPaletteByBase,
  hexToRgb,
  isTooCloseToBase,
} from "./editorPalette";

describe("editorPalette.hexToRgb", () => {
  it("parses 6-digit hex with and without leading #", () => {
    expect(hexToRgb("#FF0000")).toEqual({ r: 255, g: 0, b: 0 });
    expect(hexToRgb("00ff00")).toEqual({ r: 0, g: 255, b: 0 });
  });

  it("expands the 3-digit shorthand", () => {
    expect(hexToRgb("#abc")).toEqual({ r: 170, g: 187, b: 204 });
  });

  it("returns null for sentinels and malformed input", () => {
    expect(hexToRgb(TRANSPARENT_BACKGROUND)).toBeNull();
    expect(hexToRgb("")).toBeNull();
    expect(hexToRgb("#zzzzzz")).toBeNull();
    expect(hexToRgb("#12345")).toBeNull();
  });
});

describe("editorPalette.colorDistance", () => {
  it("returns 0 for identical colours", () => {
    expect(colorDistance("#123456", "#123456")).toBe(0);
  });

  it("returns +Infinity when either side is unparseable (transparent etc.)", () => {
    expect(colorDistance(TRANSPARENT_BACKGROUND, "#000000")).toBe(
      Number.POSITIVE_INFINITY,
    );
  });

  it("ranks black ↔ white as the maximum perceptual distance", () => {
    const blackWhite = colorDistance("#000000", "#FFFFFF");
    const whiteCream = colorDistance("#FFFFFF", "#f5f5f0");
    expect(blackWhite).toBeGreaterThan(whiteCream);
  });
});

describe("editorPalette.isTooCloseToBase", () => {
  it("returns false when no base colour is provided (Other SKUs)", () => {
    expect(isTooCloseToBase("#FFFFFF", null)).toBe(false);
    expect(isTooCloseToBase("#000000", undefined)).toBe(false);
  });

  it("never filters the transparent sentinel", () => {
    expect(isTooCloseToBase(TRANSPARENT_BACKGROUND, "#FFFFFF")).toBe(false);
    expect(isTooCloseToBase(TRANSPARENT_BACKGROUND, "#000000")).toBe(false);
  });

  it("hides white and near-white swatches against a cream mug body", () => {
    const cream = "#f5f5f0";
    expect(isTooCloseToBase("#FFFFFF", cream)).toBe(true);
    expect(isTooCloseToBase("#F3F4F6", cream)).toBe(true);
    expect(isTooCloseToBase("#FEF3C7", cream)).toBe(false);
    expect(isTooCloseToBase("#000000", cream)).toBe(false);
  });

  it("hides black against a black mug body but keeps everything else", () => {
    const base = "#000000";
    expect(isTooCloseToBase("#000000", base)).toBe(true);
    expect(isTooCloseToBase("#FFFFFF", base)).toBe(false);
    expect(isTooCloseToBase("#DC2626", base)).toBe(false);
  });

  it("hides red against a red notebook cover", () => {
    const cover = "#DC2626";
    expect(isTooCloseToBase("#DC2626", cover)).toBe(true);
  });
});

describe("editorPalette.filterPaletteByBase", () => {
  it("returns the same list when base is missing", () => {
    expect(filterPaletteByBase(BG_COLOR_OPTIONS, null)).toEqual(BG_COLOR_OPTIONS);
  });

  it("removes white from a white mug palette but keeps transparent", () => {
    const cream = "#f5f5f0";
    const filtered = filterPaletteByBase(BG_COLOR_OPTIONS, cream);
    expect(filtered).toContain(TRANSPARENT_BACKGROUND);
    expect(filtered).not.toContain("#FFFFFF");
    expect(filtered).toContain("#FEF3C7");
  });

  it("never strips the entire text palette", () => {
    for (const base of [
      "#000000",
      "#FFFFFF",
      "#DC2626",
      "#2563EB",
      "#16A34A",
      "#9333EA",
      "#EC4899",
      "#B8860B",
    ]) {
      const remaining = filterPaletteByBase(TEXT_COLOR_OPTIONS, base);
      expect(remaining.length).toBeGreaterThan(0);
    }
  });

  it("respects a custom minDistance", () => {
    const cream = "#f5f5f0";
    const aggressive = filterPaletteByBase(BG_COLOR_OPTIONS, cream, 200);
    expect(aggressive.length).toBeLessThan(BG_COLOR_OPTIONS.length);
  });
});

describe("editorPalette.PALETTE_MIN_DISTANCE", () => {
  it("is a positive finite number", () => {
    expect(Number.isFinite(PALETTE_MIN_DISTANCE)).toBe(true);
    expect(PALETTE_MIN_DISTANCE).toBeGreaterThan(0);
  });
});
