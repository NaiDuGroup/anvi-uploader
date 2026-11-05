import { describe, expect, it } from "vitest";
import { addLayer, emptyStudioDoc, type StudioDoc, type StudioImageLayer, type StudioLayer, type StudioQrLayer, type StudioShapeLayer, type StudioTextLayer } from "./document";
import { evaluateStudioQuality, studioInkFor, studioQualityBlocks, studioQualityCounts, studioQualityMessage, type StudioQualityItem } from "./quality";
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
    expect(evaluateStudioQuality(doc("mug", photo(), text({ x: 112 }), qr({ x: 163 })), mugSpecs)).toEqual([]);
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
    const items = evaluateStudioQuality(doc("mug", photo({ src: null }), text({ placeholder: true, x: 112 }), qr({ x: 163, qr: { type: "url", data: { url: "" } } })), mugSpecs);
    expect(codes(items)).toEqual(["red:photoEmpty", "yellow:textPlaceholder", "red:qrEmpty"]);
    expect(studioQualityBlocks(items)).toBe(true);
    expect(studioQualityCounts(items)).toEqual({ red: 2, yellow: 1 });
  });

  it("reports the safe zone, outside, the mug handle and the seam", () => {
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 20, y: 1 })), mugSpecs))).toEqual(["yellow:safeZone"]);
    // Across the seam = across the cut line at the wrap's end: clipped, red.
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 196 })), mugSpecs))).toEqual(["red:trim"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 155 })), mugSpecs))).toEqual(["yellow:handle"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 300 })), mugSpecs))).toEqual(["red:outside"]);
    // Notebook: no handle; a background shape over the whole area is fine.
    expect(evaluateStudioQuality(doc("notebook", shape({ w: 140, h: 214, fill: "#c9a227" }), text({ x: 40, y: 50, color: "#14213d" })), nbSpecs)).toEqual([]);
  });

  it("blocks anything entirely or partly off the printable surface (red, like the cut line)", () => {
    const blocks = (d: StudioDoc, specs = mugSpecs) => studioQualityBlocks(evaluateStudioQuality(d, specs));
    // Text dragged off the product, any side: it would not print.
    for (const o of [{ x: 300 }, { x: -80 }, { y: -40 }, { y: 140 }]) {
      const items = evaluateStudioQuality(doc("mug", text(o)), mugSpecs);
      expect(codes(items), JSON.stringify(o)).toEqual(["red:outside"]);
      expect(blocks(doc("mug", text(o))), JSON.stringify(o)).toBe(true);
    }
    expect(codes(evaluateStudioQuality(doc("notebook", text({ x: 20, y: 400 })), nbSpecs))).toEqual(["red:outside"]);
    // Half off: cut at the trimmer.
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: -20 })), mugSpecs))).toEqual(["red:trim"]);
    expect(codes(evaluateStudioQuality(doc("notebook", text({ x: 40, y: 200 })), nbSpecs))).toEqual(["red:trim"]);
    // Photos, codes and shapes too.
    expect(codes(evaluateStudioQuality(doc("mug", photo({ x: 400 })), mugSpecs))).toEqual(["red:outside"]);
    expect(codes(evaluateStudioQuality(doc("mug", qr({ x: -60 })), mugSpecs))).toEqual(["red:outside"]);
    expect(codes(evaluateStudioQuality(doc("mug", shape({ x: 300, w: 20, h: 20 })), mugSpecs))).toEqual(["red:outside"]);
    expect(codes(evaluateStudioQuality(doc("mug", shape({ shape: "heart", x: -10, y: 30, w: 20, h: 20 })), mugSpecs))).toEqual(["red:trim"]);
    // A band or background running into the bleed is the design.
    expect(evaluateStudioQuality(doc("mug", shape({ x: -2, y: 70, w: 214, h: 12 })), mugSpecs)).toEqual([]);
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
    expect(codes(evaluateStudioQuality(doc("mug", text({ color: "#ececec" })), mugSpecs))).toEqual(["red:lowContrast"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ color: "#bdbdbd" })), mugSpecs))).toEqual(["yellow:lowContrast"]);
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

  it("blocks text and codes across the cut line, warns inside the margin only", () => {
    // Mug: 210 × 96 mm, cut line 1 mm in, safe line 4 mm in. Text box 15 mm high, letters ~9 mm.
    expect(codes(evaluateStudioQuality(doc("mug", text({ y: 85 })), mugSpecs))).toEqual(["red:trim"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ y: -4 })), mugSpecs))).toEqual(["red:trim"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ y: 80 })), mugSpecs))).toEqual(["yellow:safeZone"]);
    expect(codes(evaluateStudioQuality(doc("mug", qr({ y: 67 })), mugSpecs))).toEqual(["red:trim"]);
    expect(studioQualityBlocks(evaluateStudioQuality(doc("mug", text({ y: 85 })), mugSpecs))).toBe(true);
    // The box's leading above / below the letters may sit in the margin: no warning.
    expect(evaluateStudioQuality(doc("mug", text({ y: 1.5 })), mugSpecs)).toEqual([]);
    // A small photo (logo) across the cut is clipped too.
    expect(codes(evaluateStudioQuality(doc("mug", photo({ x: 40, y: -5, w: 30, h: 30 })), mugSpecs))).toEqual(["red:trim"]);
  });

  it("lets full-bleed photos run into the bleed, warns about an edge stopping in the margin", () => {
    const pen = studioSurfaces("pen");
    let d = emptyStudioDoc("pen", pen.map(surfaceBase));
    d = addLayer(d, d.surfaces[0]!.id, photo({ x: -0.5, y: -6, w: 41, h: 27, src: { naturalW: 1600, naturalH: 1000 } }));
    expect(evaluateStudioQuality(d, pen)).toEqual([]);
    expect(evaluateStudioQuality(doc("mug", photo({ x: 0, y: 0, w: 210, h: 96, src: { naturalW: 5000, naturalH: 2300 } })), mugSpecs)).toEqual([]);
    expect(codes(evaluateStudioQuality(doc("mug", photo({ x: 2, y: 0, w: 206, h: 96, src: { naturalW: 5000, naturalH: 2300 } })), mugSpecs))).toEqual(["yellow:safeZone"]);
  });

  it("does not warn about an auto-fitted pen text that fills the safe area", () => {
    const pen = studioSurfaces("pen");
    let d = emptyStudioDoc("pen", pen.map(surfaceBase));
    // 40 × 15 mm, safe 1 mm: the box is exactly the safe area, the letters are inside it.
    d = addLayer(d, d.surfaces[0]!.id, text({ x: 1, y: 1, w: 38, h: 13, sizePt: 30, text: "Ion QA" }));
    expect(evaluateStudioQuality(d, pen)).toEqual([]);
  });

  it("uses one contrast rule for text on the background, a template band or the product", () => {
    const navyOnBg = doc("mug", text({ color: "#14213d" }));
    navyOnBg.surfaces[0]!.background = "#0f1a30";
    expect(codes(evaluateStudioQuality(navyOnBg, mugSpecs))).toEqual(["red:lowContrast"]);
    expect(codes(evaluateStudioQuality(doc("mug", shape({ fill: "#0f1a30" }), text({ color: "#14213d" })), mugSpecs))).toEqual(["red:lowContrast"]);
    expect(codes(evaluateStudioQuality(doc("mug", text({ color: "#14213d" })), mugSpecs, { productColorHex: "#0f1a30" }))).toEqual(["red:lowContrast"]);
    // Text half over a navy band: the hidden half counts.
    expect(codes(evaluateStudioQuality(doc("mug", shape({ x: 0, w: 105 }), text({ x: 80, color: "#14213d" })), mugSpecs))).toEqual(["red:lowContrast"]);
    // Gold on white (a template choice) stays fine.
    expect(evaluateStudioQuality(doc("mug", text({ color: "#c9a227" })), mugSpecs)).toEqual([]);
  });

  it("checks QR contrast against its own background or what is under it", () => {
    const red = { productColorHex: "#b3202a" };
    // Black on a red notebook without «Fundal alb»: borderline.
    expect(codes(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80, background: null })), nbSpecs, red))).toEqual(["yellow:qrContrast"]);
    // With the white background: fine.
    expect(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80 })), nbSpecs, red)).toEqual([]);
    // Black on a navy cover: unscannable.
    expect(codes(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80, background: null })), nbSpecs, { productColorHex: "#14213d" }))).toEqual(["red:qrContrast"]);
    // Inverted (white modules on black) or pale modules: warning / red.
    expect(codes(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80, color: "#ffffff", background: "#000000" })), nbSpecs))).toEqual(["yellow:qrContrast"]);
    expect(codes(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80, color: "#dddddd" })), nbSpecs))).toEqual(["red:qrContrast"]);
  });

  it("wants a clean quiet zone under a transparent QR code", () => {
    // Half on a navy band, half on white.
    const items = evaluateStudioQuality(doc("notebook", shape({ x: 0, y: 0, w: 140, h: 95 }), qr({ x: 50, y: 80, background: null })), nbSpecs);
    expect(codes(items)).toEqual(["red:qrContrast", "yellow:qrQuiet"]);
    // On a photo: unknown background.
    expect(codes(evaluateStudioQuality(doc("notebook", photo({ x: 30, y: 60, w: 80, h: 80 }), qr({ x: 50, y: 80, background: null })), nbSpecs))).toEqual(["yellow:qrQuiet"]);
    // On a uniform white band: fine.
    expect(evaluateStudioQuality(doc("notebook", shape({ x: 0, y: 60, w: 140, h: 80, fill: "#ffffff" }), qr({ x: 50, y: 80, background: null })), nbSpecs, { productColorHex: "#14213d" })).toEqual([]);
  });

  it("flags a QR code smaller than a phone can read", () => {
    expect(codes(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80, w: 7, h: 7, qr: { type: "url", data: { url: "a.md" } } })), nbSpecs))).toEqual(["red:qrSmall"]);
    expect(codes(evaluateStudioQuality(doc("notebook", qr({ x: 50, y: 80, w: 11, h: 11, qr: { type: "url", data: { url: "a.md" } } })), nbSpecs))).toEqual(["yellow:qrSmall"]);
  });

  it("flags overlaps: text on text yellow, anything over a QR code red", () => {
    expect(codes(evaluateStudioQuality(doc("mug", text({ id: "a" }), text({ id: "b", x: 90, y: 35 })), mugSpecs))).toEqual(["yellow:overlap"]);
    const covered = evaluateStudioQuality(doc("mug", qr(), text({ x: 85, y: 35 })), mugSpecs);
    expect(codes(covered)).toEqual(["red:qrCovered"]);
    expect(covered[0]!.layerId).toBe("t");
    expect(codes(evaluateStudioQuality(doc("mug", qr(), photo({ x: 100, y: 40, w: 20, h: 20 })), mugSpecs))).toEqual(["red:qrCovered"]);
    // A QR (kept after a template switch) on top of a text: the text is hidden.
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 80 }), qr({ x: 120 })), mugSpecs))).toEqual(["yellow:overlap"]);
    // …and through a transparent code the text breaks the code.
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 80 }), qr({ x: 120, background: null })), mugSpecs))).toEqual(["red:qrCovered"]);
    // Text over a photo or a band is a design choice; touching is not overlapping.
    expect(evaluateStudioQuality(doc("mug", photo(), text({ color: "#ffffff", x: 60, y: 30 })), mugSpecs)).toEqual([]);
    expect(evaluateStudioQuality(doc("mug", text({ x: 112 }), qr({ x: 163 })), mugSpecs)).toEqual([]);
    // A photo dropped over a text hides it.
    expect(codes(evaluateStudioQuality(doc("mug", text({ x: 112 }), photo({ x: 120 })), mugSpecs))).toEqual(["yellow:overlap"]);
  });

  it("picks a readable ink for a new text from what is under it", () => {
    const box = { x: 80, y: 40, w: 50, h: 10 };
    expect(studioInkFor(doc("mug").surfaces[0]!, box)).toBe("#14213d");
    expect(studioInkFor(doc("mug").surfaces[0]!, box, "#1b1b1f")).toBe("#ffffff");
    const dark = doc("mug");
    dark.surfaces[0]!.background = "#0f1a30";
    expect(studioInkFor(dark.surfaces[0]!, box)).toBe("#ffffff");
    expect(studioInkFor(doc("mug", shape({ fill: "#c9a227" })).surfaces[0]!, box, "#000000")).toBe("#14213d");
    // Over a photo nothing is known: navy.
    expect(studioInkFor(doc("mug", photo({ x: 60, y: 20 })).surfaces[0]!, box, "#000000")).toBe("#14213d");
  });

  it("has a message for every code in every language", () => {
    for (const code of ["trim", "qrContrast", "qrQuiet", "qrCovered", "overlap"] as const) {
      for (const lang of ["ro", "ru", "en"] as const) {
        const m = studioQualityMessage({ code }, lang);
        expect(m.title).not.toContain("_title");
        expect(m.fix.length).toBeGreaterThan(10);
      }
    }
  });
});

describe("text contrast over photos", () => {
  const t = (o: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
    id: "t", kind: "text", x: 80, y: 30, w: 50, h: 15, rotation: 0, text: "Ana", fontFamily: "Roboto", bold: true,
    sizePt: 24, color: "#ffffff", align: "center", lineHeight: 1.2, ...o,
  });
  const p: StudioImageLayer = {
    id: "p", kind: "image", x: 20, y: 5, w: 170, h: 86, rotation: 0,
    src: { key: "uploads/1730000000000-a.jpg", naturalW: 6000, naturalH: 3000 }, mask: "rect", crop: { zoom: 1, ox: 0, oy: 0 },
  };
  const d = (text: StudioTextLayer) => {
    let x = emptyStudioDoc("mug", studioSurfaces("mug").map(surfaceBase));
    x = addLayer(x, x.surfaces[0]!.id, p);
    return addLayer(x, x.surfaces[0]!.id, text);
  };

  it("is not checked without a photo sampler (unknown colour)", () => {
    expect(evaluateStudioQuality(d(t()), mugSpecs)).toEqual([]);
  });

  it("warns (yellow, never red) for white text on a pale photo", () => {
    const pale = () => "#fbfbf8";
    const items = evaluateStudioQuality(d(t()), mugSpecs, { photoColorAt: pale });
    expect(codes(items)).toEqual(["yellow:lowContrast"]);
    expect(studioQualityBlocks(items)).toBe(false);
  });

  it("passes white text on a dark photo and a strong outline", () => {
    expect(evaluateStudioQuality(d(t()), mugSpecs, { photoColorAt: () => "#1d2a44" })).toEqual([]);
    expect(evaluateStudioQuality(d(t({ stroke: { color: "#14213d", widthMm: 0.4 } })), mugSpecs, { photoColorAt: () => "#fbfbf8" })).toEqual([]);
  });

  it("keeps the known background first: a band over the photo decides", () => {
    let x = d(t());
    x = { ...x, surfaces: [{ ...x.surfaces[0]!, layers: [x.surfaces[0]!.layers[0]!, shape({ id: "band", x: 20, y: 25, w: 170, h: 30 }), x.surfaces[0]!.layers[1]!] }] };
    expect(evaluateStudioQuality(x, mugSpecs, { photoColorAt: () => "#ffffff" })).toEqual([]);
  });
});
