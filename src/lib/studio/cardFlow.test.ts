import { describe, expect, it } from "vitest";
import { matchingBack } from "./cardBuild";
import {
  cardGalleryChips,
  cardGalleryFronts,
  cardShortDoc,
  cardShortSetBack,
  cardShortSetText,
  cardShortStart,
  cardShortWithBack,
  fieldsWithPalette,
  isPaletteOf,
  parseCardShortState,
} from "./cardFlow";
import { logoSampleSize } from "./logoPalette";
import { CARD_PRESET_PALETTES } from "./palette";
import { CARD_BACK_ID, CARD_FRONT_ID, studioSurfaces } from "./surfaces";
import { studioCardBackTemplates, studioTemplatesFor } from "./templates";

const specs = studioSurfaces("card");
const fronts = studioTemplatesFor("card");

describe("card gallery", () => {
  it("lists every front with no filter, no backs", () => {
    expect(cardGalleryFronts()).toHaveLength(fronts.length);
    expect(cardGalleryFronts().every((t) => t.side !== "back")).toBe(true);
  });

  it("filters by industry or style", () => {
    const { industries, styles } = cardGalleryChips();
    expect(industries.length).toBeGreaterThan(0);
    expect(styles.length).toBeGreaterThan(0);
    for (const i of industries) {
      const list = cardGalleryFronts({ industry: i });
      expect(list.length, i).toBeGreaterThan(0);
      expect(list.every((t) => t.industries?.includes(i))).toBe(true);
    }
    for (const s of styles) {
      const list = cardGalleryFronts({ style: s });
      expect(list.length, s).toBeGreaterThan(0);
      expect(list.every((t) => t.style === s)).toBe(true);
    }
  });
});

describe("card short edit", () => {
  const front = fronts[0]!;

  it("starts one-sided and adds the matching back", () => {
    const s = cardShortStart(front);
    expect(s.backId).toBeNull();
    const on = cardShortWithBack(s, true);
    expect(on.backId).toBe(matchingBack(front)!.id);
    expect(cardShortWithBack(on, false).backId).toBeNull();
    // Turned on again: the back picked before comes back.
    const other = studioCardBackTemplates().find((t) => t.id !== on.backId)!;
    const picked = cardShortSetBack(on, other.id);
    expect(picked.backId).toBe(other.id);
    expect(cardShortWithBack(cardShortWithBack(picked, false), true, other.id).backId).toBe(other.id);
    expect(cardShortSetBack(on, front.id)).toBe(on);
  });

  it("writes and clears free texts", () => {
    const s = cardShortSetText(cardShortStart(front), "front:slogan", "Cafea bună");
    expect(s.texts).toEqual({ "front:slogan": "Cafea bună" });
    expect(cardShortSetText(s, "front:slogan", "").texts).toEqual({});
  });

  it("builds the whole card with a stable id", () => {
    const s = cardShortWithBack(cardShortStart(front), true);
    const doc = cardShortDoc(s, { fields: { name: "Ion Popescu", phone: "+373 69 123 456" }, lang: "ro", specs, id: "d_keep" })!;
    expect(doc.id).toBe("d_keep");
    expect(doc.templateId).toBe(front.id);
    expect(doc.surfaces.map((x) => x.id)).toEqual([CARD_FRONT_ID, CARD_BACK_ID]);
    const names = doc.surfaces[0]!.layers.flatMap((l) => (l.kind === "text" && l.bind === "name" ? [l.text] : []));
    expect(names).toContain("Ion Popescu");
    expect(cardShortDoc({ ...s, frontId: "nope" }, { fields: {}, lang: "ro", specs })).toBeNull();
  });

  it("parses a stored state and drops what is not valid", () => {
    const s = { ...cardShortWithBack(cardShortStart(front), true), texts: { "front:x": "a", bad: "b" } };
    expect(parseCardShortState(JSON.parse(JSON.stringify(s)))).toEqual({ ...s, texts: { "front:x": "a" } });
    expect(parseCardShortState({ frontId: "nope" })).toBeNull();
    expect(parseCardShortState(null)).toBeNull();
    expect(parseCardShortState({ frontId: front.id, backId: front.id })?.backId).toBeNull();
  });
});

describe("card colours", () => {
  it("sets / clears the brand colours", () => {
    const p = CARD_PRESET_PALETTES[1]!;
    const f = fieldsWithPalette({ name: "Ion" }, p);
    expect(f).toMatchObject({ name: "Ion", ...p });
    expect(isPaletteOf(f, p)).toBe(true);
    expect(isPaletteOf(f, CARD_PRESET_PALETTES[0]!)).toBe(false);
    const none = fieldsWithPalette(f, null);
    expect(none).toEqual({ name: "Ion" });
    expect(isPaletteOf(none, null)).toBe(true);
  });

  it("samples a logo small, aspect kept", () => {
    expect(logoSampleSize(1000, 500)).toEqual({ w: 96, h: 48 });
    expect(logoSampleSize(40, 20)).toEqual({ w: 40, h: 20 });
    expect(logoSampleSize(0, 10)).toEqual({ w: 1, h: 1 });
    expect(logoSampleSize(3000, 10)).toEqual({ w: 96, h: 1 });
  });
});
