import { describe, expect, it } from "vitest";
import { clampLayerToArea, sideBounds, type ImageLayer, type TextLayer } from "./tshirtLayers";
import { printAreaForSizes } from "./tshirtRules";

const AREA = { maxWidthCm: 30, maxHeightCm: 42 };

const measure = (line: string, fontPx: number) => line.length * fontPx * 0.6;
const img = (p: Partial<ImageLayer>): ImageLayer => ({
  id: "i", kind: "image", cx: 15, cy: 21, rotation: 0, src: "", fileName: "a.png", naturalW: 3000, naturalH: 3000, widthCm: 10, ...p,
});

describe("clampLayerToArea (30 × 42 cm)", () => {
  it("pushes a dragged layer back inside", () => {
    const l = clampLayerToArea(img({ cx: -20, cy: 80 }), AREA, measure);
    expect(l.cx).toBe(5);
    expect(l.cy).toBe(37);
  });

  it("shrinks a layer bigger than the area", () => {
    const l = clampLayerToArea(img({ widthCm: 40 }), AREA, measure);
    expect(l.widthCm).toBe(30);
    expect(sideBounds(AREA, [l], measure)?.outside).toBe(false);
  });

  it("accounts for rotation", () => {
    const l = clampLayerToArea(img({ widthCm: 28, rotation: 45 }), AREA, measure);
    expect(sideBounds(AREA, [l], measure)?.outside).toBe(false);
  });

  it("shrinks text that got too wide", () => {
    const t: TextLayer = { id: "t", kind: "text", cx: 15, cy: 5, rotation: 0, text: "A very very long line", fontId: "roboto", color: "#000", sizeCm: 6, bold: false };
    const l = clampLayerToArea(t, AREA, measure);
    expect(l.sizeCm).toBeLessThan(6);
    expect(sideBounds(AREA, [l], measure)?.outside).toBe(false);
  });

  it("leaves a layer that fits untouched", () => {
    const l = img({});
    expect(clampLayerToArea(l, AREA, measure)).toBe(l);
  });
});

describe("print areas (the design on M, every ordered size)", () => {
  it("M alone: M's own largest print", () => {
    expect(printAreaForSizes("front", [])).toEqual({ maxWidthCm: 28, maxHeightCm: 39.5 });
    expect(printAreaForSizes("front", ["M"])).toEqual({ maxWidthCm: 28, maxHeightCm: 39.5 });
  });
  it("only XXL: 30 × 42 or 42 × 30 on the XXL (÷ 119 % on M)", async () => {
    const { sizePrintArea } = await import("./tshirtRules");
    const a = printAreaForSizes("front", ["XXL"]);
    expect(a.frames).toEqual([
      { w: 25.1, h: 35.2 },
      { w: 35.2, h: 25.1 },
    ]);
    expect(sizePrintArea("front", "2XL").frames).toEqual([
      { w: 30, h: 42 },
      { w: 42, h: 30 },
    ]);
  });
  it("several sizes: as big as the largest ordered size takes (Canva-style resize)", async () => {
    const { fitsTshirtArea } = await import("./tshirtRules");
    const a = printAreaForSizes("front", ["M", "XXL"]);
    expect(fitsTshirtArea(a, 28, 39.5)).toBe(true);
    expect(fitsTshirtArea(a, 35, 25)).toBe(true);
    expect(fitsTshirtArea(a, 36, 25)).toBe(false);
  });
  it("M + XXL, a wide design: XXL prints it ~42 × 30, M gets it shrunk to its own 28 cm", async () => {
    const { layersForOrderSize, layersBounds } = await import("./tshirtRegion");
    const { sizePrintArea, fitsTshirtArea } = await import("./tshirtRules");
    const wide = [img({ cx: 0, cy: 22, widthCm: 35.2, naturalW: 4200, naturalH: 3000 })];
    const xxl = layersForOrderSize(wide, "front", "XXL", measure);
    const bx = layersBounds(xxl.layers, measure)!;
    expect(xxl.shrunk).toBe(false);
    expect(bx.w).toBeCloseTo(35.2 * 62 / 52, 1);
    expect(fitsTshirtArea(sizePrintArea("front", "XXL"), Math.ceil(bx.w * 10) / 10, Math.ceil(bx.h * 10) / 10)).toBe(true);
    const m = layersForOrderSize(wide, "front", "M", measure);
    const bm = layersBounds(m.layers, measure)!;
    const top = layersBounds(wide, measure)!.y;
    expect(m.shrunk).toBe(true);
    expect(bm.w).toBeLessThanOrEqual(28);
    expect(bm.w).toBeGreaterThan(27.5);
    expect(bm.y).toBeCloseTo(top, 5);
    expect(bm.x + bm.w / 2).toBeCloseTo(0, 5);
  });
  it("sleeves: 9 × 9 on XS, 9.5 on S, 10 × 10 from M", async () => {
    const { sizePrintArea } = await import("./tshirtRules");
    expect(sizePrintArea("sleeve_left", "XS", 10)).toEqual({ maxWidthCm: 9, maxHeightCm: 9 });
    expect(sizePrintArea("sleeve_right", "S", 10)).toEqual({ maxWidthCm: 9.5, maxHeightCm: 9.5 });
    expect(sizePrintArea("sleeve_left", "XL", 10)).toEqual({ maxWidthCm: 10, maxHeightCm: 10 });
  });
});

describe("one design (M = 100 %) on every size", () => {
  it("scales by the DOGO chest against M (52 cm)", async () => {
    const { sizeRatio, garmentCm } = await import("./tshirtRules");
    expect(garmentCm("M")).toEqual({ chest: 52, length: 71 });
    expect(sizeRatio("M")).toBe(1);
    expect(sizeRatio("S")).toBeCloseTo(49 / 52, 5);
    expect(sizeRatio("2XL")).toBeCloseTo(62 / 52, 5);
  });
  it("on each size the print starts at that size's distance from the collar, scaled with it", async () => {
    const { layersForSize, layersFromSize } = await import("./tshirtLayers");
    const { layersBounds } = await import("./tshirtRegion");
    const measure = (line: string, fontPx: number) => line.length * fontPx * 0.6;
    // On M a 20 cm wide picture starting at the standard 15 cm under the HPS (9.5 collar + 5.5).
    const m = [img({ cx: 0, cy: 15 + 10, widthCm: 20, naturalW: 3000, naturalH: 3000 })];
    const xl = layersForSize(m, "front", "XL");
    const b = layersBounds(xl, measure)!;
    expect(b.w).toBeCloseTo(20 * (58 / 52), 2);
    // XL: collar 10.5 + 7 = 17.5 under the HPS
    expect(b.y).toBeCloseTo(17.5, 2);
    const back = layersFromSize(xl, "front", "XL");
    expect(back[0]!.cy).toBeCloseTo(25, 2);
    expect((back[0] as ImageLayer).widthCm).toBeCloseTo(20, 2);
  });
});
