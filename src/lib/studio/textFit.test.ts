import { describe, expect, it } from "vitest";
import { ptToMm, type StudioTextLayer } from "./document";
import { evaluateStudioQuality } from "./quality";
import { studioSurfaces } from "./surfaces";
import { STUDIO_TEMPLATES, instantiateStudioTemplate, templateKinds } from "./templates";
import { TEXT_FIT_MIN_PT, fitDocTexts, fitTextLayer, textBandWidth } from "./textFit";

/** Crude metrics: every glyph 0.6 em wide (wider than most real fonts), lines × line height. */
const crude = (l: StudioTextLayer) => {
  const size: number = ptToMm(l.sizePt);
  const lines: string[] = l.text.split("\n");
  const chars: number = Math.max(1, ...lines.map((x) => Array.from(x).length));
  return { w: chars * 0.6 * size + size * 0.16, h: lines.length * size * l.lineHeight + size * 0.16 };
};

const text = (over: Partial<StudioTextLayer> = {}): StudioTextLayer => ({
  id: "t",
  kind: "text",
  x: 80,
  y: 40,
  w: 50,
  h: 10,
  rotation: 0,
  text: "Рождество со снегом и подарками",
  fontFamily: "Montserrat",
  bold: true,
  sizePt: 40,
  color: "#14213d",
  align: "center",
  lineHeight: 1.2,
  ...over,
});

describe("text band fit", () => {
  it("shrinks a too-wide text to the room it has, centred where it was", () => {
    const l = text();
    const band = textBandWidth(l, { widthMm: 210, safeMm: 4 }, "mug")!;
    // Centre 105 mm, clear of the 15 mm handle strips (+0.5): 179 mm.
    expect(band).toBeCloseTo(179);
    const f = fitTextLayer(l, crude, band);
    expect(f.w).toBeLessThanOrEqual(band + 0.01);
    expect(f.sizePt).toBeLessThan(40);
    expect(f.x + f.w / 2).toBeCloseTo(105);
  });

  it("only re-measures without a band, and never goes below the minimum size", () => {
    const l = text({ text: "Hi", sizePt: 20 });
    expect(fitTextLayer(l, crude, null).sizePt).toBe(20);
    const tiny = fitTextLayer(text({ text: "x".repeat(300) }), crude, 50);
    expect(tiny.sizePt).toBe(TEXT_FIT_MIN_PT);
  });

  it("leaves free customer texts alone in «bound» mode", () => {
    const spec = studioSurfaces("mug");
    const tpl = STUDIO_TEMPLATES[0]!;
    const doc = instantiateStudioTemplate(tpl, "mug", spec, "ru");
    const free = { ...doc, surfaces: doc.surfaces.map((s) => ({ ...s, layers: s.layers.map((l) => (l.kind === "text" ? { ...l, bind: undefined, placeholder: undefined, text: "x".repeat(120) } : l)) })) };
    const f = fitDocTexts(free, crude, "bound");
    const sizes = (d: typeof doc) => d.surfaces[0]!.layers.filter((l): l is StudioTextLayer => l.kind === "text").map((l) => l.sizePt);
    expect(sizes(f)).toEqual(sizes(free));
  });

  it("every template × product × language fits: no handle / seam / safe-zone / outside items after measuring", () => {
    const POSITION = new Set(["handle", "seam", "safeZone", "outside"]);
    for (const tpl of STUDIO_TEMPLATES) {
      for (const kind of templateKinds(tpl)) {
        const specs = studioSurfaces(kind);
        for (const lang of ["ro", "ru", "en"] as const) {
          const doc = fitDocTexts(instantiateStudioTemplate(tpl, kind, specs, lang), crude, "all");
          const bad = evaluateStudioQuality(doc, specs).filter((i) => POSITION.has(i.code));
          expect(bad.map((i) => `${tpl.id}/${kind}/${lang}: ${i.code} ${i.layerId}`)).toEqual([]);
        }
      }
    }
  });
});
