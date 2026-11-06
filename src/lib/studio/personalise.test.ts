import { describe, expect, it } from "vitest";
import type { StudioDoc, StudioImageLayer, StudioImageSrc, StudioTextLayer } from "./document";
import {
  fillStarterPhotos,
  isTemplateDefaultText,
  looksLikeDate,
  orderTemplatesForPhotos,
  personaliseSlots,
  setSlotPhoto,
  setSlotText,
  switchTemplateKeepTyped,
  templatePhotoSlots,
} from "./personalise";
import { studioSurfaces } from "./surfaces";
import { instantiateStudioTemplate, studioTemplateById, studioTemplatesFor } from "./templates";

const specs = studioSurfaces("mug");
const doc = (id: string, lang: "ro" | "ru" | "en" = "ro", fields = {}): StudioDoc =>
  instantiateStudioTemplate(studioTemplateById(id)!, "mug", specs, lang, fields);
const layers = (d: StudioDoc) => d.surfaces[0]!.layers;
const texts = (d: StudioDoc) => layers(d).filter((l): l is StudioTextLayer => l.kind === "text");
const images = (d: StudioDoc) => layers(d).filter((l): l is StudioImageLayer => l.kind === "image");
const P = (n: number): StudioImageSrc => ({
  localId: `img${n}`,
  naturalW: 1200,
  naturalH: 800,
  mime: "image/jpeg",
});

describe("personalise slots", () => {
  it("lists photos first, then texts top-down, one entry per bound field", () => {
    const s = personaliseSlots(doc("bday-photo"));
    expect(s.map((x) => (x.kind === "photo" ? "photo" : x.field))).toEqual(["photo", "text", "text", "name"]);
    expect(s[0]).toMatchObject({
      kind: "photo",
      index: 1,
      logo: false,
      filled: false,
    });
    expect(s[1]).toMatchObject({
      kind: "text",
      text: "30",
      placeholder: true,
      index: 1,
    });
  });

  it("recognises dates", () => {
    expect(looksLikeDate("12.06.2026")).toBe(true);
    expect(looksLikeDate("Ana & Mihai · 12/06/26")).toBe(true);
    expect(looksLikeDate("2027")).toBe(true);
    expect(looksLikeDate("La mulți ani 2027")).toBe(false);
    expect(looksLikeDate("+373 60 000 000")).toBe(false);
  });

  it("counts a template's photo and logo spots", () => {
    expect(templatePhotoSlots(studioTemplateById("love-two-photos")!, "mug")).toEqual({ photos: 2, logos: 0 });
    expect(templatePhotoSlots(studioTemplateById("corp-logo-band")!, "mug")).toEqual({ photos: 0, logos: 1 });
  });

  it("puts templates with enough photo spots first when there are photos", () => {
    const list = studioTemplatesFor("mug");
    expect(orderTemplatesForPhotos(list, "mug", 0).map((t) => t.id)).toEqual(list.map((t) => t.id));
    const two = orderTemplatesForPhotos(list, "mug", 2);
    expect(two[0]!.id).toBe("love-two-photos");
    expect(two).toHaveLength(list.length);
    const one = orderTemplatesForPhotos(list, "mug", 1);
    const firstNoPhoto = one.findIndex((t) => templatePhotoSlots(t, "mug").photos === 0);
    expect(one.slice(firstNoPhoto).every((t) => templatePhotoSlots(t, "mug").photos === 0)).toBe(true);
  });
});

describe("starter photos", () => {
  it("fill the photo slots in order, extra photos are ignored", () => {
    const d = fillStarterPhotos(doc("love-two-photos"), [P(1), P(2), P(3)]);
    expect(images(d).map((l) => l.src?.localId)).toEqual(["img1", "img2"]);
  });

  it("go into a logo spot only when the template has no photo spot and the customer has no logo", () => {
    const corp = doc("corp-logo-band");
    const d = fillStarterPhotos(corp, [P(1)]);
    expect(images(d)[0]!.src?.localId).toBe("img1");
    expect(images(d)[0]!.bind).toBeUndefined();
    expect(images(fillStarterPhotos(corp, [P(1)], { hasLogo: true }))[0]!.src).toBeNull();
    const bday = doc("bday-photo");
    expect(fillStarterPhotos(bday, [])).toBe(bday);
  });

  it("set text and photo per slot; a bound text updates every copy", () => {
    const d0 = doc("bday-photo");
    const name = texts(d0).find((l) => l.bind === "name")!;
    const d1 = setSlotText(d0, name.id, "Ana");
    expect(texts(d1).find((l) => l.bind === "name")).toMatchObject({
      text: "Ana",
      placeholder: false,
    });
    const ph = images(d1)[0]!;
    const d2 = setSlotPhoto(d1, ph.id, {
      src: P(4),
      crop: { zoom: 1.5, ox: 0.2, oy: 0 },
    });
    expect(images(d2)[0]).toMatchObject({
      src: { localId: "img4" },
      crop: { zoom: 1.5, ox: 0.2 },
    });
    expect(setSlotText(d0, "nope", "x")).toBe(d0);
  });
});

describe("switching template", () => {
  it("knows the templates' own texts in every language", () => {
    expect(isTemplateDefaultText("La mulți ani!")).toBe(true);
    expect(isTemplateDefaultText("  с днём рождения! ")).toBe(true);
    expect(isTemplateDefaultText("Pentru bunica Ana")).toBe(false);
  });

  it("replaces an untouched theme text with the new template's own (no birthday wish on a Christmas mug)", () => {
    const bday = doc("bday-photo");
    const xmas = doc("xmas-snow");
    const out = switchTemplateKeepTyped(bday, xmas);
    const all = texts(out).map((l) => l.text);
    expect(all).toContain("Crăciun fericit!");
    expect(all).not.toContain("La mulți ani!");
    expect(out.id).toBe(bday.id);
  });

  it("keeps what the customer typed, the name and the photos", () => {
    let d = doc("bday-photo");
    const wish = texts(d).find((l) => l.text === "La mulți ani!")!;
    d = setSlotText(d, wish.id, "Pentru bunica, cu drag");
    d = setSlotText(d, texts(d).find((l) => l.bind === "name")!.id, "Ana");
    d = fillStarterPhotos(d, [P(1)]);
    const out = switchTemplateKeepTyped(d, doc("xmas-tree-photo"));
    const all = texts(out).map((l) => l.text);
    expect(all).toContain("Pentru bunica, cu drag");
    expect(all).toContain("Ana");
    expect(images(out).some((l) => l.src?.localId === "img1")).toBe(true);
  });

  it("puts a typed name into the new template's name spot, never into the big age number", () => {
    // «Ana & Ion» of «Inimi» retyped by the customer, then «Fotografie și vârstă».
    let d = doc("love-hearts");
    d = setSlotText(d, texts(d).find((l) => l.text === "Ana & Ion")!.id, "Maria & Andrei");
    const out = switchTemplateKeepTyped(d, doc("bday-photo"));
    expect(texts(out).find((l) => l.bind === "name")).toMatchObject({ text: "Maria & Andrei", placeholder: false });
    expect(texts(out).find((l) => l.text === "30")).toBeDefined();
    expect(texts(out).filter((l) => l.text === "Maria & Andrei")).toHaveLength(1);
  });

  it("puts a typed wish into a words spot and a typed age into the number spot", () => {
    let d = doc("bday-photo");
    d = setSlotText(d, texts(d).find((l) => l.text === "30")!.id, "45");
    d = setSlotText(d, texts(d).find((l) => l.text === "La mulți ani!")!.id, "Pentru tata, cu drag");
    const back = switchTemplateKeepTyped(d, doc("bday-photo"));
    expect(texts(back).map((l) => l.text)).toEqual(expect.arrayContaining(["45", "Pentru tata, cu drag"]));
    // A template without a number spot: the age is kept on top, the wish takes the words spot.
    const xmas = switchTemplateKeepTyped(d, doc("xmas-snow"));
    const wish = texts(xmas).find((l) => l.text === "Pentru tata, cu drag")!;
    expect(texts(doc("xmas-snow")).some((l) => Math.abs(l.y - wish.y) < 0.01 && Math.abs(l.x - wish.x) < 0.01)).toBe(true);
    expect(texts(xmas).filter((l) => l.text === "45")).toHaveLength(1);
  });

  it("with the name already in «Datele mele», a typed name goes to a words spot, not the age", () => {
    let d = doc("love-hearts", "ro", { name: "Ion" });
    d = setSlotText(d, texts(d).find((l) => l.text === "Ana & Ion")!.id, "Maria & Andrei");
    const out = switchTemplateKeepTyped(d, doc("bday-photo", "ro", { name: "Ion" }));
    expect(texts(out).find((l) => l.text === "30")).toBeDefined();
    expect(texts(out).find((l) => l.bind === "name")?.text).toBe("Ion");
    expect(texts(out).map((l) => l.text)).toContain("Maria & Andrei");
  });
});

describe("text roles", () => {
  it("reads ages, dates, names and other words", async () => {
    const { textRole } = await import("./textRole");
    expect(textRole("30")).toBe("number");
    expect(textRole("14.02.2027")).toBe("date");
    expect(textRole("2026")).toBe("date");
    expect(textRole("Ana")).toBe("name");
    expect(textRole("Maria & Andrei")).toBe("name");
    expect(textRole("Ион Русу")).toBe("name");
    expect(textRole("Pentru bunica")).toBe("words");
    expect(textRole("La mulți ani!")).toBe("words");
  });
});
