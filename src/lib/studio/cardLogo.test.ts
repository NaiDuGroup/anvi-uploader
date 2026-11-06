import { describe, expect, it } from "vitest";
import { buildCardDoc } from "./cardBuild";
import { nodeMeasure } from "./cardTestKit";
import type { StudioDoc, StudioImageLayer, StudioShapeLayer } from "./document";
import { STUDIO_SAMPLE_SHAPE } from "./document";
import { brandPaletteFromColors, colorDistance, hexHsl, logoLook } from "./palette";
import { layerSkipped } from "./render";
import type { StudioFields } from "./smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, studioSurfaces } from "./surfaces";
import { studioTemplateById } from "./templates";

const specs = studioSurfaces("card");
const FIELDS: StudioFields = { name: "Ana Ciobanu", title: "Director", company: "Dor de Cafea", phone: "+373 69 123 456" };
const ORANGE = "#e8772e";

const build = (front: string, back: string | null, fields: StudioFields, look: Parameters<typeof buildCardDoc>[0]["logo"] = null): StudioDoc =>
  buildCardDoc({ front: studioTemplateById(front)!, back: back ? studioTemplateById(back) : null, fields, lang: "ro", specs, measure: nodeMeasure, logo: look });
const layersOf = (doc: StudioDoc, side = CARD_FRONT_ID) => doc.surfaces.find((s) => s.id === side)!.layers;
const logoOf = (doc: StudioDoc, side = CARD_FRONT_ID) => layersOf(doc, side).find((l): l is StudioImageLayer => l.kind === "image" && l.bind === "logo")!;
const plates = (doc: StudioDoc, side = CARD_FRONT_ID) => layersOf(doc, side).filter((l): l is StudioShapeLayer => l.kind === "shape" && l.name === "logo-plate");

/** RGBA of a w × h picture: `inside(x, y)` → colour, else transparent / a background. */
function picture(w: number, h: number, inside: (x: number, y: number) => string | null): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const c = inside(x, y);
      if (!c) continue;
      const i = (y * w + x) * 4;
      out.set([parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 255], i);
    }
  return out;
}

describe("business-card logo on the card", () => {
  it("a wide logo is shown whole (fitted into its spot, kept to the spot's side), not cropped", () => {
    const fields: StudioFields = { ...FIELDS, logo: { localId: "w", naturalW: 800, naturalH: 200 } };
    const doc = build("card-minimal", null, fields);
    // The template's spot: [0.72, 0.17, 0.21, 0.34] of the 94 × 54 mm file.
    const spot = { x: 0.72 * 94, w: 0.21 * 94 };
    const l = logoOf(doc);
    expect(l.w / l.h).toBeCloseTo(4, 1);
    expect(l.w).toBeCloseTo(spot.w, 2);
    // The spot sits top right: the logo keeps to its right edge.
    expect(l.x + l.w).toBeCloseTo(spot.x + spot.w, 2);
  });

  it("a logo in its own colour on a band of that colour gets a white plate; on white or for a white logo none", () => {
    const look = logoLook(picture(40, 40, (x, y) => ((x - 20) ** 2 + (y - 20) ** 2 < 361 ? ORANGE : null)), 40, 40);
    expect(look.colors[0] && colorDistance(look.colors[0], ORANGE)).toBeLessThan(10);
    expect(look.ownBackground).toBe(false);
    const fields: StudioFields = { ...FIELDS, ...brandPaletteFromColors(look.colors)!, logo: { localId: "o", naturalW: 40, naturalH: 40 } };
    // Corporate: the logo on the brand band → plate under it, the same box plus a margin.
    const doc = build("card-corporate", "card-back-qr", fields, look);
    const [plate] = plates(doc);
    const l = logoOf(doc);
    expect(plate).toBeTruthy();
    expect(plate!.fill).toBe("#ffffff");
    expect(plate!.x).toBeLessThan(l.x);
    expect(plate!.x + plate!.w).toBeGreaterThan(l.x + l.w);
    expect(layersOf(doc).indexOf(plate!)).toBe(layersOf(doc).indexOf(l) - 1);
    // Minimal: the logo on white → no plate.
    expect(plates(build("card-minimal", null, fields, look))).toEqual([]);
    // A white logo (no colours) on the band → no plate (it shows on the colour); on white → a dark plate in the deep ink.
    expect(plates(build("card-corporate", null, fields, { colors: [], ownBackground: false }))).toEqual([]);
    const [dark] = plates(build("card-minimal", null, fields, { colors: [], ownBackground: false }));
    expect(dark?.fill).toBe(fields.brandColor3);
    // A logo on its own white rectangle (a JPG) on a band → plate, whatever its colours.
    const jpg = logoLook(picture(40, 40, (x, y) => (x > 10 && x < 30 && y > 10 && y < 30 ? "#1d4e89" : "#ffffff")), 40, 40);
    expect(jpg.ownBackground).toBe(true);
    expect(plates(build("card-corporate", null, fields, jpg)).length).toBe(1);
    // Unknown logo (not read yet): nothing changes.
    expect(plates(build("card-corporate", null, fields, null))).toEqual([]);
  });
});

describe("business-card colours from a one-colour logo", () => {
  it("the accent is a lighter shade of a mid colour and the deep ink is darker than a dark one", () => {
    const orange = brandPaletteFromColors([ORANGE])!;
    expect(hexHsl(orange.brandColor2).l).toBeGreaterThan(hexHsl(ORANGE).l);
    const navy = brandPaletteFromColors(["#1d4e89"])!;
    expect(hexHsl(navy.brandColor3).l).toBeLessThan(hexHsl("#1d4e89").l * 0.7);
    expect(colorDistance(navy.brandColor3, navy.brandColor1)).toBeGreaterThan(30);
  });

  it("dark grounds (Noir, dark corporate, pattern back, map panel) take the deep ink, not the logo colour", () => {
    const fields: StudioFields = { ...FIELDS, ...brandPaletteFromColors([ORANGE])! };
    for (const [front, back] of [
      ["card-elegant-noir", "card-back-pattern"],
      ["card-corporate-dark", "card-back-map"],
    ] as const) {
      const doc = build(front, back, fields);
      const bigFront = layersOf(doc).find((l): l is StudioShapeLayer => l.kind === "shape" && l.w > 80 && l.h > 40)!;
      expect(bigFront.fill, front).toBe(fields.brandColor3);
      expect(layersOf(doc, CARD_BACK_ID).some((l) => l.kind === "shape" && l.fill === fields.brandColor3 && l.w > 80), back).toBe(true);
    }
  });

  it("the photo templates' «photo here» hint is on screen only, never in the print file", () => {
    const doc = build("card-photo-split", null, FIELDS);
    const hints = layersOf(doc).filter((l) => l.kind === "shape" && l.name === STUDIO_SAMPLE_SHAPE);
    expect(hints.length).toBeGreaterThan(0);
    for (const h of hints) {
      expect(layerSkipped(h, { skipSamples: true })).toBe(true);
      expect(layerSkipped(h, {})).toBe(false);
    }
  });
});
