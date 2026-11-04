import { describe, expect, it } from "vitest";
import { businessCardFileFrame } from "./businessCardFileFrame";
import { fileMetaWarns, formatFileMeta, type FileMetaJson, type FileMetaText } from "./fileMetaFormat";
import { ru } from "@/lib/i18n/ru";

const RU: FileMetaText = ru.fileMeta;
const CARD_94x54 = { widthMm: 94, heightMm: 54, trimWidthMm: 90, trimHeightMm: 50 };

function raster(pw: number, ph: number, dpi: number | null, card: FileMetaJson["card"] = CARD_94x54): FileMetaJson {
  const mm = (px: number): number | null => (dpi ? (px / dpi) * 25.4 : null);
  return {
    sizeBytes: 1.2 * 1024 * 1024,
    pixelWidth: pw,
    pixelHeight: ph,
    dpi,
    widthMm: mm(pw),
    heightMm: mm(ph),
    pageCount: null,
    metaStatus: "ok",
    card,
  };
}

function pdf(wMm: number, hMm: number, card: FileMetaJson["card"] = CARD_94x54): FileMetaJson {
  return { sizeBytes: 200 * 1024, pixelWidth: null, pixelHeight: null, dpi: null, widthMm: wMm, heightMm: hMm, pageCount: 1, metaStatus: "ok", card };
}

describe("formatFileMeta — business-card artwork", () => {
  it("measures a square 72 dpi PNG against 94×54 mm and flags the proportions", () => {
    const m = raster(1200, 1200, 72);
    expect(formatFileMeta(m, RU, "ru")).toBe("1200×1200 px · ~324 dpi на 94×54 мм · пропорции не 94×54 · 1,2 МБ");
    expect(fileMetaWarns(m, RU, "ru")).toBe(true);
  });

  it("a 94×54 mm file at 300 dpi reads ~300 dpi with no warning", () => {
    const m = raster(1110, 638, 300);
    expect(formatFileMeta(m, RU, "ru")).toBe("1110×638 px · ~300 dpi на 94×54 мм · 1,2 МБ");
    expect(fileMetaWarns(m, RU, "ru")).toBe(false);
  });

  it("ignores the dpi written in the file (none here)", () => {
    expect(formatFileMeta(raster(1110, 638, null), RU, "ru")).toBe("1110×638 px · ~300 dpi на 94×54 мм · 1,2 МБ");
  });

  it("says when the artwork has trim proportions (no bleed)", () => {
    expect(formatFileMeta(raster(1063, 591, 300), RU, "ru")).toBe(
      "1063×591 px · ~287 dpi на 94×54 мм · пропорции 90×50 — без вылетов · 1,2 МБ",
    );
  });

  it("measures a vertical card against 54×94 mm", () => {
    expect(formatFileMeta(raster(638, 1110, 300), RU, "ru")).toBe("638×1110 px · ~300 dpi на 54×94 мм · 1,2 МБ");
  });

  it("uses the line's card size (85×55 trim → 89×59)", () => {
    const card = { widthMm: 89, heightMm: 59, trimWidthMm: 85, trimHeightMm: 55 };
    expect(formatFileMeta(raster(1051, 697, 300, card), RU, "ru")).toBe("1051×697 px · ~300 dpi на 89×59 мм · 1,2 МБ");
  });

  it("PDF: says whether the page is 94×54, 90×50 or neither", () => {
    expect(formatFileMeta(pdf(94, 54), RU, "ru")).toBe("94×54 мм · размер с вылетами · 200 КБ");
    expect(formatFileMeta(pdf(90.1, 50), RU, "ru")).toBe("90,1×50 мм · размер без вылетов · 200 КБ");
    expect(formatFileMeta(pdf(210, 297), RU, "ru")).toBe("210×297 мм · не 94×54 / 90×50 · 200 КБ");
    expect(fileMetaWarns(pdf(94, 54), RU, "ru")).toBe(false);
    expect(fileMetaWarns(pdf(210, 297), RU, "ru")).toBe(true);
  });

  it("still says when the file is gone from storage", () => {
    expect(formatFileMeta({ ...pdf(94, 54), metaStatus: "missing" }, RU, "ru")).toBe("файла уже нет в хранилище");
  });
});

describe("formatFileMeta — other files unchanged", () => {
  it("keeps the dpi-based line when there is no card", () => {
    const m = raster(1200, 1200, 72, null);
    expect(formatFileMeta(m, RU, "ru")).toBe("42,3×42,3 см · 72 dpi · 1200×1200 px · 1,2 МБ");
    expect(fileMetaWarns(m, RU, "ru")).toBe(false);
    expect(formatFileMeta({ ...m, card: undefined }, RU, "ru")).toBe("42,3×42,3 см · 72 dpi · 1200×1200 px · 1,2 МБ");
    expect(fileMetaWarns(raster(1200, 1200, null, null), RU, "ru")).toBe(true);
  });
});

describe("businessCardFileFrame", () => {
  it("is null for files that are not business-card artwork", () => {
    expect(businessCardFileFrame(null, null)).toBeNull();
    expect(businessCardFileFrame("large_format", { cardWidthCm: 9.4 })).toBeNull();
  });

  it("defaults to 94×54 mm with a 90×50 trim", () => {
    expect(businessCardFileFrame("business_card_back", null)).toEqual(CARD_94x54);
  });

  it("takes the card size from the line", () => {
    const line = {
      quantity: 100,
      cardsPerSheet: 21,
      sheetsUsed: 5,
      cardWidthCm: 8.9,
      cardHeightCm: 5.9,
      cardTrimWidthCm: 8.5,
      cardTrimHeightCm: 5.5,
      paperSnapshot: {},
      layout: {},
    };
    expect(businessCardFileFrame("business_card_front", line)).toEqual({
      widthMm: 89,
      heightMm: 59,
      trimWidthMm: 85,
      trimHeightMm: 55,
    });
  });
});
