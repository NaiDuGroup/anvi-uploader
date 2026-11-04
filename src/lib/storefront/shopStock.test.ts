import { describe, expect, it } from "vitest";
import { parsePublicQuoteLine } from "@/lib/publicQuote/publicQuoteSchema";
import { dtfSizeVariantId, findStockShortage, shopStockDemands } from "@/lib/shop/stockCheck";
import { shopStockCheckEnabled } from "@/lib/shop/stockSwitch";
import { parseCart, serializeCart, type CartLine } from "./cart";
import { mapShopCatalog, type CatalogItemRow } from "./catalogConfig";
import { checkoutOutcome, lineUnavailableText } from "./checkout";
import { kindNeedsFile, lineMissingFile, simpleQuoteKind, SHOP_FILE_REQUIRED_KINDS } from "./fileRules";
import { shopT, SHOP_LANGS } from "./i18n";
import { buildLineLabels, describeQuoteLine, lineStockLimit, lineStockShortage } from "./lineLabels";
import { simpleQuoteLine } from "./quoteLine";
import { colorInStock, inStock, maxOrderQty, quoteVariantId, showsLowStock, wholeStock } from "./stock";

/** The stock-aware mode (`SHOP_STOCK_CHECK=1`); the default is off. */
const ON = { stockCheck: true };

function simpleRow(sku: string, stock: number | null | undefined, extra: Partial<CatalogItemRow> = {}): CatalogItemRow {
  return {
    id: `item-${sku}`,
    sku,
    isActive: true,
    imageUrl: `catalog/stock/${sku}.jpg`,
    galleryImages: [],
    variants: [
      {
        id: `var-${sku}`,
        isActive: true,
        options: {},
        sellPrice: 160,
        priceTiers: null,
        sortOrder: 0,
        ...(stock === undefined ? {} : { stockQuantity: stock }),
      },
    ],
    ...extra,
  };
}

/** Production balances 2026-11-04 (read-only) of the ERIS caps and the DOGO T-shirt sizes. */
function capRow(sku: string, stock: number): CatalogItemRow {
  return {
    id: `item-${sku}`,
    sku,
    isActive: true,
    imageUrl: `catalog/stock/${sku}.jpg`,
    galleryImages: [],
    variants: [
      {
        id: `var-${sku}`,
        isActive: true,
        options: { color: sku },
        sellPrice: 180,
        priceTiers: null,
        sortOrder: 0,
        stockQuantity: stock,
      },
    ],
  };
}

function shirtRow(sku: string, color: string, sizes: Record<string, number>): CatalogItemRow {
  return {
    id: `item-${sku}`,
    sku,
    isActive: true,
    imageUrl: `catalog/stock/${sku}.jpg`,
    galleryImages: [],
    variants: Object.entries(sizes).map(([size, stock], i) => ({
      id: `var-${sku}-${size}`,
      isActive: true,
      options: { color, size },
      sellPrice: 100,
      priceTiers: null,
      sortOrder: i,
      stockQuantity: stock,
    })),
  };
}

describe("stock helpers", () => {
  it("counts whole pieces, never negative; null = not tracked", () => {
    expect(wholeStock(3.999999)).toBe(3);
    expect(wholeStock(2.9999999999)).toBe(3);
    expect(wholeStock(-4)).toBe(0);
    expect(wholeStock(null)).toBeNull();
    expect(wholeStock(undefined)).toBeNull();
    expect(inStock(null)).toBe(true);
    expect(inStock(0)).toBe(false);
    expect(maxOrderQty(null, 5000)).toBe(5000);
    expect(maxOrderQty(7, 5000)).toBe(7);
    expect(maxOrderQty(0, 5000)).toBe(0);
    expect(showsLowStock(5)).toBe(true);
    expect(showsLowStock(6)).toBe(false);
    expect(showsLowStock(0)).toBe(false);
    expect(showsLowStock(null)).toBe(false);
  });

  it("has the stock strings in every language", () => {
    expect(shopT("ro")("outOfStock")).toBe("Nu e în stoc");
    expect(shopT("ru")("outOfStock")).toBe("Нет в наличии");
    expect(shopT("en")("outOfStock")).toBe("Out of stock");
    expect(shopT("ro")("stockLeft", { n: 3 })).toBe("Disponibil: 3 buc.");
    expect(shopT("ro")("productUnavailable")).toBe("Momentan indisponibil");
    for (const lang of SHOP_LANGS) {
      const t = shopT(lang);
      for (const k of ["stockLeft", "productUnavailableText", "optionOutOfStock", "errLineOutOfStock", "errLineSoldOut", "cartStockLimit"] as const) {
        expect(t(k).trim(), `${lang} ${k}`).toBeTruthy();
      }
    }
  });
});

describe("catalog with stock", () => {
  it("keeps a sold-out option (disabled on the page) and prices / photo from what is in stock", () => {
    // cana-interior-colorat: blue S3-KSRS-320 first in the config.
    const rows = [simpleRow("S3-KSRS-320", 0), simpleRow("S3-KKRK-330", 40)];
    const p = mapShopCatalog(rows, [], "ro", undefined, ON).products.find((x) => x.slug === "cana-interior-colorat")!;
    expect(p.available).toBe(true);
    expect(p.variants.map((v) => v.stock)).toEqual([0, 40]);
    expect(p.image).toContain("S3-KKRK-330");
  });

  it("a product with every option at 0 keeps its page but leaves the listings", () => {
    const rows = [simpleRow("S1-KB-320", 0), simpleRow("S3-KB-450", 0), simpleRow("CTMM-320", 15)];
    const { products, categories } = mapShopCatalog(rows, [], "ro", undefined, ON);
    expect(products.find((x) => x.slug === "cana-alba")!.available).toBe(false);
    expect(products.find((x) => x.slug === "cana-magica")!.available).toBe(true);
    expect(categories.find((c) => c.slug === "cani")!.productCount).toBe(1);
  });

  it("treats a variant without a balance as available (not tracked)", () => {
    const p = mapShopCatalog([simpleRow("S1-KB-320", undefined)], [], "ro", undefined, ON).products.find((x) => x.slug === "cana-alba")!;
    expect(p.variants[0]!.stock).toBeNull();
    expect(p.available).toBe(true);
  });

  it("production 2026-11-04: the ERIS caps (0 of every colour) are hidden; DOGO sizes carry their stock", () => {
    const rows = [
      capRow("GO70199002", 0),
      capRow("GO70199055", 0),
      capRow("GO70199060", 0),
      shirtRow("CA6502-01", "Alb", { S: 30, M: 29, L: 30, XL: 30, XXL: 10, "3XL": 5 }),
      shirtRow("CA6502-02", "Negru", { S: 30, M: 30, L: 30, XL: 30, XXL: 10, "3XL": 0 }),
    ];
    const { products, categories } = mapShopCatalog(rows, [], "ro", undefined, ON);
    const cap = products.find((x) => x.slug === "sapca-eris")!;
    expect(cap.available).toBe(false);
    expect(cap.dtf!.colors.every((c) => !colorInStock(c))).toBe(true);
    const shirt = products.find((x) => x.slug === "tricou-dogo")!;
    expect(shirt.available).toBe(true);
    expect(shirt.dtf!.colors[0]!.sizeStock).toEqual({ S: 30, M: 29, L: 30, XL: 30, XXL: 10, "3XL": 5 });
    expect(shirt.dtf!.colors[1]!.sizeStock["3XL"]).toBe(0);
    // The T-shirt category stays (DOGO), the cap is not counted.
    expect(categories.find((c) => c.slug === "tricouri")!.productCount).toBe(1);
  });
});

describe("catalog with the stock switch OFF (default: balances not trusted until the stocktake)", () => {
  it("shows the ERIS caps and every option as available, with no balances and no caps", () => {
    const rows = [
      capRow("GO70199002", 0),
      capRow("GO70199055", 0),
      capRow("GO70199060", 0),
      shirtRow("CA6502-01", "Alb", { S: 30, M: 0, "3XL": 5 }),
      simpleRow("S1-KB-320", 0),
      simpleRow("S3-KB-450", 0),
    ];
    for (const { products, categories } of [mapShopCatalog(rows, [], "ro"), mapShopCatalog(rows, [], "ro", undefined, { stockCheck: false })]) {
      const cap = products.find((x) => x.slug === "sapca-eris")!;
      expect(cap.available).toBe(true);
      expect(cap.dtf!.colors.map((c) => c.sizeStock)).toEqual([{}, {}, {}]);
      expect(cap.dtf!.colors.every(colorInStock)).toBe(true);
      expect(products.find((x) => x.slug === "tricou-dogo")!.dtf!.colors[0]!.sizeStock).toEqual({});
      const mug = products.find((x) => x.slug === "cana-alba")!;
      expect(mug.available).toBe(true);
      expect(mug.variants.map((v) => v.stock)).toEqual([null, null]);
      expect(maxOrderQty(mug.variants[0]!.stock, 5000)).toBe(5000);
      expect(showsLowStock(mug.variants[0]!.stock)).toBe(false);
      expect(categories.find((c) => c.slug === "tricouri")!.productCount).toBe(2);
      // The cart gets no limits either.
      const labels = buildLineLabels(products);
      const q = simpleQuoteLine("mug", { id: "var-S1-KB-320" }, 40);
      expect(lineStockLimit(q, labels)).toBeNull();
      expect(lineStockShortage(q, labels)).toBeNull();
    }
  });
});

describe("UV item quote line", () => {
  const variant = { id: "074c26bf-e8b2-4fec-9a07-b9bffaf678d3" };

  it("is the public `uv` stock line with the main zone and the item norms (accepted by the quote schema)", () => {
    const line = simpleQuoteLine("uvItem", { ...variant, uvNorms: { whiteLayers: 2, varnish: true, primer: false, transfer: false } }, 3);
    expect(line).toEqual({
      kind: "uv",
      source: "stock",
      variantId: variant.id,
      quantity: 3,
      zones: [{ id: "main", placement: "front", whiteLayers: 2, varnish: true, primer: false }],
    });
    expect(parsePublicQuoteLine(line).ok).toBe(true);
    expect(quoteVariantId(line)).toBe(variant.id);
  });

  it("asks for UV-DTF when the item card says so; defaults without norms", () => {
    const t = simpleQuoteLine("uvItem", { ...variant, uvNorms: { whiteLayers: 2, varnish: true, primer: false, transfer: true } }, 1);
    expect(t).toMatchObject({ technique: "transfer" });
    expect(parsePublicQuoteLine(t).ok).toBe(true);
    const d = simpleQuoteLine("uvItem", variant, 1);
    expect(d).toMatchObject({ zones: [{ whiteLayers: 1, varnish: false, primer: false }] });
    expect(d).not.toHaveProperty("technique");
  });

  it("other simple kinds keep `productId`", () => {
    expect(simpleQuoteLine("mug", { id: "m-1" }, 2)).toEqual({ kind: "mug", productId: "m-1", quantity: 2 });
  });

  it("needs a design file, on the page and on the server (quote kind `uv`)", () => {
    expect(SHOP_FILE_REQUIRED_KINDS).toContain("uv");
    expect(simpleQuoteKind("uvItem")).toBe("uv");
    expect(kindNeedsFile(simpleQuoteKind("uvItem"))).toBe(true);
    expect(kindNeedsFile("dtf")).toBe(false);
    const line = simpleQuoteLine("uvItem", variant, 1);
    expect(lineMissingFile({ quote: line, files: [] })).toBe(true);
  });

  it("survives the cart storage and is named from the catalog", () => {
    const quote = simpleQuoteLine("uvItem", variant, 2);
    const line: CartLine = { id: "l1", slug: "cana-radek", title: "x", optionsText: "", image: null, quote, files: [], addedAt: 1 };
    expect(parseCart(serializeCart([line]))[0]!.quote).toEqual(quote);
    // A UV line that is not the shop's shape is dropped.
    expect(parseCart(JSON.stringify({ lines: [{ ...line, quote: { ...quote, zones: [] } }] }))).toEqual([]);

    const rows = [
      simpleRow("TZ1267S102", 5, { attributes: { printWidthCm: 21, printHeightCm: 9.6 } }),
      simpleRow("TZ1267S103", 24, { attributes: { printWidthCm: 21, printHeightCm: 9.6 } }),
    ];
    const { products } = mapShopCatalog(rows, [], "ru", undefined, ON);
    const labels = buildLineLabels(products);
    const q = simpleQuoteLine("uvItem", { id: "var-TZ1267S102" }, 7);
    expect(describeQuoteLine(q, labels, shopT("ru"))).toEqual({
      slug: "cana-radek",
      title: "Кружка RADEK цветная внутри",
      optionsText: "Чёрный",
    });
    expect(lineStockLimit(q, labels)).toBe(5);
    expect(lineStockShortage(q, labels)).toEqual({ available: 5 });
    expect(lineStockShortage(simpleQuoteLine("uvItem", { id: "var-TZ1267S102" }, 5), labels)).toBeNull();
  });
});

describe("checkout out_of_stock answer", () => {
  it("maps the server answer to a per-line message in every language", () => {
    const out = checkoutOutcome(422, { error: "line_unavailable", index: 1, reason: "out_of_stock", code: "out_of_stock", available: 2 });
    expect(out).toEqual({ kind: "line_unavailable", index: 1, reason: "out_of_stock", available: 2 });
    if (out.kind !== "line_unavailable") throw new Error("kind");
    expect(lineUnavailableText(out, "Cană", shopT("ro"))).toBe("Cană: în stoc sunt doar 2 buc. Micșorează cantitatea.");
    expect(lineUnavailableText(out, "Кружка", shopT("ru"))).toBe("Кружка: в наличии только 2 шт. Уменьшите количество.");
    expect(lineUnavailableText({ ...out, available: 0, size: "L" }, "Tricou", shopT("en"))).toBe(
      "Tricou (L): no longer in stock. Remove it from the cart.",
    );
    // Other reasons keep the old message.
    expect(lineUnavailableText({ kind: "line_unavailable", index: 0 }, "X", shopT("ro"))).toBe(shopT("ro")("errLineUnavailable", { title: "X" }));
  });
});

describe("server stock check (pure)", () => {
  it("sums one variant across lines, in cart order", () => {
    const demands = shopStockDemands([
      { kind: "mug", productId: "a", quantity: 2 },
      { kind: "uv", source: "stock", variantId: "11111111-1111-4111-8111-111111111111", quantity: 1, zones: [] as never },
      { kind: "mug", productId: "a", quantity: 2 },
    ]);
    const balances = new Map<string, number | null>([
      ["a", 3],
      ["11111111-1111-4111-8111-111111111111", null],
    ]);
    expect(findStockShortage(demands, balances)).toEqual({ index: 2, available: 1 });
    expect(findStockShortage(demands, new Map([["a", 4]]))).toBeNull();
  });

  it("finds the DTF variant of a colour and size like the engine (case-insensitive, label fallback)", () => {
    const variants = [
      { id: "m", itemId: "it", options: { color: "Alb", size: "M" }, label: null, sortOrder: 0 },
      { id: "one", itemId: "it", options: { color: "Negru" }, label: null, sortOrder: 0 },
    ];
    expect(dtfSizeVariantId("it:alb", "m", variants)).toBe("m");
    expect(dtfSizeVariantId("it:negru", "—", variants)).toBe("one");
    expect(dtfSizeVariantId("it:alb", "XL", variants)).toBeNull();
    expect(dtfSizeVariantId("legacy-id", "M", variants)).toBeNull();
  });
});

describe("stock switch", () => {
  it("is on only for SHOP_STOCK_CHECK=1", () => {
    expect(shopStockCheckEnabled({})).toBe(false);
    expect(shopStockCheckEnabled({ SHOP_STOCK_CHECK: "0" })).toBe(false);
    expect(shopStockCheckEnabled({ SHOP_STOCK_CHECK: "true" })).toBe(false);
    expect(shopStockCheckEnabled({ SHOP_STOCK_CHECK: "1" })).toBe(true);
  });
});
