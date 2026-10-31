import { describe, expect, it } from "vitest";
import { autofillMug } from "./mugAutofill";
import { gorFactoryMugFacts, type GorFactoryCatalog } from "@/lib/imports/gorFactoryMedia";

const nevex = { heightCm: 9.7, diameterCm: 8.2, colorHex: "#DC002E" };

describe("autofillMug: supplier mugs", () => {
  it("NEVEX: white mug with a coloured base, supplier size", () => {
    const r = autofillMug({
      names: ["Кружка NEVEX красная"],
      descriptions: ["Ceramic mug special for sublimation. Capacity: 350 ml. Colour base."],
      supplier: nevex,
    });
    expect(r.fields).toMatchObject({
      bodyColorHex: "#ffffff",
      handleColorHex: "#ffffff",
      innerColorHex: null,
      gradientColorHex: "#dc002e",
      finish: "glossy",
      bodyHeightCm: 9.7,
      topDiameterCm: 8.2,
      bottomDiameterCm: 8.2,
      handleStyle: "classic",
    });
    expect(r.notes).toEqual(["supplier_size", "supplier_color"]);
  });

  it("FIONA: glitter outside, white inside", () => {
    const r = autofillMug({
      names: ["Кружка FIONA золотая"],
      descriptions: ["Glitter-effect ceramic mug, ideal for sublimation."],
      supplier: { heightCm: 9.5, diameterCm: 8, colorHex: "#A98307" },
    });
    expect(r.fields).toMatchObject({ finish: "glitter", bodyColorHex: "#a98307", innerColorHex: "#ffffff" });
  });

  it("MANGO: two-tone article, inside and handle in colour", () => {
    const r = autofillMug({
      names: ["Кружка MANGO белая/чёрная"],
      descriptions: ["Customizable ceramic Mango (MD4001) mug. 350 ml capacity. Interior and handle in colour."],
      supplier: { heightCm: 9.6, diameterCm: 8.2, colorHex: "#FFFFFF/#000000" },
    });
    expect(r.fields).toMatchObject({ bodyColorHex: "#ffffff", innerColorHex: "#000000", handleColorHex: "#000000" });
  });

  it("AKEBIA: two-tone without a hint → coloured inside; notes the spoon", () => {
    const r = autofillMug({
      names: ["Кружка AKEBIA белая/синяя"],
      descriptions: ["White mug for sublimation. Matching spoon included."],
      supplier: { heightCm: 10.5, diameterCm: 8.3, colorHex: "#FFFFFF/#0060A9" },
    });
    expect(r.fields).toMatchObject({ bodyColorHex: "#ffffff", handleColorHex: "#ffffff", innerColorHex: "#0060a9" });
    expect(r.notes).toContain("spoon");
  });
});

describe("autofillMug: BUKS", () => {
  it("matte outside with a matching colour interior → whole mug in the colour", () => {
    const r = autofillMug({
      names: ["Кружка BUKS красная"],
      descriptions: ["Ceramic mug with a capacity of 320 ml. The design features a matte finish on the outside and an edged surface with a matching colour interior."],
      supplier: { heightCm: 9.5, diameterCm: 8.8, colorHex: "#DC002E" },
    });
    expect(r.fields).toMatchObject({
      bodyColorHex: "#dc002e",
      handleColorHex: "#dc002e",
      innerColorHex: "#dc002e",
      finish: "matte",
    });
  });
});

describe("autofillMug: own names", () => {
  const f = (name: string) => autofillMug({ names: [name] }).fields;

  it("coloured inside with a heart handle", () => {
    expect(f("Кружка с голубой внутренней частью и ручкой-сердечком")).toMatchObject({
      bodyColorHex: "#ffffff",
      innerColorHex: "#6cb4e4",
      handleColorHex: "#6cb4e4",
      handleStyle: "heart",
    });
  });

  it("inside and rim black, handle stays white", () => {
    expect(f("Керамическая Кружка, Внутри и Ободок Черный")).toMatchObject({
      innerColorHex: "#1c1c1c",
      rimColorHex: "#1c1c1c",
      handleColorHex: "#ffffff",
    });
  });

  it("colour after a dash: «цветная внутри и ручка — синяя»", () => {
    expect(f("Кружка цветная внутри и ручка 330 мл — синяя")).toMatchObject({
      innerColorHex: "#1f4fa3",
      handleColorHex: "#1f4fa3",
      bodyColorHex: "#ffffff",
    });
  });

  it("finishes: matte, metallic, glitter", () => {
    expect(f("Розовая матовая кружка")).toMatchObject({ finish: "matte", bodyColorHex: "#f2a7bb" });
    expect(f("Серебряная кружка")).toMatchObject({ finish: "metallic", innerColorHex: "#ffffff" });
    expect(f("Термокружка с блёстками").finish).toBe("glitter");
    expect(f("Cană albă mată").finish).toBe("matte");
  });

  it("shapes: 450 ml, 90 ml, enamel, thermos", () => {
    expect(f("Kружка белая 450ml")).toMatchObject({ bodyHeightCm: 12, topDiameterCm: 8.7 });
    expect(f("Маленькая кружка 90 мл")).toMatchObject({ bodyHeightCm: 6, topDiameterCm: 6 });
    expect(f("Металлическая кружка с синим ободком")).toMatchObject({ bodyHeightCm: 8, rimColorHex: "#1f4fa3" });
    expect(f("Металлическая кружка-термос")).toMatchObject({
      handleStyle: "none",
      bodyHeightCm: 17,
      finish: "metallic",
      bodyColorHex: "#c4c6c8",
    });
  });

  it("a thermo-mug is not a thermos: keeps its handle", () => {
    expect(f("Термокружка с блёстками").handleStyle).toBe("classic");
    expect(f("Кружка термо-магик матовая")).toMatchObject({ handleStyle: "classic", bodyColorHex: "#1c1c1c" });
  });

  it("fully black: inside too", () => {
    expect(f("Полностью чёрная кружка")).toMatchObject({ bodyColorHex: "#1c1c1c", innerColorHex: "#1c1c1c" });
  });

  it("marble: pale tint and a note", () => {
    const r = autofillMug({ names: ["Чашка Мрамор Синяя"] });
    expect(r.fields.bodyColorHex).not.toBe("#1f4fa3");
    expect(r.notes).toContain("marble");
  });

  it("no colour word: white mug, says so", () => {
    const r = autofillMug({ names: ["Кружка Love"] });
    expect(r.fields.bodyColorHex).toBe("#ffffff");
    expect(r.notes).toEqual(["no_color", "decor"]);
  });
});

describe("gorFactoryMugFacts", () => {
  const catalog: GorFactoryCatalog = {
    MODELS: {
      TZ1267: {
        SIZES: { S1: { H: "9.6", D: "8.2" } },
        COLORS: { "02": {}, "03": {} },
        PRODUCTS: { TZ1267S103: { COLOR: "03", SIZE: "S1" } },
      },
    },
    COLORS: { "03": { HEXCODE: "#FFE400" }, "226": { HEXCODE: "#009A44" } },
  };

  it("reads size and colour of a listed article", () => {
    expect(gorFactoryMugFacts(catalog, "TZ1267S103")).toEqual({ heightCm: 9.6, diameterCm: 8.2, colorHex: "#FFE400" });
  });

  it("finds the colour from the code tail when the article isn't listed", () => {
    expect(gorFactoryMugFacts(catalog, "TZ1267S1226")?.colorHex).toBe("#009A44");
  });

  it("is null for an unknown model", () => {
    expect(gorFactoryMugFacts(catalog, "XX0000S1")).toBeNull();
  });
});
