import { describe, expect, it } from "vitest";
import { paperFormatLabelRu, paperLineLabelRu, shopPaperProductNameRu } from "./paperLineLabel";

describe("paperFormatLabelRu", () => {
  it("keeps standard formats and «mixed»", () => {
    expect(paperFormatLabelRu("A4")).toBe("A4");
    expect(paperFormatLabelRu("mixed")).toBe("mixed");
  });
  it("turns a stored custom size into human text with a decimal comma", () => {
    expect(paperFormatLabelRu("other:21x14.8")).toBe("21×14,8 см");
    expect(paperFormatLabelRu("other:10x15")).toBe("10×15 см");
  });
});

describe("paperLineLabelRu", () => {
  const calendar = { kind: "sheetShop", title: "Calendar de birou", quote: { kind: "sheetShop", product: "calendarDesk" } };
  it("prefers the storefront product name", () => {
    expect(shopPaperProductNameRu(calendar)).toBe("Календарь настольный на пружине");
    expect(paperLineLabelRu("other:21x14.8", calendar)).toBe("Календарь настольный на пружине · 21×14,8 см");
  });
  it("studio lines, other kinds and unknown products: the format alone", () => {
    expect(paperLineLabelRu("other:21x14.8")).toBe("21×14,8 см");
    expect(paperLineLabelRu("A4", { kind: "print", quote: { kind: "print" } })).toBe("A4");
    expect(paperLineLabelRu("A4", { kind: "sheetShop", quote: { product: "nope" } })).toBe("A4");
    expect(shopPaperProductNameRu(null)).toBeNull();
  });
});
