import { describe, expect, it } from "vitest";
import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import type { DtfPresetOption } from "@/lib/dtf/dtfLineCalc";
import { dtfLineInputSchema } from "@/lib/dtf/dtfLineInput";
import { parseDtfSettingsJson } from "@/lib/dtf/dtfSettings";
import { dtfGarmentsFromStockItem, type DtfStockItemRow } from "@/lib/dtf/stockGarments";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { buildLineLabels, describeQuoteLine } from "./lineLabels";
import { mapShopCatalog, SHOP_PRODUCTS, type CatalogItemRow, type CatalogPresetRow } from "./catalogConfig";
import { itemZones, type ShirtPrintSelection } from "./dtfPrint";
import { shopT, type ShopLang } from "./i18n";
import type { ShopProduct, ShopQuoteLine } from "./types";

/**
 * DTF on bags and toys (shop `dtf` mode, garment `item`) against a production
 * snapshot (2026-11-04, read-only): stock items with one variant each (no
 * size, no colour option), no print area on the card, the active DTF price
 * list and `PrintMethod('dtf').settings`.
 */
const PROD_DTF_ITEMS: Record<string, { itemId: string; variantId: string; price: number; stock: number; category: string }> = {
  BO7614S129: { itemId: "fe814143-0cb2-42d7-b9bb-d39352f74c9e", variantId: "715a8837-2698-4c35-a0ea-4d8d8ab4b69a", price: 21, stock: 50, category: "bags" },
  NE7565S102: { itemId: "4ff41d25-07c2-48bf-98c8-23bb3600c6b1", variantId: "743fdfba-268f-4b9c-a7a9-1e7335204b1d", price: 26, stock: 10, category: "bags" },
  NE7565S105: { itemId: "34851577-8b7b-4056-95a7-8c58832ed72f", variantId: "1d91367b-4dad-46f0-b8cb-8a3cd8bd0329", price: 26, stock: 10, category: "bags" },
  NE7565S131: { itemId: "b3cb24a2-fd9a-4997-a310-4214fcb16763", variantId: "41c0dc59-0dbe-44ea-a810-578c7c5bf77e", price: 26, stock: 10, category: "bags" },
  NE7565S160: { itemId: "6899ac99-4691-4ac3-b617-f4e774d8ed6d", variantId: "7d28da4e-655f-4dc5-9ae2-cd51946a43de", price: 26, stock: 10, category: "bags" },
  FT2051S1924: { itemId: "aa65e247-4ec6-4e7d-b462-0bdb866ed832", variantId: "c8fc3cb9-b14e-4cb0-9eec-62ca32274dc1", price: 282, stock: 10, category: "plush_toys" },
  FT2051S1925: { itemId: "2e1087ea-2cd2-4a0e-b657-bcb73e714bfb", variantId: "b1e951a4-6f92-4c62-96bd-d87a5f136c4e", price: 282, stock: 10, category: "plush_toys" },
  FT2051S1926: { itemId: "6ce451a6-22c7-425f-b7b4-87aad9448a21", variantId: "eb1d55c6-8da3-485c-acf5-3470baf89df8", price: 282, stock: 10, category: "plush_toys" },
  FT2051S1927: { itemId: "b2469a3d-9e1e-4ed3-ad9e-4fcda679b24d", variantId: "69f04495-a69c-45d6-8a2d-0d1ae42ec89f", price: 282, stock: 10, category: "plush_toys" },
  FT2051S1928: { itemId: "686f05aa-f37a-4cea-a983-83f9ccb7773f", variantId: "4d8b9349-ddf0-4692-a8a5-093f5315aa3f", price: 282, stock: 10, category: "plush_toys" },
  FT2051S1997: { itemId: "b309a65b-1bb3-4a5f-8160-524d8ce40725", variantId: "e45bf71e-721e-4671-b3a7-df8cab436807", price: 282, stock: 10, category: "plush_toys" },
  FT1853S101: { itemId: "b8756069-3221-4a34-9dfc-e384ee384163", variantId: "c4be5e72-c71c-46ad-a5ba-2d6e4aa157f4", price: 265, stock: 5, category: "plush_toys" },
  FT1853S105: { itemId: "0d5734f5-8b13-470a-a2f4-4e6df92cabc8", variantId: "5e18123b-1cdf-454a-94d6-79b50873961d", price: 265, stock: 5, category: "plush_toys" },
  FT1853S1226: { itemId: "6b7227bb-bbd7-4733-825b-484d9abbb1db", variantId: "c3162a95-8311-449d-8220-012e01378b56", price: 265, stock: 5, category: "plush_toys" },
  FT1853S131: { itemId: "86680327-abe2-46d5-9dd6-531a211c5efa", variantId: "8e22e6ca-07bc-4592-9e68-e53c0732bc2e", price: 265, stock: 5, category: "plush_toys" },
  FT1853S155: { itemId: "d31b793f-7815-4fd7-ba69-7d6ae1af081a", variantId: "0c475ca2-40af-4730-82af-9ab7d8c606d9", price: 265, stock: 5, category: "plush_toys" },
  FT1853S160: { itemId: "c3e0c500-cc15-4c75-8f61-29c68fc4c6da", variantId: "42fdf2ca-47d1-4b64-8fcd-f8dcde010af6", price: 265, stock: 5, category: "plush_toys" },
};

const LOGO = "a8ba2aeb-77ad-4d1a-974f-cf13dbd83f3f";
const A6 = "930452c6-a866-40d0-8e98-b7fc2bacb975";
const A4 = "4bc5a019-d398-46e7-b783-95059e34cb14";
const PROD_PRESETS: CatalogPresetRow[] = [
  { id: LOGO, label: "Logo 10×10", widthCm: 10, heightCm: 10, retailPrice: 100 },
  { id: A6, label: "A6 10×15", widthCm: 10, heightCm: 15, retailPrice: 100 },
  { id: "acd3ef2e-f7d5-45d4-9180-e57b014b2f21", label: "A5 15×21", widthCm: 15, heightCm: 21, retailPrice: 140 },
  { id: A4, label: "A4 21×30", widthCm: 21, heightCm: 30, retailPrice: 180 },
  { id: "3affc1ac-e334-402a-a29f-9c65df925ba8", label: "A3 30×42", widthCm: 30, heightCm: 42, retailPrice: 220 },
];
const PROD_DTF_SETTINGS = parseDtfSettingsJson({
  gapCm: 1,
  filmWidthCm: 33,
  printableWidthCm: 30,
  pressFeePerZoneMdl: 0,
  inkMlPerLinearMeter: 15,
  minimumLineTotalMdl: 0,
  powderGramsPerLinearMeter: 10,
});

/**
 * Totals from the LIVE `POST https://anvi.md/api/public/quote` (2026-11-04)
 * for the shop's lines: front logo, front A4, or (bags) front logo + back A6.
 */
const LIVE_TOTALS: [sku: string, print: "logo" | "A4" | "logo+A6back", qty: number, total: number][] = [
  ["BO7614S129", "logo", 1, 121],
  ["BO7614S129", "logo", 10, 1060],
  ["FT1853S101", "logo", 1, 365],
  ["FT1853S101", "logo", 10, 3500],
  ["FT1853S105", "logo", 1, 365],
  ["FT1853S105", "logo", 10, 3500],
  ["FT1853S1226", "logo", 1, 365],
  ["FT1853S1226", "logo", 10, 3500],
  ["FT1853S131", "logo", 1, 365],
  ["FT1853S131", "logo", 10, 3500],
  ["FT1853S155", "logo", 1, 365],
  ["FT1853S155", "logo", 10, 3500],
  ["FT1853S160", "logo", 1, 365],
  ["FT1853S160", "logo", 10, 3500],
  ["FT2051S1924", "logo", 1, 382],
  ["FT2051S1924", "logo", 10, 3670],
  ["FT2051S1925", "logo", 1, 382],
  ["FT2051S1925", "logo", 10, 3670],
  ["FT2051S1926", "logo", 1, 382],
  ["FT2051S1926", "logo", 10, 3670],
  ["FT2051S1927", "logo", 1, 382],
  ["FT2051S1927", "logo", 10, 3670],
  ["FT2051S1928", "logo", 1, 382],
  ["FT2051S1928", "logo", 10, 3670],
  ["FT2051S1997", "logo", 1, 382],
  ["FT2051S1997", "logo", 10, 3670],
  ["NE7565S102", "logo", 1, 126],
  ["NE7565S102", "logo", 10, 1110],
  ["NE7565S105", "logo", 1, 126],
  ["NE7565S105", "logo", 10, 1110],
  ["NE7565S131", "logo", 1, 126],
  ["NE7565S131", "logo", 10, 1110],
  ["NE7565S160", "logo", 1, 126],
  ["NE7565S160", "logo", 10, 1110],
  ["BO7614S129", "A4", 1, 201],
  ["BO7614S129", "A4", 10, 1760],
  ["NE7565S102", "A4", 1, 206],
  ["NE7565S102", "A4", 10, 1810],
  ["FT2051S1924", "A4", 1, 462],
  ["FT2051S1924", "A4", 10, 4370],
  ["FT1853S101", "A4", 1, 445],
  ["FT1853S101", "A4", 10, 4200],
  ["BO7614S129", "logo+A6back", 1, 221],
  ["BO7614S129", "logo+A6back", 10, 1910],
  ["NE7565S160", "logo+A6back", 1, 226],
  ["NE7565S160", "logo+A6back", 10, 1960],
];

const ITEM_SLUGS = ["geanta-napa", "portfard-sedna", "jucarie-lenny", "ursulet-jazz"];
const LANGS: ShopLang[] = ["ro", "ru", "en"];

function shopRows(): CatalogItemRow[] {
  return Object.entries(PROD_DTF_ITEMS).map(([sku, r]) => ({
    id: r.itemId,
    sku,
    isActive: true,
    imageUrl: `catalog/stock/1793204180000-${sku}.jpg`,
    galleryImages: [],
    attributes: {},
    variants: [
      { id: r.variantId, isActive: true, options: {}, sellPrice: r.price, priceTiers: null, sortOrder: 0, label: null, stockQuantity: r.stock },
    ],
  }));
}

/** The same item as the studio wizard loads it (`loadDtfStockGarment`). */
function wizardRow(sku: string): DtfStockItemRow {
  const r = PROD_DTF_ITEMS[sku]!;
  return {
    id: r.itemId,
    printMethods: [],
    nameRo: sku,
    nameRu: sku,
    nameEn: sku,
    sortOrder: 0,
    isActive: true,
    attributes: {},
    category: { code: r.category, nameRo: r.category, nameRu: r.category, nameEn: r.category, sortOrder: 0, isActive: true, printMethods: ["dtf"] },
    variants: [
      {
        id: r.variantId,
        label: null,
        options: {},
        sortOrder: 0,
        isActive: true,
        stockQuantity: r.stock,
        avgCost: null,
        purchaseCost: null,
        sellPrice: r.price,
        priceTiers: null,
      },
    ],
  };
}

const WIZARD_PRESETS: DtfPresetOption[] = PROD_PRESETS.map((p) => ({ ...p, dealerPrice: null }));

function products(lang: ShopLang = "ro"): ShopProduct[] {
  const pricing = { printDiscount: { steps: [{ minQty: 2, pct: 7 }, { minQty: 10, pct: 14 }, { minQty: 50, pct: 29 }], roundTo: 5 }, pressFeeMdl: 0 };
  return mapShopCatalog(shopRows(), PROD_PRESETS, lang, pricing).products.filter((p) => ITEM_SLUGS.includes(p.slug));
}

/** The quote line the product page builds for a colour, a quantity and a print choice. */
function shopLine(product: ShopProduct, sku: string, qty: number, print: (typeof LIVE_TOTALS)[number][1]): ShopQuoteLine {
  const color = product.dtf!.colors.find((c) => c.key === sku)!;
  const sel: ShirtPrintSelection =
    print === "logo" ? { front: LOGO, back: null } : print === "A4" ? { front: A4, back: null } : { front: LOGO, back: A6 };
  return {
    kind: "dtf",
    garmentId: color.garmentId,
    sizes: [{ size: color.sizes[0]!, quantity: qty }],
    zones: itemZones(sel, product.dtf!.itemZones, product.dtf!.prints),
  };
}

describe("shop DTF items (bags, toys)", () => {
  it("sells only in-stock, priced production items, never the postponed ones", () => {
    const configs = SHOP_PRODUCTS.filter((p) => p.mode === "dtf" && p.garment === "item");
    expect(configs.map((p) => p.slug)).toEqual(ITEM_SLUGS);
    for (const p of configs) {
      for (const o of p.options) {
        const r = PROD_DTF_ITEMS[o.sku];
        expect(r, o.sku).toBeDefined();
        expect(r!.price, o.sku).toBeGreaterThan(0);
        expect(r!.stock, o.sku).toBeGreaterThan(0);
      }
    }
    // JAZZ black: 0 in stock.
    expect(configs.flatMap((p) => p.options.map((o) => o.sku))).not.toContain("FT1853S102");
  });

  it("maps them as sizeless DTF items with their zones, every format and item + print prices", () => {
    const ps = products();
    expect(ps.map((p) => p.slug)).toEqual(ITEM_SLUGS);
    for (const p of ps) {
      expect(p.mode).toBe("dtf");
      expect(p.dtf!.garment).toBe("item");
      expect(p.dtf!.fixedZone).toBeNull();
      // No print area on these cards: the whole price list, as the wizard offers it.
      expect(p.dtf!.prints.map((x) => x.presetId)).toEqual(PROD_PRESETS.map((x) => x.id));
      expect(p.dtf!.printDiscount).not.toBeNull();
      for (const c of p.dtf!.colors) {
        expect(c.sizes).toEqual(["—"]);
        expect(c.garmentId).toBe(`${PROD_DTF_ITEMS[c.key]!.itemId}:`);
        expect(c.itemPrice).toBe(PROD_DTF_ITEMS[c.key]!.price);
      }
      const cheapest = Math.min(...p.dtf!.colors.map((c) => c.itemPrice!));
      expect(p.fromPrice).toBe(cheapest + 100);
    }
    const sides = Object.fromEntries(ps.map((p) => [p.slug, p.dtf!.itemZones.map((z) => z.side)]));
    expect(sides).toEqual({
      "geanta-napa": ["front", "back"],
      "portfard-sedna": ["front", "back"],
      "jucarie-lenny": ["front"],
      "ursulet-jazz": ["front"],
    });
    for (const p of ps) for (const z of p.dtf!.itemZones) expect(z.note.length).toBeLessThanOrEqual(80);
  });

  it("limits the formats to the item's print area when its card has one", () => {
    const rows = shopRows().map((r) => (r.sku.startsWith("NE7565") ? { ...r, attributes: { printWidthCm: 15, printHeightCm: 12 } } : r));
    const sedna = mapShopCatalog(rows, PROD_PRESETS, "ro").products.find((p) => p.slug === "portfard-sedna")!;
    expect(sedna.dtf!.prints.map((p) => p.label)).toEqual(["Logo 10×10", "A6 10×15"]);
  });

  it("prices the shop's lines exactly as the studio wizard and the live quote", () => {
    const ps = products();
    for (const [sku, print, qty, live] of LIVE_TOTALS) {
      const product = ps.find((p) => p.dtf!.colors.some((c) => c.key === sku))!;
      const line = shopLine(product, sku, qty, print);
      // What `POST /api/public/quote` and the checkout accept …
      const parsed = parsePublicQuoteLine(line);
      expect(parsed.ok, `${sku} ${print}`).toBe(true);
      // … turned into the engine input as `publicDtfEngineInput` does …
      if (line.kind !== "dtf") throw new Error("not a DTF line");
      const input = dtfLineInputSchema.parse({ garmentSource: "stock", garmentProductId: line.garmentId, sizes: line.sizes, zones: line.zones });
      // … and priced by the wizard's engine with the wizard's garment.
      const garment = dtfGarmentsFromStockItem(wizardRow(sku))[0]!;
      const data = buildDtfLineData(input, "retail", {
        garment,
        presets: WIZARD_PRESETS,
        settings: PROD_DTF_SETTINGS,
        unitCosts: { filmPerLinearMeterMdl: 0, powderPerGramMdl: 0, inkPerMlMdl: 0 },
      });
      expect(data.pricing.totalSellPriceMdl, `${sku} ${print} ×${qty}`).toBe(live);
      expect(data.zones.every((z) => z.placement === "other" && Boolean(z.placementNote))).toBe(true);
    }
  });

  it("describes cart lines in every language", () => {
    for (const lang of LANGS) {
      const ps = products(lang);
      const labels = buildLineLabels(ps);
      const t = shopT(lang);
      const napa = describeQuoteLine(shopLine(ps[0]!, "BO7614S129", 2, "logo+A6back"), labels, t)!;
      expect(napa.slug).toBe("geanta-napa");
      expect(napa.optionsText).toContain(lang === "ru" ? "Лого 10×10" : "Logo 10×10");
      expect(napa.optionsText).toContain("A6 10×15");
      const lenny = describeQuoteLine(shopLine(ps[2]!, "FT2051S1928", 1, "A4"), labels, t)!;
      expect(lenny.optionsText).toContain("A4 21×30");
      expect(lenny.optionsText).toContain(ps[2]!.dtf!.itemZones[0]!.label);
    }
  });

  it("has zone labels in ro, ru and en", () => {
    for (const p of SHOP_PRODUCTS) {
      if (p.mode !== "dtf" || p.garment !== "item") continue;
      expect(p.zones?.length, p.slug).toBeGreaterThan(0);
      for (const z of p.zones ?? []) for (const l of LANGS) expect(z.label[l]?.trim(), `${p.slug} ${z.side} ${l}`).toBeTruthy();
    }
  });
});
