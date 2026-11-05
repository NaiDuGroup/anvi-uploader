import { describe, expect, it } from "vitest";
import { contrastRatio, INK_DARK, INK_LIGHT, isHardToRead, readableInk, relativeLuminance } from "./contrast";

describe("WCAG contrast helper", () => {
  it("computes relative luminance and the contrast ratio like WCAG", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1);
    expect(relativeLuminance("#fff")).toBeCloseTo(1);
    expect(relativeLuminance("red")).toBeNull();
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastRatio("#123456", "#123456")).toBeCloseTo(1);
    expect(contrastRatio("nope", "#ffffff")).toBeNull();
  });

  it("picks white on dark / saturated covers and navy on light ones", () => {
    for (const dark of ["#000000", "#1d1d1f", "#1f3a8a", "#b3202a", "#c0392b", "#14532d", "#6b21a8"]) expect(readableInk(dark), dark).toBe(INK_LIGHT);
    for (const light of ["#ffffff", "#f5f5f0", "#f2bfcf", "#fde047", "#a7f3d0", "#cbd5e1"]) expect(readableInk(light), light).toBe(INK_DARK);
    // Whatever it picks reaches at least AA-large on any colour.
    for (let v = 0; v <= 255; v += 15) {
      const hex = `#${v.toString(16).padStart(2, "0").repeat(3)}`;
      expect(contrastRatio(readableInk(hex), hex)!).toBeGreaterThanOrEqual(3);
    }
  });

  it("flags text below 3:1", () => {
    expect(isHardToRead(INK_DARK, "#1f3a8a")).toBe(true);
    expect(isHardToRead("#5b6880", "#b3202a")).toBe(true);
    expect(isHardToRead(INK_LIGHT, "#b3202a")).toBe(false);
    expect(isHardToRead("transparent", "#000000")).toBe(false);
  });
});
