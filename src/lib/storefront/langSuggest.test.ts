import { describe, expect, it } from "vitest";
import { SHOP_LANGS, shopT } from "./i18n";
import { hasShopLangChoice, isBotUserAgent, preferredShopLang, shopLangSuggestion } from "./langSuggest";

const CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

describe("preferredShopLang", () => {
  it("takes the first language we have, by primary subtag", () => {
    expect(preferredShopLang(["ru-RU", "ro"])).toBe("ru");
    expect(preferredShopLang(["de-DE", "en-US", "ru"])).toBe("en");
    expect(preferredShopLang(["ro-MD", "ru"])).toBe("ro");
    expect(preferredShopLang(["mo"])).toBe("ro");
    expect(preferredShopLang(["de", "fr"])).toBeNull();
    expect(preferredShopLang([])).toBeNull();
  });
});

describe("shopLangSuggestion", () => {
  const base = { current: "ro" as const, chosen: false, userAgent: CHROME };

  it("suggests Russian or English to a first visitor on the Romanian page", () => {
    expect(shopLangSuggestion({ ...base, browserLangs: ["ru-RU", "ru", "en"] })).toBe("ru");
    expect(shopLangSuggestion({ ...base, browserLangs: ["en-GB"] })).toBe("en");
  });

  it("stays quiet once a language was chosen (cookie set)", () => {
    expect(shopLangSuggestion({ ...base, chosen: true, browserLangs: ["ru"] })).toBeNull();
  });

  it("stays quiet when the browser already matches, prefers Romanian or nothing we have", () => {
    expect(shopLangSuggestion({ ...base, current: "ru", browserLangs: ["ru"] })).toBeNull();
    expect(shopLangSuggestion({ ...base, browserLangs: ["ro-RO", "ru"] })).toBeNull();
    expect(shopLangSuggestion({ ...base, current: "en", browserLangs: ["ro"] })).toBeNull();
    expect(shopLangSuggestion({ ...base, browserLangs: ["de"] })).toBeNull();
  });

  it("never shows to crawlers", () => {
    for (const ua of ["Googlebot/2.1", "Mozilla/5.0 (compatible; YandexBot/3.0)", "facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/130"]) {
      expect(isBotUserAgent(ua)).toBe(true);
      expect(shopLangSuggestion({ ...base, userAgent: ua, browserLangs: ["ru"] })).toBeNull();
    }
    expect(isBotUserAgent(CHROME)).toBe(false);
  });
});

describe("hasShopLangChoice", () => {
  it("finds the shop_lang cookie only", () => {
    expect(hasShopLangChoice("a=1; shop_lang=ru")).toBe(true);
    expect(hasShopLangChoice("shop_lang=ro")).toBe(true);
    expect(hasShopLangChoice("x_shop_lang=ru; b=2")).toBe(false);
    expect(hasShopLangChoice("")).toBe(false);
  });
});

describe("banner texts", () => {
  it("has the offer and a «stay in …» for every language pair", () => {
    for (const s of SHOP_LANGS) {
      const t = shopT(s);
      expect(t("langSuggestText")).not.toBe("langSuggestText");
      for (const c of SHOP_LANGS) expect(t(`langSuggestStay_${c}`)).toMatch(/\S/);
    }
    expect(shopT("ru")("langSuggestStay_ro")).toBe("Остаться на румынском");
    expect(shopT("en")("langSuggestStay_ro")).toBe("Stay in Romanian");
  });
});
