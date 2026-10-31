import { describe, expect, it } from "vitest";
import {
  NOTEBOOK_LOOK_DEFAULTS,
  notebookLookJson,
  notebookPrintableArea,
  parseNotebookLook,
  pickNotebookLook,
} from "./notebookLook";
import { buildNotebook, NB_MESH_PEN, NB_MESH_STRAP, NB_MESH_WIRE, NOTEBOOK_UNIT_PER_CM } from "./notebookGeometry";
import { autofillNotebook, notebookSizeFromSupplier } from "./notebookAutofill";
import { notebookAttributesJson, parseNotebookAttributes } from "./notebookVariantAttributes";

describe("parseNotebookLook", () => {
  it("old notebooks keep the classic A5 hardcover", () => {
    expect(parseNotebookLook({})).toEqual(NOTEBOOK_LOOK_DEFAULTS);
  });

  it("clamps sizes and rejects unknown values", () => {
    const l = parseNotebookLook({ widthCm: 99, heightCm: "14.33", thicknessCm: 0, binding: "glued", accentSharePct: 200 });
    expect(l).toMatchObject({ widthCm: 40, heightCm: 14.3, thicknessCm: 0.3, binding: "hardcover", accentSharePct: 90 });
  });

  it("round-trips through item attributes", () => {
    const a = parseNotebookAttributes({ widthCm: 9.3, heightCm: 14.3, binding: "spiral", hasPen: true, accent: "bottom" });
    const back = parseNotebookAttributes(notebookAttributesJson(a));
    expect(back).toMatchObject({ widthCm: 9.3, heightCm: 14.3, binding: "spiral", hasPen: true, accent: "bottom" });
  });

  it("json has every look key; pick keeps only the set ones", () => {
    expect(Object.keys(notebookLookJson(NOTEBOOK_LOOK_DEFAULTS)).sort()).toEqual(Object.keys(NOTEBOOK_LOOK_DEFAULTS).sort());
    expect(pickNotebookLook({ widthCm: 10, sku: "X", hasPen: undefined })).toEqual({ widthCm: 10 });
  });
});

describe("notebookPrintableArea", () => {
  it("is the whole cover for a hardcover", () => {
    expect(notebookPrintableArea(parseNotebookLook({ widthCm: 9.3, heightCm: 14.3 }))).toEqual({ widthCm: 9.3, heightCm: 14.3 });
  });

  it("leaves out the cork part and the spiral holes", () => {
    expect(notebookPrintableArea(parseNotebookLook({ widthCm: 9.3, heightCm: 14.3, accent: "bottom", accentSharePct: 45 }))).toEqual({
      widthCm: 9.3,
      heightCm: 7.9,
    });
    expect(notebookPrintableArea(parseNotebookLook({ widthCm: 15, heightCm: 21, binding: "spiral" }))).toEqual({ widthCm: 13.8, heightCm: 21 });
  });
});

describe("buildNotebook", () => {
  const names = (l: Parameters<typeof buildNotebook>[0]) => buildNotebook(l).group.children.map((c) => c.name);

  it("hardcover: strap, no wire; spiral with pen: wire and pen, no strap", () => {
    const hard = names(parseNotebookLook({}));
    expect(hard).toContain(NB_MESH_STRAP);
    expect(hard).not.toContain(NB_MESH_WIRE);
    const spiral = names(parseNotebookLook({ binding: "spiral", hasStrap: false, hasPen: true }));
    expect(spiral).toContain(NB_MESH_WIRE);
    expect(spiral).toContain(NB_MESH_PEN);
    expect(spiral).not.toContain(NB_MESH_STRAP);
  });

  it("puts the print on top of the front cover, inside the printable zone", () => {
    const b = buildNotebook(parseNotebookLook({ widthCm: 9.3, heightCm: 14.3, accent: "bottom", accentSharePct: 45 }), {
      widthCm: 20,
      heightCm: 20,
    });
    expect(b.label.y).toBeGreaterThan(b.thickness);
    // Capped to the zone above the cork: 9.3 × 7.9 cm, centred in it (towards the top edge, −Z).
    expect(b.label.width / NOTEBOOK_UNIT_PER_CM).toBeCloseTo(9.3, 5);
    expect(b.label.height / NOTEBOOK_UNIT_PER_CM).toBeCloseTo(14.3 * 0.55, 5);
    expect(b.label.z).toBeLessThan(0);
    expect(b.accent).toEqual({ axis: "z", from: expect.any(Number) });
  });
});

describe("autofillNotebook", () => {
  it("reads three sizes in any order as a portrait cover", () => {
    expect(notebookSizeFromSupplier([15, 1.9, 18.2])).toEqual({ widthCm: 15, heightCm: 18.2, thicknessCm: 1.9 });
  });

  it("Coral: A6 hardcover, strap + ribbon in the cover colour, print = cover", () => {
    const r = autofillNotebook({
      names: ["Блокнот CORAL фуксия"],
      descriptions: ["Promotional A6 Coral (NB8051) notepad. Notepad with hard cover in imitation leather. Notebook with bookmark and elastic band."],
      supplier: { sizesCm: [9.3, 14.3, 1.5], colorHex: "#EB1C60" },
    });
    expect(r.fields).toMatchObject({
      binding: "hardcover",
      finish: "leather",
      hasStrap: true,
      hasBookmark: true,
      hasPen: false,
      widthCm: 9.3,
      heightCm: 14.3,
      coverColorHex: "#eb1c60",
      strapColorHex: "#eb1c60",
      printWidthCm: 9.3,
      printHeightCm: 14.3,
    });
  });

  it("Iris: cork lower part, print only above it", () => {
    const r = autofillNotebook({
      names: ["Блокнот IRIS зелёный"],
      descriptions: ["A6 notebook with covers in imitation leather and natural cork. 80 sheets notebook."],
      supplier: { sizesCm: [9.3, 14.3, 1.5], colorHex: "#009A44" },
    });
    expect(r.fields).toMatchObject({ accent: "bottom", accentTexture: "cork", hasStrap: true, printHeightCm: 7.9 });
  });

  it("Leynax: spiral with a ball pen, black metal wire, pen in the cover colour", () => {
    const r = autofillNotebook({
      names: ["Блокнот LEYNAX оранжевый"],
      descriptions: ["Discover the spiral ring notebook in recycled cardboard from Stamina. 70 sheets and ball pen included."],
      supplier: { sizesCm: [15, 1.9, 18.2], colorHex: "#F08927" },
    });
    expect(r.fields).toMatchObject({
      binding: "spiral",
      finish: "matte",
      hasStrap: false,
      hasBookmark: false,
      hasPen: true,
      wireColorHex: "#2b2b2b",
      penColorHex: "#f08927",
      printWidthCm: 13.8,
    });
  });

  it("Mistrol: plastic rings in the cover colour", () => {
    const r = autofillNotebook({
      names: ["Блокнот MISTROL красный"],
      descriptions: ["A5 notebook with flexible rings made from RPET. Features a rigid cover made from recycled RPET polyester."],
      supplier: { sizesCm: [15, 21, 1.2], colorHex: "#DC002E" },
    });
    expect(r.fields).toMatchObject({ binding: "spiral", wireColorHex: "#dc002e", hasPen: false });
  });

  it("Renat: the photo shows the spiral the text doesn't mention; bamboo strip", () => {
    const r = autofillNotebook({
      names: ["Блокнот RENAT серо-бежевый"],
      descriptions: ["A5 notebook made from recycled cardboard from milk cartons, with hard cover and bamboo detail. Features sticky notes in different sizes and colours inside."],
      supplier: { sizesCm: [17.7, 13.5, 1.3], colorHex: "#F3EFE0", photoSpiral: true },
    });
    expect(r.fields).toMatchObject({ binding: "spiral", accent: "spine", accentTexture: "plain", hasStrap: false, widthCm: 13.5, heightCm: 17.7 });
    expect(r.notes).toContain("sticky_notes");
  });

  it("Fruti: colour sampled from the photo when the catalog has none", () => {
    const r = autofillNotebook({
      names: ["Блокнот FRUTI вишнёвый"],
      descriptions: ["A5 notepad with hard covers made from fruit scraps. Includes matching bookmark and elastic band."],
      supplier: { sizesCm: [14, 21, 1.2], colorHex: "#a6443e", colorFromPhoto: true },
    });
    expect(r.fields.coverColorHex).toBe("#a6443e");
    expect(r.notes).toContain("photo_color");
  });

  it("own notebook without supplier: colour from the name, print area untouched", () => {
    const r = autofillNotebook({ names: ["Блокнот Зеленый A5"] });
    expect(r.fields.coverColorHex).toBe("#2e9b4a");
    expect(r.fields.printWidthCm).toBeUndefined();
    expect(r.notes).toEqual(["name_color"]);
  });
});
