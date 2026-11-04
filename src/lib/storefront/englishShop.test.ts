import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LegalPage } from "@/components/shop/LegalPage";
import { mapShopCatalog, SHOP_CATEGORIES, SHOP_PRODUCTS } from "./catalogConfig";
import { formatOrderDate, formatPrice } from "./format";
import { itemsLabel, parseShopLang, pickLocalized, SHOP_LANGS, SHOP_STRING_KEYS, shopT } from "./i18n";
import { SHOP_LEGAL_TEXTS, type ShopLegalDoc } from "./legalTexts.generated";
import { shopLayoutMetadata } from "./shopMetadata";
import { contactName, formatShopHours } from "./studioText";
import { shopCheckoutRequestSchema } from "@/lib/shop/checkoutSchema";
import { DEFAULT_STUDIO_INFO } from "@/lib/studioInfo/studioInfo";

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort();

describe("English storefront dictionary", () => {
  it("has every Romanian key, non-empty, with the same {placeholders}", () => {
    const ro = shopT("ro");
    const en = shopT("en");
    for (const key of SHOP_STRING_KEYS) {
      const text: string = en(key);
      expect(text.trim(), key).not.toBe("");
      expect(placeholders(text), key).toEqual(placeholders(ro(key)));
    }
  });

  it("is actually English (differs from Romanian except for shared codes)", () => {
    const ro = shopT("ro");
    const en = shopT("en");
    const same = SHOP_STRING_KEYS.filter((k) => en(k) === ro(k));
    expect(same.sort()).toEqual(["capLogoSize", "design", "footerCompany", "idno", "tierFrom", "tierRange", "total"].sort());
  });

  it("keeps «lei» in prices and fills placeholders", () => {
    expect(formatPrice(45, "en")).toBe("45\u00a0lei");
    expect(formatPrice(12.5, "en")).toBe("12,50\u00a0lei");
    expect(shopT("en")("fromPrice", { price: formatPrice(200, "en") })).toBe("from 200\u00a0lei");
    expect(shopT("en")("topDeliveryCity")).toContain("45 lei");
  });

  it("formats dates and opening hours in English", () => {
    expect(formatOrderDate("2026-11-04T10:00:00Z", "en")).toBe("4 November 2026");
    expect(formatShopHours(DEFAULT_STUDIO_INFO.hours, "en")).toMatch(/^Mon/);
    expect(contactName("Ангелина", "en")).toBe("Anghelina");
  });
});

describe("itemsLabel (en)", () => {
  it("uses item / items", () => {
    expect(itemsLabel(1, "en")).toBe("1 item");
    expect(itemsLabel(0, "en")).toBe("0 items");
    expect(itemsLabel(2, "en")).toBe("2 items");
    expect(itemsLabel(21, "en")).toBe("21 items");
  });
});

describe("parseShopLang", () => {
  it("accepts ro, ru and en; anything else is Romanian", () => {
    expect(SHOP_LANGS).toEqual(["ro", "ru", "en"]);
    expect(parseShopLang("en")).toBe("en");
    expect(parseShopLang("ru")).toBe("ru");
    expect(parseShopLang("ro")).toBe("ro");
    expect(parseShopLang(undefined)).toBe("ro");
    expect(parseShopLang("EN")).toBe("ro");
    expect(parseShopLang("de")).toBe("ro");
    expect(parseShopLang("")).toBe("ro");
  });
});

describe("English catalog copy", () => {
  it("every product, option and category has English text", () => {
    for (const c of SHOP_CATEGORIES) expect(c.name.en, c.slug).toBeTruthy();
    for (const p of SHOP_PRODUCTS) {
      for (const field of [p.name, p.subtitle, p.description, ...(p.badge ? [p.badge] : [])]) {
        expect(field.en, p.slug).toBeTruthy();
        expect(field.en, p.slug).not.toBe(field.ru);
      }
      for (const o of p.options) expect(o.label.en, o.sku).toBeTruthy();
    }
  });

  it("falls back to Romanian, not Russian, when a value is empty", () => {
    expect(pickLocalized({ ro: "Cană", ru: "Кружка", en: "" }, "en")).toBe("Cană");
  });

  it("maps the catalog in English", () => {
    const { categories } = mapShopCatalog([], [], "en");
    expect(categories).toEqual([]);
    const mug = SHOP_PRODUCTS.find((p) => p.slug === "cana-alba")!;
    expect(pickLocalized(mug.name, "en")).toBe("White mug with your print");
  });
});

describe("English metadata", () => {
  it("gives the English title and description", () => {
    const m = shopLayoutMetadata(null, {}, "en");
    expect(m.title).toEqual({ default: "ANVI — personalised products", template: "%s · ANVI" });
    expect(String(m.description)).toContain("Chișinău");
  });
});

describe("English legal pages", () => {
  const DOCS: ShopLegalDoc[] = ["termeni", "retur", "confidentialitate"];

  it("have their own English text with [TO CONFIRM: …] placeholders", () => {
    for (const doc of DOCS) {
      const t = SHOP_LEGAL_TEXTS[doc]!;
      expect(t.en, doc).not.toBe(t.ro);
      expect(t.en, doc).toMatch(/^# /);
      expect(t.en, doc).toContain("[TO CONFIRM:");
      expect(t.en, doc).not.toContain("DE CONFIRMAT");
      expect(t.en, doc).not.toContain("ПОДТВЕРДИТЬ");
      // Same number of sections as the Romanian original.
      const h2 = (s: string) => s.split("\n").filter((l) => l.startsWith("## ")).length;
      expect(h2(t.en), doc).toBe(h2(t.ro));
    }
  });

  it("render with the translated draft banner", () => {
    const html = renderToStaticMarkup(createElement(LegalPage, { doc: "termeni", lang: "en" }));
    expect(html).toContain("Text pending approval");
    expect(html).toContain("Terms and conditions of sale");
    expect(html).toContain("[TO CONFIRM: publication date]");
    expect(html).not.toContain("Termeni și condiții");
  });
});

describe("checkout request locale", () => {
  const body = (locale: unknown) => ({
    locale,
    customer: { name: "John Smith", phone: "+373 69 123 456" },
    delivery: { method: "pickup" },
    lines: [{ quote: { kind: "mug", productId: "mug-1", quantity: 1 }, files: [], title: "Mug" }],
    acceptTerms: true,
  });

  it("accepts en (an English page can place an order) and still refuses unknown languages", () => {
    const en = shopCheckoutRequestSchema.safeParse(body("en"));
    expect(en.success && en.data.locale).toBe("en");
    expect(shopCheckoutRequestSchema.safeParse(body("de")).success).toBe(false);
  });
});
