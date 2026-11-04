import { describe, expect, it } from "vitest";
import { shopCheckoutRequestSchema } from "@/lib/shop/checkoutSchema";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { toSheetLinePublicSummary } from "@/lib/businessCard/sheetLinePublicSummary";
import { shouldTurnArtworkForFit } from "@/lib/businessCard/businessCardSheetPng";
import { shopBcFitOf, shopBcFitRect, shopBcPdfThumbUrl } from "./businessCards";
import { cartCount, checkoutLine, parseCart, serializeCart, type CartLine } from "./cart";
import { buildCheckoutBody, type CheckoutForm } from "./checkout";
import { draftFromForm } from "./checkoutDraft";
import { SHOP_STRING_KEYS, shopT } from "./i18n";
import { describeQuoteLine } from "./lineLabels";

const form = (over: Partial<CheckoutForm> = {}): CheckoutForm => ({
  name: "Ion Popescu",
  phone: "+37369123456",
  email: "",
  method: "courier_chisinau",
  city: "Bălți",
  address: "str. Independenței 5",
  note: "",
  acceptTerms: true,
  ...over,
});

const bcLine = (over: Partial<CartLine> = {}): CartLine => ({
  id: "bc",
  slug: "carti-de-vizita",
  title: "Cărți de vizită 90×50 mm",
  optionsText: "Doar față",
  image: "/business-cards.svg",
  quote: { kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 200 },
  files: [{ fileKey: "uploads/1762250000000-abcdefgh-f.png", fileName: "f.png", zone: "front", thumb: "data:image/jpeg;base64,AAAA" }],
  addedAt: 1,
  ...over,
});

describe("courier in Chișinău: the saved Moldova city is not sent", () => {
  it("the checkout body always says «Chișinău» for courier_chisinau", () => {
    expect(buildCheckoutBody(form(), [], "ro").delivery).toEqual({
      method: "courier_chisinau",
      city: "Chișinău",
      address: "str. Independenței 5",
    });
  });

  it("a Moldova-wide courier sends the typed city", () => {
    expect(buildCheckoutBody(form({ method: "courier_moldova" }), [], "ro").delivery.city).toBe("Bălți");
  });

  it("the draft keeps the Moldova city, so switching back restores it", () => {
    expect(draftFromForm(form()).city).toBe("Bălți");
  });

  it("the server schema forces «Chișinău» whatever city is sent", () => {
    const raw = {
      ...buildCheckoutBody(form({ method: "courier_moldova" }), [], "ro"),
      lines: [{ quote: {}, title: "X" }],
    };
    raw.delivery = { ...raw.delivery, method: "courier_chisinau" };
    const parsed = shopCheckoutRequestSchema.safeParse(raw);
    expect(parsed.success && parsed.data.delivery.city).toBe("Chișinău");
    const moldova = shopCheckoutRequestSchema.safeParse({ ...raw, delivery: { ...raw.delivery, method: "courier_moldova" } });
    expect(moldova.success && moldova.data.delivery.city).toBe("Bălți");
  });

  it("a Chișinău courier order without a city still parses (the address is required)", () => {
    const parsed = shopCheckoutRequestSchema.safeParse({
      ...buildCheckoutBody(form(), [], "ro"),
      delivery: { method: "courier_chisinau", address: "str. X 1" },
      lines: [{ quote: {}, title: "X" }],
    });
    expect(parsed.success && parsed.data.delivery.city).toBe("Chișinău");
  });
});

describe("business-card fit (crop to fill / fit with white margins)", () => {
  it("a square image: cover crops top / bottom, contain leaves side margins", () => {
    const card = { width: 94, height: 54 };
    expect(shopBcFitRect({ width: 1200, height: 1200 }, card, "cover")).toEqual({ x: 0, y: -20, width: 94, height: 94 });
    expect(shopBcFitRect({ width: 1200, height: 1200 }, card, "contain")).toEqual({ x: 20, y: 0, width: 54, height: 54 });
  });

  it("defaults to crop / fill", () => {
    expect(shopBcFitOf({})).toBe("cover");
    expect(shopBcFitOf({ fit: "contain" })).toBe("contain");
    expect(shopBcFitOf({ fit: "stretch" })).toBe("cover");
  });

  it("the public quote takes a fit only on a shop pack", () => {
    const pack = { kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 100 };
    expect(parsePublicQuoteLine({ ...pack, fit: "contain" })).toMatchObject({ ok: true, line: { fit: "contain" } });
    expect(parsePublicQuoteLine({ ...pack, fit: "fill" }).ok).toBe(false);
    expect(
      parsePublicQuoteLine({
        kind: "businessCard",
        sheetPaperId: "6f1c1a3e-2222-4a2b-9c3d-123456789abc",
        sides: "one",
        quantity: 100,
        fit: "cover",
      }).ok,
    ).toBe(false);
  });

  it("the cart / staff options name the fit in every language", () => {
    const quote = { kind: "businessCard", pricing: "shopPack", sides: "two", quantity: 200, fit: "contain" } as const;
    const none = { variants: {}, garments: {}, prints: {} };
    expect(describeQuoteLine(quote, none, shopT("ro"))?.optionsText).toBe("Față + verso · Încadrează (margini albe)");
    expect(describeQuoteLine(quote, none, shopT("ru"))?.optionsText).toBe("Лицо + оборот · Вписать (белые поля)");
    expect(describeQuoteLine({ ...quote, fit: "cover" }, none, shopT("en"))?.optionsText).toBe("Front + back · Fill (crop)");
    expect(describeQuoteLine({ ...quote, fit: undefined }, none, shopT("ro"))?.optionsText).toBe("Față + verso");
  });

  it("the fit strings exist in ro, ru and en", () => {
    for (const k of ["bcFit", "bcFitCover", "bcFitContain", "bcFitHint", "bcCheckProportions"] as const) {
      expect(SHOP_STRING_KEYS).toContain(k);
      for (const lang of ["ro", "ru", "en"] as const) expect(shopT(lang)(k)).not.toBe(k);
    }
  });

  it("the admin line shows the fit (staff view only)", () => {
    const data = {
      quantity: 200,
      cardsPerSheet: 12,
      sheetsUsed: 17,
      cardWidthCm: 9.4,
      cardHeightCm: 5.4,
      sides: "one",
      paperSnapshot: { name: "A4+ 350gr", sheetWidthCm: 22.5, sheetHeightCm: 32 },
      layout: {},
      artworkFit: "contain",
    };
    expect(toSheetLinePublicSummary(data, { production: true })?.artworkFit).toBe("contain");
    expect(toSheetLinePublicSummary(data, { production: false })?.artworkFit).toBeUndefined();
    expect(toSheetLinePublicSummary({ ...data, artworkFit: undefined }, { production: true })?.artworkFit).toBeUndefined();
  });

  it("on a turned slot a square / landscape face turns with the card; a portrait one does not", () => {
    const slot = { rotated: true, widthCm: 5.4, heightCm: 9.4 };
    expect(shouldTurnArtworkForFit(1200, 1200, slot)).toBe(true);
    expect(shouldTurnArtworkForFit(1110, 638, slot)).toBe(true);
    expect(shouldTurnArtworkForFit(638, 1110, slot)).toBe(false);
    expect(shouldTurnArtworkForFit(1200, 1200, { ...slot, rotated: false })).toBe(false);
  });
});

describe("cart UX", () => {
  it("the badge counts lines: 200 business cards are one product", () => {
    expect(cartCount([bcLine()])).toBe(1);
    expect(cartCount([bcLine(), bcLine({ id: "b2" })])).toBe(2);
  });

  it("keeps the face thumbnail in storage, drops a bad one, never sends it to the checkout", () => {
    const [line] = parseCart(serializeCart([bcLine()]));
    expect(line!.files[0]!.thumb).toBe("data:image/jpeg;base64,AAAA");
    const bad = parseCart(
      serializeCart([bcLine({ files: [{ fileKey: "uploads/x", fileName: "f.png", thumb: "javascript:alert(1)" }] })]),
    );
    expect(bad[0]!.files[0]).not.toHaveProperty("thumb");
    expect(checkoutLine(line!).files![0]).toEqual({ fileKey: "uploads/1762250000000-abcdefgh-f.png", fileName: "f.png", zone: "front" });
  });

  it("drops a stored business-card line with an unknown fit", () => {
    const quote = { kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 200, fit: "stretch" };
    expect(parseCart(JSON.stringify({ v: 1, lines: [{ ...bcLine(), quote }] }))).toHaveLength(0);
    expect(parseCart(JSON.stringify({ v: 1, lines: [{ ...bcLine(), quote: { ...quote, fit: "contain" } }] }))).toHaveLength(1);
  });

  it("a PDF face gets a «PDF» card thumbnail", () => {
    const url = shopBcPdfThumbUrl();
    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    expect(decodeURIComponent(url)).toContain(">PDF</text>");
  });

  it("the add-to-cart confirmation strings exist in ro, ru and en", () => {
    expect([shopT("ro")("addedToCart"), shopT("ru")("addedToCart"), shopT("en")("addedToCart")]).toEqual([
      "Adăugat în coș",
      "Добавлено в корзину",
      "Added to cart",
    ]);
  });
});
