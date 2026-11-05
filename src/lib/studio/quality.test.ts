import { describe, expect, it } from "vitest";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageLayer, type StudioLayer, type StudioQrLayer, type StudioShapeLayer, type StudioTextLayer } from "./document";
import { evaluateStudioQuality, studioQualityBlocks, studioQualityCounts, studioQualityMessage, type StudioQualityItem } from "./quality";
import { studioSurfaces, surfaceBase } from "./surfaces";

const mugSpecs = studioSurfaces("mug");
const nbSpecs = studioSurfaces("notebook");

const text = (o: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
  id: "t", kind: "text", x: 80, y: 30, w: 50, h: 15, rotation: 0, text: "Ana", fontFamily: "Roboto", bold: true,
  sizePt: 24, color: "#14213d", align: "center", lineHeight: 1.2, ...o,
});
const photo = (o: Partial<StudioImageLayer> = {}): StudioImageLayer => ({
  id: "p", kind: "image", x: 60, y: 20, w: 50, h: 50, rotation: 0,
  src: { key: "uploads/1730000000000-a.jpg", naturalW: 3000, naturalH: 3000 }, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 }, ...o,
});
const qr = (o: Partial<StudioQrLayer> = {}): StudioQrLayer => ({
  id: "q", kind: "qr", x: 90, y: 30, w: 30, h: 30, rotation: 0, qr: { type: "url", data: { url: "anvi.md" } },
  color: "#000000", background: "#ffffff", ...o,
});
const shape = (o: Partial<StudioShapeLayer> = {}): StudioShapeLayer => ({
  id: "s", kind: "shape", shape: "rect", x: 0, y: 0, w: 210, h: 96, rotation: 0, fill: "#14213d", ...o,
});

function doc(kind: "mug" | "notebook", ...layers: StudioLayer[]): StudioDoc {
  let d = emptyStudioDoc(kind, studioSurfaces(kind).map(surfaceBase));
  for (const l of layers) d = addLayer(d, d.surfaces[0]!.id, l);
  return d;
}
const codes = (items: StudioQualityItem[]) => items.map((i) => `${i.level}:${i.code}`);

describe("studio quality rules", () => {
  it("passes a clean design", () => {
    expect(evaluateStudioQuality(doc("mug", photo(), text({ x: 120 }), qr({ x: 150 })), mugSpecs)).toEqual([]);
  });

  it("checks photo dpi against the product norm", () => {
    // 3000 px over 50 mm ≈ 1524 dpi; zoom 4 → 381; 1000 px → 508 / 254 (yellow) / 127 (red)
    expect(evaluateStudioQuality(doc("mug", photo({ src: { naturalW: 200, naturalH: 200 } })), mugSpecs).map((i) => i.level)).toEqual(["red"]);
    const y = evaluateStudioQuality(doc("mug", photo({ src: { naturalW: 400, naturalH: 400 }, w: 50, h: 50, crop: { zoom: 1, ox: 0, oy: 0 } })), mugSpecs);
    expect(codes(y)).toEqual(["yellow:photoDpi"]);
    expect(y[0]!.vars!.dpi).toBe(203);
    expect(evaluateStudioQuality(doc("mug", photo()), mugSpecs)).toEqual([]);
  });

  it("flags empty placeholders, sample text and empty QR", () => {
    const items = evaluateStudioQuality(doc("mug", photo({ src: null }), text({ placeholder: true, x: 120 }), qr({ x: 150, qr: { type: "url", data: { url: "" } } })), mugSpecs);
    expect(codes(items)).toEqual(["red:photoEmpty", "yellow:textPlaceholder", "red:qrEmpty"]);
    expect(studioQualityBlocks(items)).toBe(true);
    expect(studioQualityCounts(items)).toEqual({ red: 2, yellow: 1 });
  });

  it("reports the safe zone, outside, the mug handle and the seam", () => {
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 20, y: 1 })), mugSpecs))).toEqual(["yellow:safeZone"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 196 })), mugSpecs))).toEqual(["yellow:seam"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 155 })), mugSpecs))).toEqual(["yellow:handle"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 300 })), mugSpecs))).toEqual(["yellow:outside"]);
    // Notebook: no handle; a background shape over the whole area is fine.
    expect(evaluateStudioQuality(doc("notebook", shape({ w: 140, h: 214, fill: "#c9a227" }), text({ x: 40, y: 50, color: "#14213d" })), nbSpecs)).toEqual([]);
  });

  it("flags tiny text and a hairline outline", () => {
    expect(codes(evaluateStudioQuality(doc("mug", text({ sizePt: 4 })), mugSpecs))).toEqual(["red:textTiny"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ sizePt: 6 })), mugSpecs))).toEqual(["yellow:textTiny"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ stroke: { color: "#c9a227", widthMm: 0.05 } })), mugSpecs))).toEqual(["yellow:outlineThin"]);
  });

  it("flags a QR code too small to scan", () => {
    expect(codes(evaluateStudioQuality(doc("mug", qr({ w: 5, h: 5 })), mugSpecs))).toEqual(["red:qrSmall"]);
    expect(codes(evaluateStudioQuality(doc("mug", qr({ w: 9, h: 9 })), mugSpecs))).toEqual(["yellow:qrSmall"]);
  });

  it("flags white on white against the product, the background and shapes underneath", () => {
    expect(codes(evaluateStudioQuality(doc("mug", text({ color: "#ffffff" })), mugSpecs))).toEqual(["red:lowContrast"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ color: "#ececec" })), mugSpecs))).toEqual(["yellow:lowContrast"]);
    // Black mug: white text is fine, black text is not.
    expect(evaluateStudioQuality(doc("mug", text({ color: "#ffffff" })), mugSpecs, { productColorHex: "#1d1d1f" })).toEqual([]);
    // Navy band under white text: fine; navy text on it: red.
    expect(evaluateStudioQuality(doc("mug", shape(), text({ color: "#ffffff" })), mugSpecs)).toEqual([]);
    expect(codes(evaluateStudioQuality(doc("mug", shape(), text({ color: "#14213d" })), mugSpecs))).toEqual(["red:lowContrast"]);
    // A strong outline keeps it readable; text over a photo is not judged.
    expect(evaluateStudioQuality(doc("mug", text({ color: "#ffffff", stroke: { color: "#000000", widthMm: 0.4 } })), mugSpecs)).toEqual([]);
    expect(evaluateStudioQuality(doc("mug", photo(), text({ color: "#ffffff", x: 60, y: 30 })), mugSpecs)).toEqual([]);
    // White shape on a white mug.
    expect(codes(evaluateStudioQuality(doc("mug", shape({ fill: "#fefefe", x: 60, w: 40, h: 40, y: 20 })), mugSpecs))).toEqual(["yellow:lowContrast"]);
  });

  it("ignores hidden layers and empty texts (only «the design is empty» remains)", () => {
    const items = evaluateStudioQuality(doc("mug", photo({ src: null, hidden: true }), text({ text: " ", color: "#ffffff" })), mugSpecs);
    expect(items.map((i) => [i.code, i.level])).toEqual([["designEmpty", "red"]]);
    expect(studioQualityBlocks(items)).toBe(true);
  });

  it("blocks an empty design and lets any printable content through", () => {
    expect(evaluateStudioQuality(doc("mug"), mugSpecs).map((i) => i.code)).toEqual(["designEmpty"]);
    expect(evaluateStudioQuality(doc("mug", text({ text: "Ana" })), mugSpecs).some((i) => i.code === "designEmpty")).toBe(false);
  });

  it("has plain-language messages in ro, ru and en", () => {
    for (const lang of ["ro", "ru", "en"] as const) {
      const m = studioQualityMessage({ code: "photoDpi", vars: { dpi: 120, norm: 300 } }, lang);
      expect(m.title.length).toBeGreaterThan(5);
      expect(m.fix).toContain("120");
    }
  });
});
