import { describe, expect, it } from "vitest";
import { buildCardDoc, cardSideSlots, matchingBack } from "./cardBuild";
import { CARD_BACK_IDS } from "./cardTemplates/helpers";
import { cardInitials, expandStack, stackRowsShown, type TplStack } from "./cardTemplates/stack";
import { nodeMeasure, registerCardFonts } from "./cardTestKit";
import type { StudioDoc, StudioTextLayer } from "./document";
import { brandPaletteFromColors, CARD_PRESET_PALETTES } from "./palette";
import { evaluateStudioQuality } from "./quality";
import type { StudioFields } from "./smartFields";
import { CARD_BACK_ID, CARD_FRONT_ID, studioSurfaces } from "./surfaces";
import { CARD_INDUSTRIES, CARD_STYLES, STUDIO_TEMPLATE_FONTS, studioCardBackTemplates, studioTemplateById, studioTemplatesFor, type TplText } from "./templates";

registerCardFonts();
const specs = studioSurfaces("card");
const fronts = studioTemplatesFor("card");
const backs = studioCardBackTemplates();

const FULL: StudioFields = {
  name: "Ana Ciobanu",
  title: "Director de vânzări",
  company: "Dor de Cafea",
  phone: "+373 69 123 456",
  email: "ana@dordecafea.md",
  site: "www.dordecafea.md",
  address: "Str. Ștefan cel Mare 1, Chișinău",
};
const SETS: Record<string, StudioFields> = {
  full: FULL,
  long: { ...FULL, name: "Alexandru-Constantin Munteanu", title: "Главный бухгалтер-ревизор", phone: "+373 22 12 34 56", company: "Contabilitate & Audit Expert SRL" },
  short: { name: "Ana Ciobanu", title: "Director de vânzări", phone: "+373 69 123 456", email: "ana@dordecafea.md" },
  nameOnly: { name: "Ion Rusu", phone: "+373 22 12 34 56" },
  colours: { ...FULL, ...brandPaletteFromColors(["#f5d90a", "#00a3e0"])! },
  dark: { ...FULL, ...CARD_PRESET_PALETTES[5]! },
  logo: { ...FULL, logo: { localId: "x", naturalW: 400, naturalH: 400 }, ...brandPaletteFromColors(["#b5532f", "#f2c14e"])! },
};

/** Print problems of a built card, leaving out what a template may legitimately have empty. */
function problems(doc: StudioDoc, allowEmpty: boolean): string[] {
  return evaluateStudioQuality(doc, specs)
    .filter((i) => !["photoEmpty", "sampleNotPrinted", "qrEmpty", ...(allowEmpty ? ["designEmpty"] : [])].includes(i.code))
    .map((i) => `${i.surfaceId}:${i.level}:${i.code}:${doc.surfaces.flatMap((s) => s.layers).find((l) => l.id === i.layerId)?.kind ?? ""}`);
}

const texts = (doc: StudioDoc, side = CARD_FRONT_ID): StudioTextLayer[] => doc.surfaces.find((s) => s.id === side)!.layers.filter((l): l is StudioTextLayer => l.kind === "text");

describe("business-card template set (bc-4)", () => {
  it("has 24 fronts and 8 backs, horizontal, every style and trade covered, each front with an existing back", () => {
    expect(fronts.length).toBe(24);
    expect(backs.map((b) => b.id).sort()).toEqual([...CARD_BACK_IDS].sort());
    for (const s of CARD_STYLES) expect(fronts.filter((f) => f.style === s).length, s).toBeGreaterThan(s === "photo" ? 1 : 2);
    for (const i of CARD_INDUSTRIES) expect(fronts.filter((f) => f.industries?.includes(i)).length, i).toBeGreaterThan(0);
    for (const f of fronts) {
      expect(f.back && studioTemplateById(f.back)?.side, f.id).toBe("back");
      expect(new Set(fronts.map((x) => x.id)).size).toBe(fronts.length);
    }
  });

  it("uses only the self-hosted fonts with Cyrillic and ș/ț", () => {
    for (const t of [...fronts, ...backs]) {
      const layers = t.layouts.card ?? [];
      const fonts = layers.flatMap((l) => (l.k === "text" ? [l.font] : l.k === "stack" ? l.rows.map((r) => r.font) : l.k === "photo" ? (l.fallback ?? []).flatMap((f) => (f.k === "text" ? [(f as TplText).font] : [])) : []));
      for (const f of fonts) expect(STUDIO_TEMPLATE_FONTS, `${t.id} ${f}`).toContain(f);
    }
  });

  for (const [set, fields] of Object.entries(SETS)) {
    it(`every front + its back opens without a print problem (${set})`, () => {
      for (const front of fronts) {
        const doc = buildCardDoc({ front, back: matchingBack(front), fields, lang: set === "long" ? "ru" : "ro", specs, measure: nodeMeasure });
        expect(problems(doc, false), `${front.id} / ${front.back}`).toEqual([]);
        for (const t of doc.surfaces.flatMap((s) => s.layers)) if (t.kind === "text") expect(t.sizePt, `${front.id} ${t.text}`).toBeGreaterThanOrEqual(7);
      }
      for (const back of backs) {
        const doc = buildCardDoc({ front: fronts[0]!, back, fields, lang: "ro", specs, measure: nodeMeasure });
        expect(problems(doc, false), back.id).toEqual([]);
      }
    });
  }

  it("with no details yet every template shows its samples and fits", () => {
    for (const front of fronts) {
      const doc = buildCardDoc({ front, back: matchingBack(front), fields: {}, lang: "ro", specs, measure: nodeMeasure });
      expect(problems(doc, true), front.id).toEqual([]);
      expect(texts(doc).some((t) => t.bind === "name" && t.placeholder)).toBe(true);
    }
  });

  it("names are the biggest text of a front", () => {
    for (const front of fronts) {
      const doc = buildCardDoc({ front, back: null, fields: FULL, lang: "ro", specs, measure: nodeMeasure });
      const name = texts(doc).find((t) => t.bind === "name");
      if (!name) continue;
      const others = texts(doc).filter((t) => t.bind && t.bind !== "name" && t.bind !== "company");
      for (const o of others) expect(name.sizePt, `${front.id} name vs ${o.bind}`).toBeGreaterThan(o.sizePt);
    }
  });
});

describe("business-card details layout", () => {
  const st: TplStack = {
    k: "stack",
    x: 0.07,
    y: 0.5,
    w: 0.6,
    rows: [
      { bind: "phone", size: 0.05, font: "Open Sans", color: "#000000", icon: "iconPhone" },
      { bind: "email", size: 0.05, font: "Open Sans", color: "#000000", icon: "iconMail" },
      { bind: "site", size: 0.05, font: "Open Sans", color: "#000000", icon: "iconWeb" },
      { bind: "address", size: 0.05, font: "Open Sans", color: "#000000", icon: "iconPin" },
    ],
  };

  it("drops the lines of empty fields and closes the gap (samples while nothing is typed)", () => {
    expect(stackRowsShown(st.rows, {}).length).toBe(4);
    expect(stackRowsShown(st.rows, { phone: "1", email: "a@b.md" }).map((r) => r.bind)).toEqual(["phone", "email"]);
    const all = expandStack(st, FULL, 94, 54).filter((l) => l.k === "text");
    const two = expandStack(st, { phone: "1", address: "Str. X" }, 94, 54).filter((l) => l.k === "text");
    expect(two.map((l) => (l.k === "text" ? l.bind : null))).toEqual(["phone", "address"]);
    // The address moves up into the e-mail's place: same step as between the first two lines.
    const cy = (l: (typeof all)[number]) => (l.k === "text" ? l.cy : 0);
    expect(cy(two[1]!) - cy(two[0]!)).toBeCloseTo(cy(all[1]!) - cy(all[0]!), 6);
    // Icons go with their lines.
    expect(expandStack(st, { phone: "1" }, 94, 54).filter((l) => l.k === "shape").length).toBe(1);
  });

  it("a built card has no layer for an empty site / address and keeps the others", () => {
    for (const front of fronts) {
      const doc = buildCardDoc({ front, back: matchingBack(front), fields: SETS.short!, lang: "ro", specs, measure: nodeMeasure });
      for (const s of doc.surfaces) {
        const binds = s.layers.flatMap((l) => (l.kind === "text" && l.bind ? [l.bind] : []));
        expect(binds, front.id).not.toContain("site");
        expect(binds, front.id).not.toContain("address");
      }
    }
  });

  it("monogram initials of the company, else the name", () => {
    expect(cardInitials({ company: "Dor de Cafea" })).toBe("DD");
    expect(cardInitials({ company: "«Auto-Lux» SRL" })).toBe("AL");
    expect(cardInitials({ name: "Ана Чобану" })).toBe("АЧ");
    expect(cardInitials({ name: "ștefan" })).toBe("Ș");
    expect(cardInitials({})).toBe("");
  });
});

describe("business-card back inherits the front (bc-5)", () => {
  it("the back takes the same details, logo and brand colours", () => {
    const fields = SETS.logo!;
    const front = fronts[0]!;
    const back = matchingBack(front)!;
    const doc = buildCardDoc({ front, back, fields, lang: "ro", specs, measure: nodeMeasure });
    expect(doc.surfaces.map((s) => s.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
    const b = doc.surfaces[1]!;
    const shown = b.layers.flatMap((l) => (l.kind === "text" && !l.placeholder ? [l.text] : []));
    expect(shown.length).toBeGreaterThan(0);
    for (const v of shown) expect(Object.values(fields)).toContain(v);
    const brand = new Set([fields.brandColor1, fields.brandColor2, fields.brandColor3]);
    expect(b.layers.some((l) => (l.kind === "shape" && l.fill && brand.has(l.fill)) || (l.kind === "text" && brand.has(l.color)) || (l.kind === "image" && l.src?.localId === "x"))).toBe(true);
  });

  it("every front's back has a logo, QR or the details (never an empty side)", () => {
    for (const front of fronts) {
      const doc = buildCardDoc({ front, back: matchingBack(front), fields: FULL, lang: "ro", specs, measure: nodeMeasure });
      expect(problems(doc, false).filter((p) => p.includes("designEmpty")), front.id).toEqual([]);
    }
  });

  it("the short-edit form lists the template's fields per side, collapsed lines included", () => {
    const slots = cardSideSlots(studioTemplateById("card-minimal")!, "front", "ro", specs);
    expect(slots.filter((s) => s.kind === "field").map((s) => s.id)).toEqual(expect.arrayContaining(["name", "title", "phone", "email", "site", "address"]));
  });
});
