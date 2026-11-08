import { describe, expect, it } from "vitest";
import { libraryEn } from "./en";
import { libraryRo } from "./ro";
import { libraryRu } from "./ru";
import { libraryErrorText, libraryMetaText } from "@/app/admin/_components/library/libraryClient";

describe("library dictionaries", () => {
  it("have the same keys in every language", () => {
    const keys = (o: object) => Object.keys(o).sort();
    expect(keys(libraryRo)).toEqual(keys(libraryRu));
    expect(keys(libraryEn)).toEqual(keys(libraryRu));
    expect(keys(libraryRo.errors)).toEqual(keys(libraryRu.errors));
    expect(keys(libraryEn.errors)).toEqual(keys(libraryRu.errors));
  });

  it("pluralise use counts", () => {
    expect(libraryRu.uses(0)).toBe("ещё не использован");
    expect(libraryRu.uses(1)).toBe("использован 1 раз");
    expect(libraryRu.uses(3)).toBe("использован 3 раза");
    expect(libraryRu.uses(12)).toBe("использован 12 раз");
    expect(libraryRo.uses(1)).toBe("folosită o dată");
    expect(libraryRo.uses(5)).toBe("folosită de 5 ori");
    expect(libraryEn.uses(1)).toBe("used 1 time");
    expect(libraryEn.uses(2)).toBe("used 2 times");
  });

  it("pluralise the completion hint", () => {
    expect(libraryRu.hintText("0012", 2)).toContain("2 файла");
    expect(libraryRu.hintText("0012", 5)).toContain("5 файлов");
    expect(libraryRo.hintText("0012", 1)).toContain("1 fișier nu este");
    expect(libraryRo.hintText("0012", 25)).toContain("25 de fișiere nu sunt");
    expect(libraryEn.hintText("0012", 1)).toContain("1 file not");
  });
});

describe("libraryErrorText", () => {
  it("translates known codes and keeps the server text otherwise", () => {
    expect(libraryErrorText(libraryRo, { code: "source_missing", error: "Файл уже удалён" })).toBe(
      libraryRo.errors.source_missing,
    );
    expect(libraryErrorText(libraryEn, { code: "in_use", references: 3 })).toBe(libraryEn.inUse(3));
    expect(libraryErrorText(libraryEn, { code: "weird", error: "Boom" })).toBe("Boom");
    expect(libraryErrorText(libraryEn, {})).toBe(libraryEn.requestFailed);
  });
});

describe("libraryMetaText", () => {
  const item = {
    sizeBytes: 2.5 * 1024 * 1024,
    pixelWidth: 3000,
    pixelHeight: 2000,
    dpi: 300,
    widthMm: 254,
    heightMm: 169.3,
    pageCount: 2,
  };
  it("uses the language's units and number format", () => {
    expect(libraryMetaText(item, libraryRu.meta)).toBe("2,5 МБ · 3000×2000 px · 300 dpi · 25,4×16,9 см · 2 стр.");
    expect(libraryMetaText(item, libraryEn.meta)).toBe("2.5 MB · 3000×2000 px · 300 dpi · 25.4×16.9 cm · 2 pp.");
  });
});
