import { describe, expect, it } from "vitest";
import { contrastRatio } from "./contrast";
import { brandPaletteFromColors, darkInk, extractLogoColors, isNeonRgb } from "./palette";

/** RGBA pixels: `n` of each colour (alpha 255), plus transparent ones. */
function pixels(parts: [string, number][], transparent = 0): Uint8ClampedArray {
  const out: number[] = [];
  for (const [hex, n] of parts) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    for (let i = 0; i < n; i++) out.push(r!, g!, b!, 255);
  }
  for (let i = 0; i < transparent; i++) out.push(0, 0, 0, 0);
  return new Uint8ClampedArray(out);
}

describe("logo palette", () => {
  it("finds the logo's colours, most frequent first, without white, transparency or anti-aliasing specks", () => {
    const px = pixels([["#ffffff", 500], ["#b5532f", 300], ["#f2c14e", 120], ["#d48a3e", 3]], 400);
    expect(extractLogoColors(px)).toEqual(["#b5532f", "#f2c14e"]);
    expect(extractLogoColors(pixels([["#ffffff", 50]], 10))).toEqual([]);
  });

  it("main colour, a second one, and a dark ink that reads on white", () => {
    const p = brandPaletteFromColors(["#b5532f", "#f2c14e"])!;
    expect(p.brandColor1).toBe("#b5532f");
    expect(p.brandColor2).toBe("#f2c14e");
    expect(contrastRatio(p.brandColor3, "#ffffff")).toBeGreaterThanOrEqual(7);
    // One colour: the second is a shade of it.
    const one = brandPaletteFromColors(["#1d5fa8"])!;
    expect(one.brandColor2).not.toBe(one.brandColor1);
    // A black logo: its black as band and ink, gold accent.
    expect(brandPaletteFromColors(["#111111"])).toEqual({ brandColor1: "#111111", brandColor2: "#c9a227", brandColor3: "#111111" });
    expect(brandPaletteFromColors([])).toBeNull();
    expect(contrastRatio(darkInk("#f5d90a"), "#ffffff")).toBeGreaterThanOrEqual(7);
  });

  it("flags screen neon greens and blues, not process cyan or warm colours", () => {
    for (const c of ["#00ff00", "#39ff14", "#0000ff", "#1f3dff"]) expect(isNeonRgb(c), c).toBe(true);
    for (const c of ["#00aeef", "#00a3e0", "#ff00ff", "#ff6600", "#d7263d", "#1d5fa8", "#1f6b3a", "#ffffff", "#000000"]) expect(isNeonRgb(c), c).toBe(false);
  });
});
