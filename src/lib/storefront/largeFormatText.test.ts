import { describe, expect, it } from "vitest";
import { SHOP_LF_PRODUCTS } from "./largeFormat";
import { LF_PRODUCT_COPY, LF_TEXT, LF_TEXT_KEYS, lfText } from "./largeFormatText";

describe("wide-format copy", () => {
  it("every string in ro, ru and en, Russian and English not left in Romanian", () => {
    for (const k of LF_TEXT_KEYS) {
      const v = LF_TEXT[k];
      expect(v.ro && v.ru && v.en, k).toBeTruthy();
      expect(v.ru, k).not.toBe(v.ro);
    }
    for (const p of SHOP_LF_PRODUCTS) {
      for (const v of [LF_PRODUCT_COPY[p].subtitle, LF_PRODUCT_COPY[p].description]) {
        expect(v.ro && v.ru && v.en).toBeTruthy();
        expect(v.ru).not.toBe(v.ro);
        expect(v.en).not.toBe(v.ro);
      }
    }
  });

  it("fills placeholders", () => {
    expect(lfText("ru")("tooWide", { w: "132" })).toContain("132 см");
    expect(lfText("en")("dpiOk", { dpi: 80, size: "200×100 cm" })).toBe("Acceptable resolution: 80 dpi at 200×100 cm — looks fine from 1–2 m.");
  });
});
