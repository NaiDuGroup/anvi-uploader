import { describe, expect, it } from "vitest";
import { discountedPrice, dtfRunDiscountPct, DEFAULT_DTF_SETTINGS } from "@/lib/dtf/dtfSettings";
import { cartReducer, checkoutLine, parseCart, serializeCart, type CartLine } from "./cart";
import { itemImages, mapShopCatalog, type CatalogItemRow, type CatalogPresetRow } from "./catalogConfig";
import { clearFieldError } from "./checkout";
import { firstDiscountQty, printDiscountPct, printUnitPrice } from "./dtfPrint";
import { itemsLabel, shopT } from "./i18n";
import { parseInline, parseLegalMarkdown } from "./legalMarkdown";
import { buildLineLabels, cartLineText, describeQuoteLine } from "./lineLabels";
import { commitQty, liveQty, sanitizeQtyDraft } from "./qty";
import { applyPlacedOrder, parseRecentOrders, rememberRecentOrder, RECENT_ORDERS_MAX } from "./recentOrders";
import { contactName, formatShopHours } from "./studioText";
import type { ShopPrintDiscount } from "./types";
import { DEFAULT_STUDIO_INFO } from "@/lib/studioInfo/studioInfo";

const line = (id: string, over: Partial<CartLine> = {}): CartLine => ({
  id,
  slug: "cana-alba",
  title: "Cană",
  optionsText: "",
  image: null,
  quote: { kind: "mug", productId: "v1", quantity: 1 },
  files: [],
  addedAt: 1,
  ...over,
});

describe("quantity field draft", () => {
  it("lets the field be empty while typing and clamps on commit", () => {
    expect(sanitizeQtyDraft("")).toBe("");
    expect(sanitizeQtyDraft("-5")).toBe("5");
    expect(sanitizeQtyDraft("1a2")).toBe("12");
    // Cleared field then «5» → 5 (not 15).
    expect(liveQty("", 1, 5000)).toBeNull();
    expect(liveQty("5", 1, 5000)).toBe(5);
    expect(liveQty("0", 1, 5000)).toBeNull();
    expect(liveQty("9999", 1, 5000)).toBeNull();
    expect(commitQty("", 1, 5000)).toBe(1);
    expect(commitQty("-5", 1, 5000)).toBe(5);
    expect(commitQty("9999", 1, 5000)).toBe(5000);
    expect(commitQty("", 0, 99)).toBe(0);
  });
});

describe("itemsLabel", () => {
  it("uses Romanian and Russian plurals", () => {
    expect(itemsLabel(1, "ro")).toBe("1 produs");
    expect(itemsLabel(2, "ro")).toBe("2 produse");
    expect(itemsLabel(19, "ro")).toBe("19 produse");
    expect(itemsLabel(20, "ro")).toBe("20 de produse");
    expect(itemsLabel(101, "ro")).toBe("101 produse");
    expect(itemsLabel(1, "ru")).toBe("1 товар");
    expect(itemsLabel(3, "ru")).toBe("3 товара");
    expect(itemsLabel(5, "ru")).toBe("5 товаров");
    expect(itemsLabel(11, "ru")).toBe("11 товаров");
    expect(itemsLabel(21, "ru")).toBe("21 товар");
    expect(itemsLabel(22, "ru")).toBe("22 товара");
  });
});

describe("T-shirt print price per piece", () => {
  const settings = DEFAULT_DTF_SETTINGS;
  const discount: ShopPrintDiscount = {
    steps: [
      { minQty: settings.runDiscount1MinQty, pct: settings.runDiscount1Pct },
      { minQty: settings.runDiscount2MinQty, pct: settings.runDiscount2Pct },
      { minQty: settings.runDiscount3MinQty, pct: settings.runDiscount3Pct },
    ],
    roundTo: settings.runDiscountRoundToMdl,
  };

  it("matches the server's run discount and rounding", () => {
    for (const q of [1, 2, 9, 10, 49, 50, 200]) {
      expect(printDiscountPct(discount, q)).toBe(dtfRunDiscountPct(settings, q));
      expect(printUnitPrice({ price: 180 }, q, discount)).toBe(
        discountedPrice(180, dtfRunDiscountPct(settings, q), settings.runDiscountRoundToMdl),
      );
    }
  });

  it("A4 front at 2 shirts is 165 per piece (the quote's «Imprimare 330»)", () => {
    expect(printUnitPrice({ price: 180 }, 1, discount)).toBe(180);
    expect(printUnitPrice({ price: 180 }, 2, discount) * 2).toBe(330);
    expect(printUnitPrice({ price: 180 }, 2, discount, 10)).toBe(175);
    expect(firstDiscountQty(discount)).toBe(2);
    expect(firstDiscountQty(null)).toBeNull();
    expect(printUnitPrice({ price: 180 }, 50, null)).toBe(180);
  });
});

const ROWS: CatalogItemRow[] = [
  {
    id: "mug1",
    sku: "S1-KB-320",
    isActive: true,
    imageUrl: "https://cdn/m.jpg",
    galleryImages: [],
    variants: [{ id: "v320", isActive: true, options: {}, sellPrice: 130, priceTiers: null, sortOrder: 0 }],
  },
  {
    id: "mug2",
    sku: "S3-KB-450",
    isActive: true,
    imageUrl: "https://cdn/m2.jpg",
    galleryImages: [],
    variants: [{ id: "v450", isActive: true, options: {}, sellPrice: 150, priceTiers: null, sortOrder: 0 }],
  },
  {
    id: "shirtB",
    sku: "CA6502-02",
    isActive: true,
    imageUrl: "https://cdn/1793203075770-CA65020102.jpg",
    galleryImages: ["https://cdn/1793380436360-CA65020102.jpg", "https://cdn/1793380436412-CA65020102.jpg"],
    variants: ["M", "L"].map((size, i) => ({
      id: `b-${size}`,
      isActive: true,
      options: { size, color: "чёрный" },
      sellPrice: 100,
      priceTiers: [
        { minQty: 1, priceMdl: 100 },
        { minQty: 2, priceMdl: 95 },
        { minQty: 50, priceMdl: 70 },
      ],
      sortOrder: i,
    })),
  },
];
const PRESETS: CatalogPresetRow[] = [
  { id: "11111111-1111-4111-8111-111111111111", label: "A4", widthCm: 21, heightCm: 29.7, retailPrice: 180 },
  { id: "22222222-2222-4222-8222-222222222222", label: "A6", widthCm: 10.5, heightCm: 14.8, retailPrice: 100 },
];
const PRICING = {
  printDiscount: { steps: [{ minQty: 2, pct: 7 }, { minQty: 50, pct: 29 }], roundTo: 5 },
  pressFeeMdl: 0,
};

describe("catalog: gallery filter and run-size prices", () => {
  it("drops photos of colours that are not sold", () => {
    expect(itemImages(ROWS[2]!, ["1793380436412-"])).toEqual([
      "https://cdn/1793203075770-CA65020102.jpg",
      "https://cdn/1793380436360-CA65020102.jpg",
    ]);
    const shirt = mapShopCatalog(ROWS, PRESETS, "ro", PRICING).products.find((p) => p.slug === "tricou-dogo")!;
    expect(shirt.dtf!.colors[0]!.images.some((u) => u.includes("1793380436412"))).toBe(false);
  });

  it("hides the production lifestyle photos and the duplicate main photo of the T-shirt", () => {
    const key = (ts: string, c: string) => `catalog/stock/${ts}-CA650201${c}.jpg`;
    const prod = (id: string, sku: string, c: string, main: string, gallery: string[]): CatalogItemRow => ({
      ...ROWS[2]!,
      id,
      sku,
      imageUrl: key(main, c),
      galleryImages: gallery.map((ts) => key(ts, c)),
    });
    const rows = [
      prod("w", "CA6502-01", "01", "1793204182908", [
        "1793382803221", "1793382803219", "1793382803217", "1793382803225",
        "1793382803638", "1793382803630", "1793382803633", "1793382803636",
      ]),
      prod("b", "CA6502-02", "02", "1793204182934", [
        "1793382800942", "1793382800953", "1793382800956", "1793382800890",
        "1793382801267", "1793382801261", "1793382801264", "1793382801269",
      ]),
    ];
    const shirt = mapShopCatalog(rows, PRESETS, "ro", PRICING).products.find((p) => p.slug === "tricou-dogo")!;
    const shown = (sku: string) =>
      shirt.dtf!.colors.find((c) => c.key === sku)!.images.map((u) => decodeURIComponent(u).match(/(\d{13})-/)![1]);
    expect(shown("CA6502-01")).toEqual(["1793204182908", "1793382803219", "1793382803217", "1793382803225"]);
    expect(shown("CA6502-02")).toEqual(["1793204182934", "1793382800953", "1793382800956", "1793382800890"]);
  });

  it("only products with tiers get «de la X/buc.» and a tier table", () => {
    const { products } = mapShopCatalog(ROWS, PRESETS, "ro", PRICING);
    const mug = products.find((p) => p.slug === "cana-alba")!;
    expect(mug.unitFrom).toBeNull();
    const shirt = products.find((p) => p.slug === "tricou-dogo")!;
    expect(shirt.dtf!.colors[0]!.tiers).toEqual([
      { minQty: 1, maxQty: 1, price: 100 },
      { minQty: 2, maxQty: 49, price: 95 },
      { minQty: 50, maxQty: null, price: 70 },
    ]);
    // 70 (item at 50+) + A6 100 −29 % → 70 (rounded to 5 lei).
    expect(shirt.unitFrom).toBe(140);
    expect(shirt.dtf!.printDiscount).toEqual(PRICING.printDiscount);
  });
});

describe("line labels in the current language", () => {
  const ro = mapShopCatalog(ROWS, PRESETS, "ro", PRICING).products;
  const ru = mapShopCatalog(ROWS, PRESETS, "ru", PRICING).products;
  const shirtQuote = {
    kind: "dtf" as const,
    garmentId: "shirtB:чёрный",
    sizes: [
      { size: "M", quantity: 2 },
      { size: "L", quantity: 1 },
    ],
    zones: [
      { id: "front", placement: "front" as const, presetId: PRESETS[0]!.id },
      { id: "back", placement: "back" as const, presetId: PRESETS[1]!.id },
    ],
  };

  it("rebuilds the title and options from the keys", () => {
    expect(describeQuoteLine(shirtQuote, buildLineLabels(ro), shopT("ro"))).toEqual({
      slug: "tricou-dogo",
      title: "Tricou DOGO cu imprimare",
      optionsText: "Negru · M×2, L×1 · Față: A4 · Spate: A6",
    });
    expect(describeQuoteLine(shirtQuote, buildLineLabels(ru), shopT("ru"))?.optionsText).toBe(
      "Чёрная · M×2, L×1 · Спереди: A4 · Сзади: A6",
    );
    expect(describeQuoteLine({ kind: "mug", productId: "v450", quantity: 1 }, buildLineLabels(ru), shopT("ru"))).toEqual({
      slug: "cana-alba",
      title: "Белая кружка с печатью",
      optionsText: "450 мл",
    });
  });

  it("keeps the stored text of lines the catalog no longer knows (old carts)", () => {
    const old = line("x", { title: "Cană veche", optionsText: "albă", quote: { kind: "mug", productId: "gone", quantity: 1 } });
    expect(cartLineText(old, buildLineLabels(ru), shopT("ru"))).toEqual({ slug: "cana-alba", title: "Cană veche", optionsText: "albă" });
    expect(cartLineText(old, null, shopT("ru")).title).toBe("Cană veche");
  });

  it("a single-size line stepped in the cart says the new count", () => {
    let cart = [line("s", { quote: { ...shirtQuote, sizes: [{ size: "M", quantity: 1 }] } })];
    cart = cartReducer(cart, { type: "setQty", id: "s", quantity: 2 });
    expect(cartLineText(cart[0]!, buildLineLabels(ro), shopT("ro")).optionsText).toContain("M×2");
  });
});

describe("cart edit and checkout lines", () => {
  it("updates a line in place and removes only the given ids", () => {
    let s = [line("a"), line("b"), line("c")];
    s = cartReducer(s, { type: "update", line: line("b", { title: "Nouă" }) });
    expect(s.map((l) => [l.id, l.title])).toEqual([
      ["a", "Cană"],
      ["b", "Nouă"],
      ["c", "Cană"],
    ]);
    expect(cartReducer(s, { type: "removeIds", ids: ["a", "c"] }).map((l) => l.id)).toEqual(["b"]);
  });

  it("sends the DTF file zone and the line name in the checkout language", () => {
    const l = line("d", {
      quote: { kind: "dtf", garmentId: "g", sizes: [{ size: "M", quantity: 1 }], zones: [{ id: "back", placement: "back", presetId: null }] },
      files: [{ fileKey: "uploads/x.png", fileName: "x.png", zone: "back", lowRes: true }],
    });
    const body = checkoutLine(l, { title: "Футболка", optionsText: "Чёрная" });
    expect(body.files).toEqual([{ fileKey: "uploads/x.png", fileName: "x.png", zone: "back" }]);
    expect(body.title).toBe("Футболка");
    expect(body.optionsText).toBe("Чёрная");
    // The zone survives a reload of the cart.
    expect(parseCart(serializeCart([l]))[0]!.files[0]!.zone).toBe("back");
  });
});

describe("clearing the cart after an order", () => {
  it("removes exactly the ordered lines, once per order", () => {
    const cart = [line("a"), line("b")];
    const first = applyPlacedOrder(cart, [], { token: "t1", number: 12, lineIds: ["a", "b"], at: 5 });
    expect(first.cart).toEqual([]);
    expect(first.cleared).toBe(true);
    expect(first.orders).toEqual([{ token: "t1", number: "12", at: 5, cleared: true }]);

    // A new item added after the order (this tab or another one) is never lost on a repeat.
    const later = [line("n")];
    const again = applyPlacedOrder(later, first.orders, { token: "t1", lineIds: ["a", "b", "n"], at: 9 });
    expect(again.cart.map((l) => l.id)).toEqual(["n"]);
    expect(again.cleared).toBe(false);
  });

  it("keeps lines added while the order was being placed", () => {
    const cart = [line("a"), line("added-meanwhile")];
    expect(applyPlacedOrder(cart, [], { token: "t2", lineIds: ["a"], at: 1 }).cart.map((l) => l.id)).toEqual(["added-meanwhile"]);
  });

  it("keeps the last orders, newest first, and reads the old single-token key", () => {
    let list = parseRecentOrders(null, "legacy");
    expect(list).toEqual([{ token: "legacy", number: null, at: 0 }]);
    for (let i = 0; i < 7; i++) list = rememberRecentOrder(list, { token: `t${i}`, number: i, at: i });
    expect(list).toHaveLength(RECENT_ORDERS_MAX);
    expect(list[0]!.token).toBe("t6");
    list = rememberRecentOrder(list, { token: "t3", at: 99 });
    expect(list[0]).toEqual({ token: "t3", number: "3", at: 3 });
    expect(parseRecentOrders(JSON.stringify(list))).toEqual(list);
    expect(parseRecentOrders("{broken")).toEqual([]);
  });
});

describe("checkout errors", () => {
  it("clears a field's message as soon as it changes", () => {
    const errors = { address: true, terms: true, name: true } as const;
    expect(clearFieldError(errors, "address")).toEqual({ terms: true, name: true });
    expect(clearFieldError(errors, "acceptTerms")).toEqual({ address: true, name: true });
    expect(clearFieldError({ city: true, address: true }, "method")).toEqual({});
    expect(clearFieldError(errors, "note")).toBe(errors);
  });
});

describe("studio text", () => {
  it("writes Cyrillic contact names the Romanian way on RO pages", () => {
    expect(contactName("Ангелина", "ro")).toBe("Anghelina");
    expect(contactName("Анатолий", "ro")).toBe("Anatolii");
    expect(contactName("Ангелина", "ru")).toBe("Ангелина");
    expect(contactName("Ana", "ro")).toBe("Ana");
  });

  it("summarises the opening hours", () => {
    expect(formatShopHours(DEFAULT_STUDIO_INFO.hours, "ro")).toBe(
      "Lu–Vi 9:00–18:00 · Sâ 10:00–15:00 · Du închis (pauză 12:30–13:10)",
    );
    expect(formatShopHours(DEFAULT_STUDIO_INFO.hours, "ru")).toBe(
      "Пн–Пт 9:00–18:00 · Сб 10:00–15:00 · Вс выходной (перерыв 12:30–13:10)",
    );
  });
});

describe("legal markdown", () => {
  it("parses the subset the drafts use, without passing HTML or unsafe links", () => {
    const blocks = parseLegalMarkdown(
      [
        "# Titlu",
        "",
        "*Versiune*",
        "",
        "## 1. Vânzătorul",
        "Text **bold** și [link](https://anvi.md) și [rău](javascript:alert(1)).",
        "",
        "- unu",
        "- doi",
        "",
        "1. primul",
        "2. al doilea",
        "",
        "| A | B |",
        "|---|---|",
        "| 1 | 2 |",
        "",
        "> notă",
        "---",
        "<script>x</script>",
      ].join("\n"),
    );
    expect(blocks.map((b) => b.kind)).toEqual(["heading", "para", "heading", "para", "list", "list", "table", "quote", "rule", "para"]);
    expect(parseInline("a [x](javascript:1)")).toEqual([{ kind: "text", text: "a [x](javascript:1)" }]);
    const table = blocks[6]!;
    expect(table.kind === "table" && table.rows.length).toBe(1);
    const last = blocks[9]!;
    expect(last.kind === "para" && last.text).toEqual([{ kind: "text", text: "<script>x</script>" }]);
  });
});
