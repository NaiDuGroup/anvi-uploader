import { describe, expect, it } from "vitest";
import { normalizeHintText, parseGsm, parseHintPrefill, parseQuantity, suggestLineTypes } from "./orderTypeHint";

const best = (notes: string, ...fileNames: string[]) => suggestLineTypes({ notes, fileNames })[0]?.target ?? null;

describe("suggestLineTypes", () => {
  it.each([
    ["футболки dtf 20 шт", "dtf_apparel"],
    ["майку принесём, на спине", "dtf_apparel"],
    ["2 tricouri negre M", "dtf_apparel"],
    ["наклейки круглые 6,5 см 200 шт", "sticker_sheet"],
    ["stickere decupate pe contur 2 foi A3", "sticker_sheet"],
    ["UV DTF NACLEIKA", "uv_dtf"],
    ["уф-дтф наклейки на кружку", "uv_dtf"],
    ["приглашения A5 300 гр с биговкой", "postcard"],
    ["38 дипломов а4 300 мат", "postcard"],
    ["визитки 100 шт", "business_card"],
    ["Cărți de vizită 48 buc", "business_card"],
    ["ватман A1", "large_format_print"],
    ["2 оракала матовых 50х80 см", "large_format_print"],
    ["орг стекло 18 на 18 см", "uv_print"],
    ["plastic 3 mm", "uv_print"],
    ["БЕЛЫЕ КРУЖКИ НЕ СРОЧНО", "mug"],
    ["carnete negre în pătrățele", "notebook"],
    ["красные ручки", "pen"],
    ["Carnet mov și pix alb", "set"],
    ["флаеры A5 150 гр 500 шт", "flyer"],
  ])("%s → %s", (notes, target) => {
    expect(best(notes)).toBe(target);
  });

  it("stays silent on plain printing and document words", () => {
    expect(best("распечатать договор 3 стр")).toBeNull();
    expect(best("ксерокопия паспорта", "pasaport.pdf")).toBeNull();
    expect(best("", "Raport de practica BC Victoriabank SA.docx")).toBeNull();
    expect(best("A4 цветная печать 10 копий")).toBeNull();
    expect(best("курсовая работа, переплёт пружина")).toBeNull();
    // A thesis («дипломная») is not a diploma.
    expect(best("дипломная работа 60 стр")).toBeNull();
  });

  it("does not take a mug handle («ручка») for a pen", () => {
    expect(best("кружка с красной ручкой")).toBe("mug");
  });

  it("does not match short words inside longer ones", () => {
    expect(best("", "pixel_art.png")).toBeNull();
    expect(best("", "IMG_1234.jpg")).toBeNull();
  });

  it("prefers the file of the row over the shared order comment", () => {
    // Gift set order: the pen file of the set is a pen line.
    expect(best("Comanda E199 - livrare (3 seturi verzi, carnet+cană+pix)", "pix verde set liudmila.png")).toBe("pen");
    expect(best("set carnet rosu linii, pix rosu, cană cu mâiner roșu", "carnet_rosu_linii.png")).toBe("notebook");
  });

  it("keeps UV-DTF stickers and Oracal away from sheet stickers", () => {
    expect(best("uv dtf \\ stickere transparente 5x15 cm", "stickere transparente.rar")).toBe("uv_dtf");
    expect(best("", "20x35cm, oracal mat decupat pe contur.png")).toBe("large_format_print");
    expect(best("uv dtf nacleika", "dtf_nacleika.png")).toBe("uv_dtf");
  });

  it("reads heavy cut paper as postcards, 9×5 as business cards, big sheets as large format", () => {
    expect(best("", "12x18cm, 300g mat, 4 buc FRONT.jpg")).toBe("postcard");
    expect(best("250 ГР С ДВУХ СТОРОН 5,50x8,50")).toBe("business_card");
    expect(best("", "42x60_cm_250_gr_matt.jpg")).toBe("large_format_print");
    // Contour cut on named paper weight: a figured-cut card, not stickers.
    expect(best("200 gr matt cu taiere pe contur")).toBe("postcard");
  });

  it("returns a second suggestion when two types are named", () => {
    const hints = suggestLineTypes({ notes: "Cărți de vizită 48 buc și stickere o foaie A3" });
    expect(hints.map((h) => h.target)).toEqual(["business_card", "sticker_sheet"]);
  });

  it("handles Cyrillic «А4» and Romanian diacritics", () => {
    expect(normalizeHintText("Печать А2 бумага")).toContain("a2");
    expect(normalizeHintText("Cărți")).toBe("carti");
    expect(best("ватман А2")).toBe("large_format_print");
  });
});

describe("parseHintPrefill", () => {
  it("sticker: round 6,5 cm, run", () => {
    expect(parseHintPrefill("sticker_sheet", { notes: "наклейки круглые 6,5 см 200 шт" })).toEqual({
      quantity: 200,
      stickerShape: "circle",
      stickerWidthMm: 65,
      stickerHeightMm: 65,
    });
  });

  it("sticker: W×H in mm / cm and contour", () => {
    expect(parseHintPrefill("sticker_sheet", { notes: "стикеры 40x30 мм" })).toMatchObject({
      stickerShape: "rect",
      stickerWidthMm: 40,
      stickerHeightMm: 30,
    });
    expect(parseHintPrefill("sticker_sheet", { fileNames: ["stikere_cu_taiere_pe_contur_8x5_cm_30_buc.png"] })).toMatchObject({
      quantity: 30,
      stickerShape: "contour",
      stickerWidthMm: 80,
      stickerHeightMm: 50,
    });
    expect(parseHintPrefill("sticker_sheet", { notes: "наклейки 65 мм" })).toMatchObject({ stickerWidthMm: 65, stickerShape: "circle" });
  });

  it("postcard: purpose, preset, paper weight, crease", () => {
    expect(parseHintPrefill("postcard", { notes: "приглашения A5 300 гр с биговкой" })).toEqual({
      gsm: 300,
      postcardPurpose: "invitation",
      postcardPresetId: "pc_a5",
      creaseLines: 1,
    });
    expect(parseHintPrefill("postcard", { notes: "открытки 10x15 двухсторонние 50 шт" })).toMatchObject({
      quantity: 50,
      twoSided: true,
      postcardPurpose: "postcard",
      postcardPresetId: "pc_10x15",
    });
    expect(parseHintPrefill("postcard", { notes: "закладка 20 на 6 см 300 гр" })).toMatchObject({
      postcardPurpose: "bookmark",
      trimWidthCm: 20,
      trimHeightCm: 6,
    });
  });

  it("large format: A-size and ватман", () => {
    expect(parseHintPrefill("large_format_print", { notes: "ватман A1" })).toEqual({ lfWidthCm: 59.4, lfHeightCm: 84.1 });
    expect(parseHintPrefill("large_format_print", { notes: "постер A2" })).toEqual({ lfWidthCm: 42, lfHeightCm: 59.4 });
  });

  it("business card: run and sides", () => {
    expect(parseHintPrefill("business_card", { notes: "визитки 100 шт с двух сторон" })).toEqual({ quantity: 100, twoSided: true });
  });

  it("DTF keeps its own pieces (no quantity)", () => {
    expect(parseHintPrefill("dtf_apparel", { notes: "футболки dtf 20 шт" })).toEqual({});
  });
});

describe("parsers", () => {
  it("gsm", () => {
    expect(parseGsm("300 гр")).toBe(300);
    expect(parseGsm("a5 300g mat")).toBe(300);
    expect(parseGsm("250 gsm")).toBe(250);
    expect(parseGsm("200 штук")).toBeNull();
  });
  it("quantity", () => {
    expect(parseQuantity("20 шт")).toBe(20);
    expect(parseQuantity("108 buc")).toBe(108);
    expect(parseQuantity("тираж 500")).toBe(500);
    expect(parseQuantity("a4 цвет")).toBeNull();
  });
});
