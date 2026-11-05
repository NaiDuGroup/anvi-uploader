import { describe, expect, it } from "vitest";
import { buildDtfLineData } from "@/lib/dtf/buildDtfLineData";
import type { DtfPresetOption } from "@/lib/dtf/dtfLineCalc";
import { dtfLineInputSchema } from "@/lib/dtf/dtfLineInput";
import { parseDtfSettingsJson } from "@/lib/dtf/dtfSettings";
import { dtfGarmentsFromStockItem } from "@/lib/dtf/stockGarments";
import { DEFAULT_SUBLIMATION_SETTINGS } from "@/lib/printMethods/sublimationSettings";
import { parseUvSettingsJson } from "@/lib/printMethods/uvSettings";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { shopUvItemZoneError } from "@/lib/shop/uvItemZones";
import { buildSublimationLineData } from "@/lib/sublimation/buildSublimationLineData";
import { sublimationStockItemsFromStockItem } from "@/lib/sublimation/stockItems";
import { ZERO_SUBLIMATION_CONSUMABLE_COSTS } from "@/lib/sublimation/sublimationLineCalc";
import { buildUvLineData } from "@/lib/uv/buildUvLineData";
import { stockItemPrintArea, uvStockItemsFromStockItem, type UvStockItemRow } from "@/lib/uv/stockItems";
import { ZERO_UV_INK_COSTS } from "@/lib/uv/uvLineCalc";
import { uvLineInputSchema } from "@/lib/uv/uvLineInput";
import {
  mapShopCatalog,
  SHOP_CATEGORIES,
  SHOP_MADE_TO_ORDER_DAYS,
  SHOP_PRODUCTS,
  type CatalogItemRow,
  type CatalogPresetRow,
} from "./catalogConfig";
import { SHOP_STOCK_PRODUCTS } from "./catalogStock";
import { PROD_STOCK_ITEMS, PROD_STOCK_LIVE_TOTALS, type ProdStockItem } from "./catalogStockProd.fixture";
import { itemZones, shirtZones } from "./dtfPrint";
import { shopT, type ShopLang } from "./i18n";
import { buildLineLabels, describeQuoteLine, lineMadeToOrderDays } from "./lineLabels";
import { simpleQuoteLine } from "./quoteLine";
import type { ShopProduct, ShopQuoteLine } from "./types";

/**
 * The rest of the studio stock on the shop (`catalogStock.ts`, owner
 * 2026-11-05) against the production snapshot in `catalogStockProd.fixture.ts`:
 * mapping, made-to-order label, fallback print zones, and prices — the shop's
 * own quote lines priced by the studio wizard's engines (UV with the
 * production UV settings, sublimation, DTF with the production price list)
 * and compared with the LIVE public quote.
 */

const LANGS: ShopLang[] = ["ro", "ru", "en"];
const BY_SKU = new Map(PROD_STOCK_ITEMS.map((i) => [i.sku, i]));
const NEW_SLUGS: string[] = SHOP_STOCK_PRODUCTS.map((p) => p.slug);

/** `PrintMethod('uv').settings` on production (2026-11-05). */
const PROD_UV_SETTINGS = parseUvSettingsJson({
  wastePct: 15,
  uvDtfGapCm: 0.5,
  cmykMlPerSqm: 10,
  primerMlPerSqm: 15,
  uvDtfRoundToMdl: 5,
  primerSurchargePct: 20,
  minimumLineTotalMdl: 100,
  varnishSurchargePct: 25,
  dealerPricePerSqmMdl: 400,
  retailPricePerSqmMdl: 600,
  clientItemSetupFeeMdl: 0,
  uvDtfMinimumDealerMdl: 50,
  uvDtfMinimumRetailMdl: 100,
  uvDtfPrintableWidthCm: 30,
  whiteMlPerSqmPerLayer: 12,
  uvDtfDealerPerMeterMdl: 240,
  uvDtfRetailPerMeterMdl: 500,
  whiteLayerSurchargePct: 15,
  varnishMlPerSqmPerLayer: 12,
  minimumZonePriceDealerMdl: 10,
  minimumZonePriceRetailMdl: 15,
});

const LOGO = "a8ba2aeb-77ad-4d1a-974f-cf13dbd83f3f";
const A4 = "4bc5a019-d398-46e7-b783-95059e34cb14";
const PROD_PRESETS: CatalogPresetRow[] = [
  { id: LOGO, label: "Logo 10×10", widthCm: 10, heightCm: 10, retailPrice: 100 },
  { id: "930452c6-a866-40d0-8e98-b7fc2bacb975", label: "A6 10×15", widthCm: 10, heightCm: 15, retailPrice: 100 },
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
const DTF_PRICING = {
  printDiscount: { steps: [{ minQty: 2, pct: 7 }, { minQty: 10, pct: 14 }, { minQty: 50, pct: 29 }], roundTo: 5 },
  pressFeeMdl: 0,
};

function shopRows(): CatalogItemRow[] {
  return PROD_STOCK_ITEMS.map((i) => ({
    id: i.itemId,
    sku: i.sku,
    isActive: true,
    imageUrl: i.image,
    galleryImages: [],
    attributes: i.attributes,
    variants: i.variants.map((v) => ({
      id: v.id,
      isActive: true,
      options: v.options,
      sellPrice: v.sellPrice,
      priceTiers: null,
      sortOrder: v.sortOrder,
      label: v.label,
      stockQuantity: v.stock,
    })),
  }));
}

/** The item as the studio wizard loads it (UV / sublimation / DTF catalogs share the row shape). */
function wizardRow(i: ProdStockItem): UvStockItemRow {
  return {
    id: i.itemId,
    sku: i.sku,
    nameRo: i.sku,
    nameRu: i.sku,
    nameEn: i.sku,
    sortOrder: 0,
    isActive: true,
    printMethods: i.printMethods,
    attributes: i.attributes,
    category: { code: i.category, nameRo: i.category, nameRu: i.category, nameEn: i.category, sortOrder: 0, isActive: true, printMethods: i.printMethods },
    variants: i.variants.map((v) => ({
      id: v.id,
      sku: v.id,
      label: v.label,
      options: v.options,
      sortOrder: v.sortOrder,
      isActive: true,
      stockQuantity: v.stock,
      avgCost: null,
      purchaseCost: null,
      sellPrice: v.sellPrice,
      dealerPrice: null,
      priceTiers: null,
    })),
  };
}

function products(lang: ShopLang = "ro"): ShopProduct[] {
  return mapShopCatalog(shopRows(), PROD_PRESETS, lang, DTF_PRICING).products;
}

describe("whole stock on the shop: catalog", () => {
  it("sells every new option from an active, priced production item", () => {
    for (const p of SHOP_STOCK_PRODUCTS) {
      for (const o of p.options) {
        const i = BY_SKU.get(o.sku);
        expect(i, `${p.slug} ${o.sku}`).toBeDefined();
        expect(i!.variants.length, o.sku).toBeGreaterThan(0);
        for (const v of i!.variants) expect(v.sellPrice, o.sku).toBeGreaterThan(0);
      }
    }
  });

  it("adds 39 cards in the planned categories", () => {
    const count = (cat: string) => SHOP_STOCK_PRODUCTS.filter((p) => p.category === cat).length;
    expect(SHOP_STOCK_PRODUCTS).toHaveLength(39);
    expect({
      cani: count("cani"),
      caiete: count("caiete"),
      pixuri: count("pixuri"),
      tricouri: count("tricouri"),
      genti: count("genti"),
      jucarii: count("jucarii"),
      sticle: count("sticle"),
      jocuri: count("jocuri"),
      craciun: count("craciun"),
      cadouri: count("cadouri"),
    }).toEqual({ cani: 1, caiete: 1, pixuri: 5, tricouri: 2, genti: 6, jucarii: 1, sticle: 4, jocuri: 5, craciun: 6, cadouri: 8 });
  });

  it("keeps off what the owner held back, duplicates and items without photos or a print method", () => {
    const skus = new Set(SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku)));
    const off = [
      // Promostock watermark on the photos.
      ...["CINMI-320", "CIRCMI-320", "CMNMI-320", "CMT", "CVL"],
      // Socks set FRIZER: no print method.
      "XM1831-01",
      // Probable duplicate of NORVAL (TZ1132) and the inactive «marble» mugs.
      ...["CMN-320", "CMA-320", "CMR-320", "CMV-320"],
      // Inactive mugs (to be decided), wall calendars (no print, not orderable online).
      ...["CMA-370", "HM-500", "CMN-", "CMARR-", "CROZM-320", "BV30694"],
      // CRUX: blurred photos (black, blue) or a photo of another colour (yellow, red).
      ...["IA3009S102", "IA3009S105", "IA3009S103", "IA3009S160"],
    ];
    expect(off.filter((s) => skus.has(s))).toEqual([]);
  });

  it("maps every new product with all its options, the card prices and texts in ro, ru and en", () => {
    for (const lang of LANGS) {
      const ps = products(lang);
      for (const c of SHOP_STOCK_PRODUCTS) {
        const p = ps.find((x) => x.slug === c.slug);
        expect(p, `${c.slug} ${lang}`).toBeDefined();
        const n = p!.mode === "simple" ? p!.variants.length : p!.dtf!.colors.length;
        expect(n, c.slug).toBe(c.options.length);
        expect(p!.name && p!.subtitle && p!.description, c.slug).toBeTruthy();
        expect(p!.image, c.slug).toBeTruthy();
        if (p!.mode === "simple") {
          expect(p!.variants.map((v) => v.price)).toEqual(c.options.map((o) => BY_SKU.get(o.sku)!.variants[0]!.sellPrice));
        }
      }
    }
  });

  it("names the four new categories in every language and fills each of them", () => {
    const fresh = ["sticle", "jocuri", "craciun", "cadouri"];
    for (const slug of fresh) {
      const c = SHOP_CATEGORIES.find((x) => x.slug === slug);
      expect(c, slug).toBeDefined();
      for (const l of LANGS) expect(c!.name[l]?.trim(), `${slug} ${l}`).toBeTruthy();
      expect(new Set(LANGS.map((l) => c!.name[l])).size, slug).toBeGreaterThan(1);
    }
    const { categories } = mapShopCatalog(shopRows(), PROD_PRESETS, "ro", DTF_PRICING);
    for (const slug of fresh) expect(categories.find((c) => c.slug === slug)?.productCount ?? 0, slug).toBeGreaterThan(0);
  });
});

describe("made to order (balance 0)", () => {
  it("is 5 working days by default (to confirm with the owner)", () => {
    expect(SHOP_MADE_TO_ORDER_DAYS).toBe(5);
    expect(shopT("ro")("madeToOrder", { days: 5 })).toBe("La comandă · +5 zile");
    expect(shopT("ru")("madeToOrder", { days: 5 })).toBe("Под заказ · +5 дней");
    expect(shopT("en")("madeToOrder", { days: 5 })).toBe("Made to order · +5 days");
    expect(shopT("ru")("madeToOrder", { days: 3 })).toBe("Под заказ · +3 дня");
    expect(shopT("ro")("madeToOrder", { days: 1 })).toBe("La comandă · +1 zi");
  });

  it("marks exactly the options at 0 — whatever the stock-check switch — and the card when all are", () => {
    const ps = products();
    for (const c of SHOP_STOCK_PRODUCTS) {
      const p = ps.find((x) => x.slug === c.slug)!;
      const zero = c.options.map((o) => BY_SKU.get(o.sku)!.variants.every((v) => Math.floor(v.stock) === 0));
      if (p.mode === "simple") {
        expect(p.variants.map((v) => v.madeToOrder === true), c.slug).toEqual(zero);
        // Switch off: still orderable.
        expect(p.variants.every((v) => v.stock == null), c.slug).toBe(true);
      } else {
        expect(p.dtf!.colors.map((x) => (x.madeToOrderSizes?.length ?? 0) === x.sizes.length), c.slug).toEqual(zero);
      }
      expect(p.available, c.slug).toBe(true);
      expect(p.madeToOrder, c.slug).toBe(zero.every(Boolean));
      expect(p.madeToOrderDays).toBe(SHOP_MADE_TO_ORDER_DAYS);
    }
    const flagged = ps.filter((p) => NEW_SLUGS.includes(p.slug) && p.madeToOrder).map((p) => p.slug);
    expect(flagged).toContain("pix-talbot");
    expect(flagged).not.toContain("geanta-nimes");
  });

  it("shows the label on the cart line (and so in the staff note) for an option at 0 only", () => {
    const ps = products("ru");
    const labels = buildLineLabels(ps);
    const talbot = ps.find((p) => p.slug === "pix-talbot")!;
    expect(lineMadeToOrderDays(simpleQuoteLine("uvItem", talbot.variants[0]!, 1), labels)).toBe(5);
    const nimes = ps.find((p) => p.slug === "geanta-nimes")!;
    const nimesLine: ShopQuoteLine = {
      kind: "dtf",
      garmentId: nimes.dtf!.colors[0]!.garmentId,
      sizes: [{ size: nimes.dtf!.colors[0]!.sizes[0]!, quantity: 1 }],
      zones: itemZones({ front: LOGO, back: null }, nimes.dtf!.itemZones, nimes.dtf!.prints),
    };
    expect(lineMadeToOrderDays(nimesLine, labels)).toBeNull();
    const polo = ps.find((p) => p.slug === "polo-austral")!;
    const poloLine: ShopQuoteLine = {
      kind: "dtf",
      garmentId: polo.dtf!.colors[0]!.garmentId,
      sizes: [{ size: "L", quantity: 2 }],
      zones: shirtZones({ front: A4, back: null }, polo.dtf!.prints),
    };
    expect(lineMadeToOrderDays(poloLine, labels)).toBe(5);
  });

  it("picks a baby bodysuit per size and names the sizes on the line", () => {
    const ps = products("ro");
    const body = ps.find((p) => p.slug === "body-sweet")!;
    const pink = body.dtf!.colors.find((c) => c.key === "BD7201-48")!;
    expect(pink.sizes).toEqual(["6 мес", "9 мес", "18 мес"]);
    const line: ShopQuoteLine = {
      kind: "dtf",
      garmentId: pink.garmentId,
      sizes: [
        { size: "6 мес", quantity: 1 },
        { size: "9 мес", quantity: 2 },
      ],
      zones: itemZones({ front: LOGO, back: null }, body.dtf!.itemZones, body.dtf!.prints),
    };
    expect(parsePublicQuoteLine(line).ok).toBe(true);
    expect(describeQuoteLine(line, buildLineLabels(ps), shopT("ro"))!.optionsText).toContain("6 luni×1, 9 luni×2");
    expect(describeQuoteLine(line, buildLineLabels(products("ru")), shopT("ru"))!.optionsText).toContain("6 мес.×1, 9 мес.×2");
  });
});

describe("UV items: fallback print zones", () => {
  it("never drops a new UV item for a missing card zone: the fallback goes on the quote line", () => {
    const ps = products();
    for (const c of SHOP_STOCK_PRODUCTS) {
      if (c.mode !== "simple" || c.kind !== "uvItem") continue;
      const p = ps.find((x) => x.slug === c.slug)!;
      for (const [k, o] of c.options.entries()) {
        const card = stockItemPrintArea(BY_SKU.get(o.sku)!.attributes);
        const v = p.variants[k]!;
        const line = simpleQuoteLine("uvItem", v, 1);
        if (line.kind !== "uv" || line.source !== "stock") throw new Error("not a stock UV line");
        if (card) {
          // The card's own area wins (LOIS / PARTAS 4×1.5, BUKS, the diary, NIKA).
          expect(v.uvZone, o.sku).toBeUndefined();
          expect(line.zones[0].widthCm, o.sku).toBeUndefined();
        } else {
          expect(c.fallbackPrintAreaCm, `${c.slug} has no fallback`).toBeDefined();
          expect(v.uvZone, o.sku).toEqual(c.fallbackPrintAreaCm);
          expect([line.zones[0].widthCm, line.zones[0].heightCm], o.sku).toEqual([c.fallbackPrintAreaCm!.widthCm, c.fallbackPrintAreaCm!.heightCm]);
        }
        expect(shopUvItemZoneError(line, { sku: o.sku, attributes: BY_SKU.get(o.sku)!.attributes }), o.sku).toBeNull();
      }
    }
  });

  it("bottles print one side by direct UV (wrap-around UV-DTF on request)", () => {
    for (const slug of ["sticla-lewik", "sticla-kisko", "sticla-camu"]) {
      const c = SHOP_STOCK_PRODUCTS.find((p) => p.slug === slug)!;
      expect(c.mode === "simple" && c.fallbackPrintAreaCm).toEqual({ widthCm: 5, heightCm: 15 });
      expect(c.description.ru).toContain("одной стороне");
    }
  });

  it("the checkout refuses another main zone size while the card has none", () => {
    const item = { sku: "BI4213S102", attributes: {} };
    const zone = (widthCm?: number, heightCm?: number) => ({
      source: "stock" as const,
      zones: [{ id: "main", placement: "front" as const, whiteLayers: 1, varnish: false, primer: false, widthCm, heightCm }],
    });
    expect(shopUvItemZoneError(zone(5, 15), item)).toBeNull();
    expect(shopUvItemZoneError(zone(20, 20), item)).toBe("uv_zone_size_mismatch");
    expect(shopUvItemZoneError(zone(), item)).toBe("uv_zone_size_mismatch");
    // A card with print parameters: the engine takes its size, any sent size is ignored.
    expect(shopUvItemZoneError(zone(20, 20), { sku: "BI4213S102", attributes: { printWidthCm: 6, printHeightCm: 15 } })).toBeNull();
    // SKUs the shop does not sell pass (the public quote prices any UV item).
    expect(shopUvItemZoneError(zone(20, 20), { sku: "NOT-ON-SHOP", attributes: {} })).toBeNull();
  });

  it("the checkout refuses a second side on a one-side UV item (a bottle's back), card or not", () => {
    const kisko = SHOP_STOCK_PRODUCTS.find((p) => p.slug === "sticla-kisko")!;
    const sku = kisko.options[0]!.sku;
    const z = (id: string, placement: "front" | "back") => ({ id, placement, whiteLayers: 1, varnish: false, primer: false, widthCm: 5, heightCm: 15 });
    const both = { source: "stock" as const, zones: [z("main", "front"), z("back", "back")] };
    expect(shopUvItemZoneError(both, { sku, attributes: {} })).toBe("uv_zone_side_unavailable");
    expect(shopUvItemZoneError(both, { sku, attributes: { printWidthCm: 5, printHeightCm: 15 } })).toBe("uv_zone_side_unavailable");
    expect(shopUvItemZoneError({ source: "stock", zones: [z("main", "back")] }, { sku, attributes: {} })).toBe("uv_zone_side_unavailable");
    expect(shopUvItemZoneError({ source: "stock", zones: [z("main", "front")] }, { sku, attributes: {} })).toBeNull();
  });
});

describe("whole stock on the shop: prices", () => {
  const live = (sku: string, qty: number): number | undefined =>
    PROD_STOCK_LIVE_TOTALS.find(([, s, q]) => s === sku && q === qty)?.[3];

  it("UV items: item price × pieces, as the wizard (no 100-lei minimum); live = the same, or 100 before the change", () => {
    const ps = products();
    let checked = 0;
    for (const c of SHOP_STOCK_PRODUCTS) {
      if (c.mode !== "simple" || c.kind !== "uvItem") continue;
      const p = ps.find((x) => x.slug === c.slug)!;
      for (const [k, o] of c.options.entries()) {
        const prod = BY_SKU.get(o.sku)!;
        const item = uvStockItemsFromStockItem(wizardRow(prod))[0]!;
        for (const qty of [1, 5]) {
          const line = simpleQuoteLine("uvItem", p.variants[k]!, qty);
          const parsed = parsePublicQuoteLine(line);
          expect(parsed.ok, `${o.sku} parse`).toBe(true);
          if (line.kind !== "uv" || line.source !== "stock") throw new Error("not a stock UV line");
          const input = uvLineInputSchema.parse({ source: line.source, technique: line.technique, variantId: line.variantId, quantity: qty, zones: line.zones });
          const data = buildUvLineData(input, "retail", { item, settings: PROD_UV_SETTINGS, inkCosts: ZERO_UV_INK_COSTS });
          const expected = prod.variants[0]!.sellPrice * qty;
          expect(data.pricing.totalSellPriceMdl, `${o.sku} ×${qty}`).toBe(expected);
          expect(data.pricing.minimumLineUpliftMdl).toBe(0);
          // The live endpoint still ran the line minimum on 2026-11-05.
          expect(live(o.sku, qty), `${o.sku} ×${qty} live`).toBe(Math.max(100, expected));
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it("frame FILEY 27 lei × 1: 27 now (100 before)", () => {
    const prod = BY_SKU.get("XM1511S1511")!;
    const item = uvStockItemsFromStockItem(wizardRow(prod))[0]!;
    const zones = [{ id: "main", placement: "front" as const, widthCm: 6, heightCm: 6, whiteLayers: 1, varnish: false, primer: false }];
    const data = buildUvLineData({ source: "stock", variantId: item.id, quantity: 1, zones }, "retail", {
      item,
      settings: PROD_UV_SETTINGS,
      inkCosts: ZERO_UV_INK_COSTS,
    });
    expect(data.pricing.totalSellPriceMdl).toBe(27);
    expect(live("XM1511S1511", 1)).toBe(100);
  });

  it("sublimation blanks (jug, medal, lanyard): the blank price, print included, as a public «sublimation» line", () => {
    const ps = products();
    for (const c of SHOP_STOCK_PRODUCTS) {
      if (c.mode !== "simple" || c.kind !== "sublItem") continue;
      const p = ps.find((x) => x.slug === c.slug)!;
      for (const [k, o] of c.options.entries()) {
        const prod = BY_SKU.get(o.sku)!;
        const item = sublimationStockItemsFromStockItem(wizardRow(prod))[0]!;
        expect(item, o.sku).toBeDefined();
        for (const qty of [1, 5]) {
          const line = simpleQuoteLine("sublItem", p.variants[k]!, qty);
          expect(line).toEqual({ kind: "sublimation", variantId: prod.variants[0]!.id, quantity: qty });
          expect(parsePublicQuoteLine(line).ok).toBe(true);
          const data = buildSublimationLineData({ source: "stock", variantId: item.id, quantity: qty }, "retail", {
            item,
            settings: DEFAULT_SUBLIMATION_SETTINGS,
            consumableCosts: ZERO_SUBLIMATION_CONSUMABLE_COSTS,
          });
          expect(data.pricing.totalSellPriceMdl, `${o.sku} ×${qty}`).toBe(prod.variants[0]!.sellPrice * qty);
        }
      }
    }
  });

  it("DTF items and the polo: the wizard's engine gives the live quote", () => {
    const ps = products();
    const presets: DtfPresetOption[] = PROD_PRESETS.map((p) => ({ ...p, dealerPrice: null }));
    let checked = 0;
    for (const [slug, sku, qty, total, size] of PROD_STOCK_LIVE_TOTALS) {
      const p = ps.find((x) => x.slug === slug)!;
      if (p.mode !== "dtf") continue;
      const color = p.dtf!.colors.find((c) => c.key === sku)!;
      const zones =
        p.dtf!.garment === "item"
          ? itemZones({ front: LOGO, back: null }, p.dtf!.itemZones, p.dtf!.prints)
          : shirtZones({ front: A4, back: null }, p.dtf!.prints);
      const line = { kind: "dtf" as const, garmentId: color.garmentId, sizes: [{ size: size!, quantity: qty }], zones };
      expect(parsePublicQuoteLine(line).ok, `${sku}`).toBe(true);
      const input = dtfLineInputSchema.parse({ garmentSource: "stock", garmentProductId: line.garmentId, sizes: line.sizes, zones });
      const garment = dtfGarmentsFromStockItem({ ...wizardRow(BY_SKU.get(sku)!), printMethods: ["dtf"] })[0]!;
      const data = buildDtfLineData(input, "retail", {
        garment,
        presets,
        settings: PROD_DTF_SETTINGS,
        unitCosts: { filmPerLinearMeterMdl: 0, powderPerGramMdl: 0, inkPerMlMdl: 0 },
      });
      expect(data.pricing.totalSellPriceMdl, `${slug} ${sku} ×${qty}`).toBe(total);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });
});
