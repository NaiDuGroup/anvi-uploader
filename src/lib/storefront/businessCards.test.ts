import { describe, expect, it } from "vitest";
import { BUSINESS_CARD_BLEED_CM, findBusinessCardPreset } from "@/lib/businessCard/businessCardConstants";
import { buildRepeatLines } from "@/lib/shop/account/accountRules";
import { shopBusinessCardProduct } from "./businessCardProduct";
import {
  SHOP_BC_BACK_PER_CARD_MDL,
  SHOP_BC_BLEED_MM,
  SHOP_BC_FILE_MM,
  SHOP_BC_PACKS,
  SHOP_BC_PRESET_ID,
  SHOP_BC_PRICE_PER_CARD_MDL,
  SHOP_BC_SLUG,
  SHOP_BC_TRIM_MM,
  checkShopBcArtwork,
  shopBcExpectedPx,
  shopBcTemplateSvg,
  shopBcTotalMdl,
} from "./businessCards";
import { canStepQuantity, cartReducer, checkoutLine, parseCart, serializeCart, type CartLine } from "./cart";
import { kindNeedsFile, lineMissingFile } from "./fileRules";
import { SHOP_LANGS, SHOP_STRING_KEYS, shopT } from "./i18n";
import { EMPTY_LINE_LABELS, describeQuoteLine } from "./lineLabels";
import type { ShopQuoteLine } from "./types";

const pack = (sides: "one" | "two", quantity = 100): ShopQuoteLine => ({ kind: "businessCard", pricing: "shopPack", sides, quantity });

describe("business-card pricing (one place)", () => {
  it("is 1.5 lei per card, +0.5 for the back, at every pack", () => {
    expect(SHOP_BC_PRICE_PER_CARD_MDL).toBe(1.5);
    expect(SHOP_BC_BACK_PER_CARD_MDL).toBe(0.5);
    expect(SHOP_BC_PACKS).toEqual([100, 200, 300, 500, 1000]);
    expect(SHOP_BC_PACKS.map((n) => shopBcTotalMdl(n, "one"))).toEqual([150, 300, 450, 750, 1500]);
    expect(SHOP_BC_PACKS.map((n) => shopBcTotalMdl(n, "two"))).toEqual([200, 400, 600, 1000, 2000]);
  });

  it("prices only the packs", () => {
    expect(shopBcTotalMdl(150, "one")).toBeNull();
    expect(shopBcTotalMdl(0, "one")).toBeNull();
    expect(shopBcTotalMdl(100, "three" as "one")).toBeNull();
  });

  it("matches the studio preset and bleed", () => {
    const preset = findBusinessCardPreset(SHOP_BC_PRESET_ID)!;
    expect(preset.trimWidthCm * 10).toBe(SHOP_BC_TRIM_MM.width);
    expect(preset.trimHeightCm * 10).toBe(SHOP_BC_TRIM_MM.height);
    expect(BUSINESS_CARD_BLEED_CM * 10).toBe(SHOP_BC_BLEED_MM);
    expect(SHOP_BC_FILE_MM).toEqual({ width: 94, height: 54 });
    expect(shopBcExpectedPx()).toEqual({ width: 1110, height: 638 });
  });
});

describe("business-card artwork check", () => {
  it("a 94×54 mm file at 300 dpi is fine (either orientation)", () => {
    expect(checkShopBcArtwork({ px: { width: 1110, height: 638 } })).toMatchObject({ ok: true, issues: [], dpi: 300 });
    expect(checkShopBcArtwork({ px: { width: 638, height: 1110 } })).toMatchObject({ ok: true });
    expect(checkShopBcArtwork({ px: { width: 2220, height: 1276 } })).toMatchObject({ ok: true, dpi: 600 });
  });

  it("flags a file made at 90×50 without bleed", () => {
    expect(checkShopBcArtwork({ px: { width: 1063, height: 591 } })?.issues).toContain("no_bleed");
  });

  it("flags low resolution and wrong proportions", () => {
    expect(checkShopBcArtwork({ px: { width: 555, height: 319 } })).toMatchObject({ ok: false, issues: ["low_dpi"], dpi: 150 });
    expect(checkShopBcArtwork({ px: { width: 1200, height: 1200 } })?.issues).toEqual(["wrong_proportions"]);
  });

  it("judges a PDF by its page size", () => {
    expect(checkShopBcArtwork({ pageMm: { width: 94, height: 54 } })).toMatchObject({ ok: true, sizeMm: { width: 94, height: 54 } });
    expect(checkShopBcArtwork({ pageMm: { width: 54, height: 94 } })?.ok).toBe(true);
    expect(checkShopBcArtwork({ pageMm: { width: 90, height: 50 } })?.issues).toEqual(["no_bleed"]);
    expect(checkShopBcArtwork({ pageMm: { width: 210, height: 297 } })?.issues).toEqual(["wrong_proportions"]);
    expect(checkShopBcArtwork({ pageMm: { width: 47, height: 27 } })?.issues).toEqual(["too_small"]);
  });

  it("nothing measured → null (no verdict)", () => {
    expect(checkShopBcArtwork({ px: null })).toBeNull();
    expect(checkShopBcArtwork({ pageMm: null })).toBeNull();
  });

  it("the template is a 94×54 mm SVG with the cut line and safe zone", () => {
    const svg = shopBcTemplateSvg({ bleed: "B", trim: "T <90>", safe: "S" });
    expect(svg).toContain('width="94mm" height="54mm"');
    expect(svg).toContain('x="2" y="2" width="90" height="50"');
    expect(svg).toContain('x="6" y="6" width="82" height="42"');
    expect(svg).toContain("T &lt;90&gt;");
  });
});

describe("business-card cart line", () => {
  const line: CartLine = {
    id: "l1",
    slug: SHOP_BC_SLUG,
    title: "Cărți de vizită 90×50 mm",
    optionsText: "Față + verso",
    image: null,
    quote: pack("two", 200),
    files: [
      { fileKey: "uploads/1762250000000-a-f.png", fileName: "f.png", zone: "front", lowRes: true },
      { fileKey: "uploads/1762250000000-b-b.pdf", fileName: "b.pdf", zone: "back" },
    ],
    addedAt: 1,
  };

  it("survives localStorage; other runs and shapes are dropped", () => {
    expect(parseCart(serializeCart([line]))[0]?.quote).toEqual(pack("two", 200));
    expect(parseCart(serializeCart([{ ...line, quote: pack("two", 150) }]))).toEqual([]);
    expect(parseCart(serializeCart([{ ...line, quote: { ...pack("one"), pricing: undefined } as unknown as ShopQuoteLine }]))).toEqual([]);
  });

  it("the pack is changed on the product page, not with the cart stepper", () => {
    expect(canStepQuantity(line.quote)).toBe(false);
    expect(cartReducer([line], { type: "setQty", id: "l1", quantity: 7 })[0]!.quote).toEqual(pack("two", 200));
  });

  it("sends each file with its face, without client hints", () => {
    expect(checkoutLine(line).files).toEqual([
      { fileKey: line.files[0]!.fileKey, fileName: "f.png", zone: "front" },
      { fileKey: line.files[1]!.fileKey, fileName: "b.pdf", zone: "back" },
    ]);
  });

  it("files are required: front, and back when double-sided", () => {
    expect(kindNeedsFile("businessCard")).toBe(true);
    expect(lineMissingFile(line)).toBe(false);
    expect(lineMissingFile({ ...line, files: [line.files[0]!] })).toBe(true);
    expect(lineMissingFile({ ...line, files: [] })).toBe(true);
    expect(lineMissingFile({ ...line, quote: pack("one"), files: [{ fileKey: "k", fileName: "x.pdf" }] })).toBe(false);
  });

  it("«Repetă comanda» gives each stored file its face back", () => {
    const { lines } = buildRepeatLines(
      [
        {
          shopLineData: { title: "Visitki", quote: pack("two", 200) },
          files: [
            { fileUrl: "shop-orders/1762250000000-a.png", fileName: "a.png", paperType: "business_card_front", sizeBytes: null, metaStatus: null },
            { fileUrl: "shop-orders/1762250000000-b.png", fileName: "b.png", paperType: "business_card_back", sizeBytes: null, metaStatus: null },
          ],
        },
      ],
      () => ({ slug: SHOP_BC_SLUG, image: null }),
    );
    expect(lines[0]!.files.map((f) => f.zone)).toEqual(["front", "back"]);
  });
});

describe("business-card texts (ro / ru / en)", () => {
  it("name the line in every language without the catalog", () => {
    expect(describeQuoteLine(pack("one"), EMPTY_LINE_LABELS, shopT("ro"))).toEqual({
      slug: SHOP_BC_SLUG,
      title: "Cărți de vizită 90×50 mm",
      optionsText: "Doar față",
    });
    expect(describeQuoteLine(pack("two"), EMPTY_LINE_LABELS, shopT("ru"))).toEqual({
      slug: SHOP_BC_SLUG,
      title: "Визитки 90×50 мм",
      optionsText: "Лицо + оборот",
    });
    expect(describeQuoteLine(pack("two"), EMPTY_LINE_LABELS, shopT("en"))?.title).toBe("Business cards 90×50 mm");
  });

  it("every bc string exists, differs per language and keeps its placeholders", () => {
    const ro = shopT("ro");
    const keys = SHOP_STRING_KEYS.filter((k) => k.startsWith("bc"));
    expect(keys.length).toBeGreaterThan(30);
    for (const lang of SHOP_LANGS) {
      const t = shopT(lang);
      for (const k of keys) expect(t(k).trim(), `${lang}.${k}`).not.toBe("");
    }
    for (const k of keys) {
      expect(shopT("ru")(k), k).not.toBe(ro(k));
      expect(shopT("en")(k), k).not.toBe(ro(k));
    }
    expect(shopT("ru")("bcNav")).toBe("Визитки");
    expect(shopT("en")("bcNav")).toBe("Business cards");
    expect(ro("bcNav")).toBe("Cărți de vizită");
  });

  it("lists on the home page from 1,50 lei per card", () => {
    const p = shopBusinessCardProduct("ro");
    expect(p).toMatchObject({ slug: SHOP_BC_SLUG, name: "Cărți de vizită 90×50 mm", unitFrom: 1.5, fromPrice: 150, available: true });
  });
});
