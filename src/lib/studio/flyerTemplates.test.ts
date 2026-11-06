import { describe, expect, it } from "vitest";
import { buildCardDoc, matchingBack } from "./cardBuild";
import { nodeMeasure, registerCardFonts } from "./cardTestKit";
import { STUDIO_SAMPLE_SHAPE, type StudioDoc, type StudioLayer, type StudioTextLayer } from "./document";
import { FLYER_IDS, flyerPrint, type FlyerFormatId } from "./flyer";
import { FLYER_BACK_IDS } from "./flyerTemplates/helpers";
import { parseFlowName } from "./flow";
import { brandPaletteFromColors, colorDistance } from "./palette";
import { SHAPE_CONTRAST_DISTANCE, evaluateStudioQuality, studioColorBelow } from "./quality";
import type { StudioFields } from "./smartFields";
import { studioSurfaces } from "./surfaces";
import { FLYER_PURPOSES, STUDIO_TEMPLATE_FONTS, studioBackTemplates, studioTemplateById, studioTemplatesFor, type StudioTemplate, type TplLayer } from "./templates";

registerCardFonts();
const fronts = studioTemplatesFor("flyer");
const backs = studioBackTemplates("flyer");

const palette = brandPaletteFromColors(["#b5532f", "#f2c14e"])!;
const logo = { localId: "logo", naturalW: 400, naturalH: 400 };
const photo = { localId: "photo", naturalW: 1600, naturalH: 1200 };
const FULL: StudioFields = {
  company: "Dor de Cafea",
  headline: "Reduceri de iarnă",
  subheadline: "La toată cafeaua și deserturile",
  body: "Vino cu prietenii și primești o prăjitură din partea casei la fiecare două cafele.",
  bullets: "Cafea de specialitate\nDeserturi de casă\nLivrare în tot orașul",
  offer: "−20%",
  date: "1–31 decembrie",
  phone: "+373 69 123 456",
  email: "salut@dordecafea.md",
  site: "www.dordecafea.md",
  address: "Str. Ștefan cel Mare 1, Chișinău",
  ...palette,
  logo,
};
const SETS: Record<string, { fields: StudioFields; lang: "ro" | "ru"; photo: boolean }> = {
  full: { fields: FULL, lang: "ro", photo: true },
  long: {
    fields: {
      ...FULL,
      company: "Centrul Medical Stomatologic «Zâmbet Sănătos»",
      headline: "Профессиональная чистка зубов и отбеливание со скидкой",
      subheadline: "Programează-te acum și primești consultația gratuită la primul control",
      body: "Clinica noastră folosește echipamente moderne din Germania. Medicii cu experiență de peste 15 ani te ajută să ai un zâmbet sănătos — fără durere și fără stres.",
      bullets: "Консультация стоматолога бесплатно\nIgienizare profesională cu ultrasunete și Air Flow\nОтбеливание за один визит\nPlata în rate fără dobândă",
      offer: "de la 499 lei",
      date: "Până pe 31 decembrie 2026",
      address: "Bd. Dacia 27/3, of. 12, Chișinău",
    },
    lang: "ru",
    photo: true,
  },
  short: { fields: { headline: "Deschidem un magazin nou!", phone: "+373 69 123 456", ...palette, logo }, lang: "ro", photo: true },
  nophoto: { fields: { ...FULL }, lang: "ro", photo: false },
  empty: { fields: {}, lang: "ro", photo: false },
};

/** Horizontal extent of the letters of a text (its box for a non-text). */
function inkBox(l: StudioLayer): { x0: number; x1: number; y0: number; y1: number } {
  if (l.kind !== "text") return { x0: l.x, x1: l.x + l.w, y0: l.y, y1: l.y + l.h };
  const m = nodeMeasure(l);
  const x0: number = l.align === "left" ? l.x : l.align === "right" ? l.x + l.w - m.w : l.x + (l.w - m.w) / 2;
  return { x0, x1: x0 + m.w, y0: l.y, y1: l.y + Math.max(l.h, 0) };
}

const isContent = (l: StudioLayer): boolean => !l.hidden && (l.kind === "text" ? l.text.trim() !== "" : l.kind === "qr" || (l.kind === "image" && l.bind === "logo"));

/**
 * A shape judged against what lies under its middle, not only the sheet's
 * background (a white icon on a brand bar, a faint white disc on a colour
 * ground): the rule `quality.ts` should apply (reported to the engine).
 */
function decorationOnItsBand(doc: StudioDoc, surfaceId: string, layerId: string | undefined): boolean {
  const s = doc.surfaces.find((x) => x.id === surfaceId);
  const index: number = s?.layers.findIndex((l) => l.id === layerId) ?? -1;
  const l = index >= 0 ? s!.layers[index]! : null;
  if (!s || !l || l.kind !== "shape" || !l.fill) return false;
  if ((l.opacity ?? 1) < 0.6 || l.name === STUDIO_SAMPLE_SHAPE) return true;
  const under: string | null = studioColorBelow(s, index, l.x + l.w / 2, l.y + l.h / 2);
  return under == null || colorDistance(l.fill, under) >= SHAPE_CONTRAST_DISTANCE;
}

function problems(doc: StudioDoc, specs: ReturnType<typeof studioSurfaces>, allowEmpty: boolean): string[] {
  const out: string[] = [];
  for (const s of doc.surfaces) {
    const safe: number = s.safeMm - 0.35;
    const content = s.layers.filter(isContent);
    for (const l of content) {
      const b = inkBox(l);
      const tag = `${s.id}:${l.kind}:${l.kind === "text" ? l.text.slice(0, 24) : l.kind}`;
      if (b.x0 < safe || b.x1 > s.widthMm - safe || b.y0 < safe || b.y1 > s.heightMm - safe) out.push(`${tag} outside safe [${b.x0.toFixed(1)}, ${b.y0.toFixed(1)}, ${b.x1.toFixed(1)}, ${b.y1.toFixed(1)}]`);
      if (l.kind === "text" && l.sizePt < 7) out.push(`${tag} ${l.sizePt} pt`);
      if (l.kind === "text" && parseFlowName(l.name) && b.x1 - b.x0 > l.w + 0.3) out.push(`${tag} wider than its column`);
    }
    // Texts never overlap one another.
    const ts = content.filter((l): l is StudioTextLayer => l.kind === "text");
    for (let i = 0; i < ts.length; i++)
      for (let j = i + 1; j < ts.length; j++) {
        const a = inkBox(ts[i]!);
        const c = inkBox(ts[j]!);
        const pad = 0.4;
        if (a.x0 < c.x1 - pad && c.x0 < a.x1 - pad && a.y0 < c.y1 - pad && c.y0 < a.y1 - pad) out.push(`${s.id}: «${ts[i]!.text.slice(0, 20)}» overlaps «${ts[j]!.text.slice(0, 20)}»`);
      }
  }
  const quality = evaluateStudioQuality(doc, specs)
    // photoDpi: the test photo is 1600 × 1200 px, too few for a full A4 at 300 dpi.
    .filter((i) => !["photoEmpty", "sampleNotPrinted", "qrEmpty", "photoDpi", ...(allowEmpty ? ["designEmpty"] : [])].includes(i.code))
    .filter((i) => i.code !== "lowContrast" || !decorationOnItsBand(doc, i.surfaceId ?? "", i.layerId))
    .map((i) => {
      const l = doc.surfaces.flatMap((s) => s.layers).find((x) => x.id === i.layerId);
      const what = !l ? "" : l.kind === "text" ? `text «${l.text.slice(0, 18)}»` : l.kind === "shape" ? `${l.shape} ${l.fill ?? l.stroke} [${[l.x, l.y, l.w, l.h].map((n) => n.toFixed(0)).join(",")}]` : l.kind;
      return `${i.surfaceId}:${i.level}:${i.code} ${what}`;
    });
  return [...out, ...quality];
}

function build(front: StudioTemplate, back: StudioTemplate | null, fmt: FlyerFormatId, set: string): { doc: StudioDoc; specs: ReturnType<typeof studioSurfaces> } {
  const specs = studioSurfaces("flyer", flyerPrint(fmt));
  const { fields, lang, photo: withPhoto } = SETS[set]!;
  const doc = buildCardDoc({ kind: "flyer", front, back, fields, lang, specs, measure: nodeMeasure, logo: null, photo: withPhoto ? photo : null });
  return { doc, specs };
}

function layerFonts(layers: readonly TplLayer[]): string[] {
  return layers.flatMap((l): string[] => {
    if (l.k === "text") return [l.font];
    if (l.k === "stack") return l.rows.map((r) => r.font);
    if (l.k === "flow") return l.items.map((i) => i.font);
    if (l.k === "photo") return layerFonts(l.fallback ?? []);
    return [];
  });
}

describe("flyer template set", () => {
  it("has fronts for every purpose, the 5 backs, unique ids, existing backs, a DL layout each", () => {
    expect(fronts.length).toBeGreaterThanOrEqual(16);
    expect(backs.map((b) => b.id).sort()).toEqual([...FLYER_BACK_IDS].sort());
    const ids = [...fronts, ...backs].map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of FLYER_PURPOSES) expect(fronts.filter((f) => f.purposes?.includes(p)).length, p).toBeGreaterThan(0);
    for (const f of fronts) {
      expect(f.id).toMatch(/^flyer-[a-z]+-[a-z]+$/);
      expect(f.back && studioTemplateById(f.back)?.side, f.id).toBe("back");
      expect(f.style, f.id).toBeTruthy();
      expect(f.purposes?.length, f.id).toBeGreaterThan(0);
      expect(f.purposes!.length, f.id).toBeLessThanOrEqual(3);
    }
    for (const t of [...fronts, ...backs]) expect(t.layouts.flyerDl, t.id).toBeTruthy();
  });

  it("uses at most 2 of the self-hosted fonts per template", () => {
    for (const t of [...fronts, ...backs]) {
      const fonts = new Set([...layerFonts(t.layouts.flyer ?? []), ...layerFonts(t.layouts.flyerDl ?? [])]);
      for (const f of fonts) expect(STUDIO_TEMPLATE_FONTS as readonly string[], `${t.id} ${f}`).toContain(f);
      expect(fonts.size, `${t.id}: ${[...fonts].join(", ")}`).toBeLessThanOrEqual(2);
    }
  });

  for (const fmt of FLYER_IDS) {
    for (const set of Object.keys(SETS)) {
      it(`${fmt} / ${set}: every front + its back stays in the safe zone, ≥ 7 pt, nothing overlaps`, () => {
        const bad: string[] = [];
        for (const front of fronts) {
          const { doc, specs } = build(front, matchingBack(front), fmt, set);
          for (const p of problems(doc, specs, set === "empty")) bad.push(`${front.id}/${front.back} ${p}`);
        }
        for (const b of backs) {
          const { doc, specs } = build(fronts[0]!, b, fmt, set);
          for (const p of problems(doc, specs, set === "empty").filter((x) => x.startsWith("back"))) bad.push(`${b.id} ${p}`);
        }
        expect(bad).toEqual([]);
      });
    }
  }

  it("with only a headline and a phone, empty fields leave no badge, pill or bullet behind", () => {
    for (const fmt of FLYER_IDS)
      for (const front of fronts) {
        const { doc } = build(front, null, fmt, "short");
        const texts = doc.surfaces[0]!.layers.filter((l): l is StudioTextLayer => l.kind === "text" && !l.placeholder);
        expect(texts.map((t) => t.bind ?? "").filter((b) => b && !["headline", "phone"].includes(b)), front.id).toEqual([]);
        expect(texts.some((t) => t.bind === "headline"), front.id).toBe(true);
        // A badge / pill disappears with its field: nothing filled sits where the offer / date would be.
        expect(doc.surfaces[0]!.layers.filter((l) => l.kind === "text" && l.placeholder && (l.bind === "offer" || l.bind === "date")), front.id).toEqual([]);
      }
  });

  it("puts the phone on every front", () => {
    for (const front of fronts) {
      const { doc } = build(front, null, "a5", "full");
      expect(doc.surfaces[0]!.layers.some((l) => l.kind === "text" && l.bind === "phone"), front.id).toBe(true);
    }
  });
});

