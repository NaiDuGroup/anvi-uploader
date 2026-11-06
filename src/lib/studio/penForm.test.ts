import { describe, expect, it } from "vitest";
import { emptyStudioDoc, layerBounds, ptToMm, type StudioTextLayer } from "./document";
import { evaluateStudioQuality } from "./quality";
import { studioSurfaces, surfaceBase } from "./surfaces";
import { TEXT_PAD, fitDocTexts, textInkBox } from "./textFit";
import {
  PEN_FORM_EMPTY,
  PEN_FORM_IDS,
  PEN_MIN_TEXT_PT,
  isPenFormDoc,
  penFormDoc,
  penFormLayout,
  penFormSignature,
  readPenForm,
  type PenFormState,
} from "./penForm";

/** Stub measure: 0.6 em per character + the renderer's padding; box height = 1.2 em + padding. */
const measure = (l: StudioTextLayer) => {
  const s = ptToMm(l.sizePt);
  return { w: l.text.length * 0.6 * s + 2 * TEXT_PAD * s, h: s * l.lineHeight + 2 * TEXT_PAD * s };
};

// The local / prod Ardenes pen: 50 × 6 mm print area.
const [pen] = studioSurfaces("pen", { widthCm: 5, heightCm: 0.6, dpi: 300 });
// Default pen print area (40 × 15 mm).
const [tall] = studioSurfaces("pen");
const st = (o: Partial<PenFormState>): PenFormState => ({ ...PEN_FORM_EMPTY, ...o });
const logo = (w: number, h: number) => ({ localId: "img_1", naturalW: w, naturalH: h });

function inside(area: typeof pen, layers: ReturnType<typeof penFormLayout>["layers"]) {
  for (const l of layers) {
    const b = l.kind === "text" ? textInkBox(l) : layerBounds(l);
    expect(b.x).toBeGreaterThanOrEqual(area!.safeMm - 1e-6);
    expect(b.y).toBeGreaterThanOrEqual(area!.safeMm - 1e-6);
    expect(b.x + b.w).toBeLessThanOrEqual(area!.widthMm - area!.safeMm + 1e-6);
    expect(b.y + b.h).toBeLessThanOrEqual(area!.heightMm - area!.safeMm + 1e-6);
  }
}

describe("penFormLayout", () => {
  it("one short name: as big as the usable height allows, centred, inside the safe zone", () => {
    const r = penFormLayout(pen!, st({ line1: "Ana" }), "#ffffff", measure);
    expect(r.layers).toHaveLength(1);
    const t = r.layers[0] as StudioTextLayer;
    // 6 mm − 2 × 1 mm safe = 4 mm of ink = 1.08 em → 3.7 mm ≈ 10.4 pt.
    expect(t.sizePt).toBeGreaterThan(10);
    expect(t.sizePt).toBeLessThan(10.6);
    expect(t.color).toBe("#ffffff");
    const ink = textInkBox(t);
    expect(ink.x + ink.w / 2).toBeCloseTo(25, 1);
    expect(r.warnings).toEqual([]);
    inside(pen!, r.layers);
  });

  it("a long line shrinks to the width and never overflows; below 7 pt it warns", () => {
    const r = penFormLayout(pen!, st({ line1: "Societatea cu Răspundere Limitată Exemplu Grup Internațional" }), "#14213d", measure);
    inside(pen!, r.layers);
    expect(r.minPt!).toBeLessThan(PEN_MIN_TEXT_PT);
    expect(r.warnings[0]).toMatchObject({ code: "textSmall" });
  });

  it("two lines on a 6 mm pen go side by side (stacked would be below 7 pt)", () => {
    const r = penFormLayout(pen!, st({ line1: "Ana Popescu", line2: "069 123 456" }), "#14213d", measure);
    expect(r.warnings.map((w) => w.code)).toContain("inline");
    const [a, b] = r.layers as StudioTextLayer[];
    expect(a!.sizePt).toBe(b!.sizePt);
    expect(textInkBox(b!).x).toBeGreaterThan(textInkBox(a!).x + textInkBox(a!).w);
    inside(pen!, r.layers);
  });

  it("two lines on a 15 mm area stack, line 2 smaller", () => {
    const r = penFormLayout(tall!, st({ line1: "Ana Popescu", line2: "069 123 456" }), "#14213d", measure);
    expect(r.warnings.map((w) => w.code)).not.toContain("inline");
    const [a, b] = r.layers as StudioTextLayer[];
    expect(b!.sizePt).toBeLessThan(a!.sizePt);
    expect(textInkBox(b!).y).toBeGreaterThan(textInkBox(a!).y + textInkBox(a!).h - 1e-6);
    inside(tall!, r.layers);
  });

  it("alignment moves the group to the left / right safe edge", () => {
    const left = penFormLayout(pen!, st({ line1: "Ana", align: "left" }), "#000000", measure).layers[0] as StudioTextLayer;
    const right = penFormLayout(pen!, st({ line1: "Ana", align: "right" }), "#000000", measure).layers[0] as StudioTextLayer;
    expect(textInkBox(left).x).toBeCloseTo(1, 5);
    expect(textInkBox(right).x + textInkBox(right).w).toBeCloseTo(49, 5);
    expect(left.align).toBe("left");
  });

  it("logo: full usable height, aspect kept, text beside it; on a 6 mm pen explains the short zone", () => {
    const r = penFormLayout(pen!, st({ line1: "ANVI", logo: logo(400, 400) }), "#000000", measure);
    const img = r.layers.find((l) => l.id === PEN_FORM_IDS.logo)!;
    expect(img.h).toBeCloseTo(4, 5);
    expect(img.w).toBeCloseTo(4, 5);
    const t = r.layers.find((l) => l.kind === "text") as StudioTextLayer;
    expect(textInkBox(t).x).toBeGreaterThanOrEqual(img.x + img.w);
    expect(r.warnings.map((w) => w.code)).toEqual(["zoneShort"]);
    inside(pen!, r.layers);
  });

  it("a very wide logo gets too low: logoSmall", () => {
    const r = penFormLayout(tall!, st({ line1: "ANVI", logo: logo(1000, 100) }), "#000000", measure);
    expect(r.warnings).toContainEqual(expect.objectContaining({ code: "logoSmall" }));
    expect(r.logoMm!).toBeLessThan(6 * 0.75);
    const ok = penFormLayout(tall!, st({ logo: logo(300, 200) }), "#000000", measure);
    expect(ok.warnings).toEqual([]);
    expect(ok.logoMm!).toBeCloseTo(13, 5);
  });

  it("the document it makes passes the quality check (no red, no safe-zone / tiny-text items) and has no printed background", () => {
    const specs = studioSurfaces("pen", { widthCm: 5, heightCm: 0.6, dpi: 300 });
    const base = emptyStudioDoc("pen", specs.map(surfaceBase));
    const d = penFormDoc({ ...base, surfaces: [{ ...base.surfaces[0]!, background: "#fffdf5" }] }, penFormLayout(pen!, st({ line1: "Ana Popescu" }), "#ffffff", measure));
    expect(d.surfaces[0]!.background).toBeNull();
    const items = evaluateStudioQuality(d, specs, { productColorHex: "#1f3a93" });
    expect(items.filter((i) => i.level === "red")).toEqual([]);
    expect(items.map((i) => i.code)).not.toContain("safeZone");
    expect(items.map((i) => i.code)).not.toContain("textTiny");
  });

  it("reads the form back from its document; other docs are not form docs", () => {
    const base = emptyStudioDoc("pen", [surfaceBase(pen!)]);
    const s = st({ line1: "Ana", line2: "Popescu", font: "Merriweather", align: "left", logo: logo(10, 10) });
    const d = penFormDoc(base, penFormLayout(pen!, s, "#000000", measure));
    expect(readPenForm(d)).toEqual(s);
    expect(isPenFormDoc(d)).toBe(true);
    expect(isPenFormDoc(base)).toBe(true);
    expect(readPenForm(base)).toBeNull();
    const extra = { ...d, surfaces: [{ ...d.surfaces[0]!, layers: [...d.surfaces[0]!.layers, { ...d.surfaces[0]!.layers[1]!, id: "x" }] }] };
    expect(isPenFormDoc(extra)).toBe(false);
    expect(penFormSignature(extra)).not.toBe(penFormSignature(d));
  });
});

describe("pen form ↔ editor re-measure", () => {
  it("the editor's font re-fit leaves a form document unchanged (no second document per keystroke)", () => {
    for (const s of [st({ line1: "Ion Rusu" }), st({ line1: "Restaurant La Placinte", line2: "022 123 456" }), st({ line1: "ANVI", logo: logo(400, 200), align: "left" })]) {
      const doc = penFormDoc(emptyStudioDoc("pen", [surfaceBase(pen!)]), penFormLayout(pen!, s, "#000000", measure));
      expect(fitDocTexts(doc, measure, "bound")).toBe(doc);
    }
  });
});
