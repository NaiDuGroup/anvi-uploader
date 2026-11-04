import { describe, expect, it } from "vitest";
import { canStepQuantity, cartCount, cartReducer, checkoutLine, parseCart, serializeCart, type CartLine } from "./cart";
import { mapShopCatalog, priceTierTable, SHOP_PRODUCTS, type CatalogItemRow, type CatalogPresetRow } from "./catalogConfig";
import { buildCheckoutBody, checkoutOutcome, validateCheckout, type CheckoutForm } from "./checkout";
import { effectiveDpi, frontPlacementFor, shirtZones } from "./dtfPrint";
import { formatPrice } from "./format";
import { shopT } from "./i18n";
import { orderSteps } from "./orderStatus";

const mugLine = (id: string, quantity = 1): CartLine => ({
  id,
  slug: "cana-alba",
  title: "Cană",
  optionsText: "320 ml",
  image: null,
  quote: { kind: "mug", productId: "v1", quantity },
  files: [{ fileKey: "uploads/a.png", fileName: "a.png", sizeBytes: 10, lowRes: true }],
  addedAt: 1,
});

describe("formatPrice", () => {
  it("formats whole and fractional lei in both languages", () => {
    expect(formatPrice(139, "ro")).toBe("139 lei");
    expect(formatPrice(139, "ru")).toBe("139 лей");
    expect(formatPrice(12.5, "ro")).toBe("12,50 lei");
    expect(formatPrice(1280, "ro")).toBe("1 280 lei");
  });
});

describe("shopT", () => {
  it("fills placeholders", () => {
    expect(shopT("ro")("fromPrice", { price: "200 lei" })).toBe("de la 200 lei");
    expect(shopT("ru")("fromPrice", { price: "200 лей" })).toBe("от 200 лей");
  });
});

describe("cart", () => {
  it("adds, changes quantity, removes and clears", () => {
    let s = cartReducer([], { type: "add", line: mugLine("a") });
    s = cartReducer(s, { type: "add", line: mugLine("b", 2) });
    // The badge counts lines, not pieces.
    expect(cartCount(s)).toBe(2);
    s = cartReducer(s, { type: "setQty", id: "a", quantity: 5 });
    expect(s[0]!.quote).toMatchObject({ quantity: 5 });
    s = cartReducer(s, { type: "setQty", id: "a", quantity: 0 });
    expect(s[0]!.quote).toMatchObject({ quantity: 1 });
    s = cartReducer(s, { type: "remove", id: "b" });
    expect(s.map((l) => l.id)).toEqual(["a"]);
    expect(cartReducer(s, { type: "clear" })).toEqual([]);
  });

  it("does not step a multi-size DTF line", () => {
    const line: CartLine = {
      ...mugLine("d"),
      quote: {
        kind: "dtf",
        garmentId: "item:белый",
        sizes: [
          { size: "M", quantity: 2 },
          { size: "L", quantity: 1 },
        ],
        zones: [{ id: "front", placement: "front", presetId: "p" }],
      },
    };
    expect(canStepQuantity(line.quote)).toBe(false);
    expect(cartReducer([line], { type: "setQty", id: "d", quantity: 9 })[0]!.quote).toBe(line.quote);
    expect(cartCount([line])).toBe(1);
  });

  it("round-trips storage and drops malformed lines", () => {
    expect(parseCart(serializeCart([mugLine("a")]))).toHaveLength(1);
    expect(parseCart("not json")).toEqual([]);
    expect(parseCart(JSON.stringify({ lines: [{ id: "x" }, { ...mugLine("y"), quote: { kind: "bad" } }] }))).toEqual([]);
  });

  it("builds the checkout line without client-only file hints", () => {
    expect(checkoutLine(mugLine("a"))).toEqual({
      quote: { kind: "mug", productId: "v1", quantity: 1 },
      files: [{ fileKey: "uploads/a.png", fileName: "a.png", sizeBytes: 10 }],
      title: "Cană",
      optionsText: "320 ml",
    });
  });
});

describe("catalog mapping", () => {
  const variant = (id: string, extra: Partial<CatalogItemRow["variants"][number]> = {}) => ({
    id,
    isActive: true,
    options: {},
    sellPrice: 189,
    priceTiers: null,
    sortOrder: 0,
    ...extra,
  });
  const items: CatalogItemRow[] = [
    {
      id: "n1",
      sku: "S3-KBL-A5",
      isActive: true,
      imageUrl: "catalog/x.jpg",
      galleryImages: ["catalog/x.jpg", "catalog/y.jpg"],
      variants: [variant("vn1")],
    },
    { id: "n2", sku: "S3-ZBL-A5", isActive: false, imageUrl: null, galleryImages: [], variants: [variant("vn2")] },
    {
      id: "t1",
      sku: "CA6502-01",
      isActive: true,
      imageUrl: null,
      galleryImages: [],
      variants: ["XXL", "S", "M"].map((size, i) =>
        variant(`vt${i}`, { options: { size, color: "Белый" }, sellPrice: 100, priceTiers: [{ minQty: 1, priceMdl: 100 }] }),
      ),
    },
  ];
  const presets: CatalogPresetRow[] = [
    { id: "logo", label: "Logo 10×10", widthCm: 10, heightCm: 10, retailPrice: 100 },
    { id: "a4", label: "A4 21×30", widthCm: 21, heightCm: 30, retailPrice: 180 },
  ];

  it("maps only active items, with live prices and photos", () => {
    const { products, categories } = mapShopCatalog(items, presets, "ro");
    const nb = products.find((p) => p.slug === "carnet-a5")!;
    expect(nb.variants.map((v) => v.id)).toEqual(["vn1"]);
    expect(nb.fromPrice).toBe(189);
    expect(nb.variants[0]!.images).toEqual([
      "/api/public/file?key=catalog%2Fx.jpg&bucket=catalog",
      "/api/public/file?key=catalog%2Fy.jpg&bucket=catalog",
    ]);
    const shirt = products.find((p) => p.slug === "tricou-dogo")!;
    expect(shirt.dtf!.colors[0]!.garmentId).toBe("t1:белый");
    expect(shirt.dtf!.colors[0]!.sizes).toEqual(["S", "M", "XXL"]);
    expect(shirt.fromPrice).toBe(200);
    expect(products.some((p) => p.slug === "pix-ardenes")).toBe(false);
    expect(categories.map((c) => c.slug)).toEqual(["caiete", "tricouri"]);
  });

  it("uses unique SKUs and slugs", () => {
    const skus = SHOP_PRODUCTS.flatMap((p) => p.options.map((o) => o.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(new Set(SHOP_PRODUCTS.map((p) => p.slug)).size).toBe(SHOP_PRODUCTS.length);
  });
});

describe("DTF print picker", () => {
  const prints = [
    { presetId: "logo", label: "Logo", widthCm: 10, heightCm: 10, price: 100 },
    { presetId: "a5", label: "A5", widthCm: 15, heightCm: 21, price: 140 },
    { presetId: "a3", label: "A3", widthCm: 30, heightCm: 42, price: 220 },
  ];
  it("places front prints by size and adds the back", () => {
    expect(frontPlacementFor(prints[0]!)).toBe("chest_left");
    expect(frontPlacementFor(prints[1]!)).toBe("chest_center");
    expect(frontPlacementFor(prints[2]!)).toBe("front");
    expect(shirtZones({ front: "a5", back: "a3" }, prints)).toEqual([
      { id: "front", placement: "chest_center", presetId: "a5" },
      { id: "back", placement: "back", presetId: "a3" },
    ]);
    expect(shirtZones({ front: null, back: null }, prints)).toEqual([]);
  });
  it("computes the print dpi on the best orientation", () => {
    expect(effectiveDpi({ width: 2480, height: 3508 }, { widthCm: 21, heightCm: 29.7 })).toBe(300);
    expect(effectiveDpi({ width: 3508, height: 2480 }, { widthCm: 21, heightCm: 29.7 })).toBe(300);
  });
});

describe("checkout", () => {
  const form: CheckoutForm = {
    name: "Ana",
    phone: "+373 79 123 456",
    email: "",
    method: "courier_chisinau",
    city: "",
    address: "str. Ștefan cel Mare 1",
    note: "",
    acceptTerms: true,
  };
  it("validates contacts, address and terms", () => {
    expect(validateCheckout(form)).toEqual({});
    expect(validateCheckout({ ...form, phone: "12", address: "", acceptTerms: false, email: "x@" })).toEqual({
      phone: true,
      address: true,
      terms: true,
      email: true,
    });
    expect(validateCheckout({ ...form, method: "courier_moldova" })).toEqual({ city: true });
    expect(validateCheckout({ ...form, method: "pickup", address: "" })).toEqual({});
  });
  it("builds the exact request body", () => {
    expect(buildCheckoutBody(form, [mugLine("a")], "ru")).toEqual({
      locale: "ru",
      customer: { name: "Ana", phone: "+373 79 123 456" },
      delivery: { method: "courier_chisinau", city: "Chișinău", address: "str. Ștefan cel Mare 1" },
      lines: [checkoutLine(mugLine("a"))],
      acceptTerms: true,
    });
  });
  it("maps answers to outcomes", () => {
    const created = { orderId: "o", orderNumber: 12, publicToken: "tok", total: 1, deliveryPrice: 0, subtotal: 1 };
    expect(checkoutOutcome(201, { ...created, payment: { provider: "test", redirectUrl: "/shop/pay/test?token=tok" } }).kind).toBe(
      "redirect",
    );
    expect(checkoutOutcome(201, { ...created, payment: { provider: "none", redirectUrl: null } })).toEqual({
      kind: "payment_soon",
      orderNumber: "12",
      token: "tok",
    });
    expect(checkoutOutcome(503, { error: "payment_not_configured", publicToken: "tok", orderNumber: 5 }).kind).toBe("payment_soon");
    expect(checkoutOutcome(422, { error: "line_unavailable", index: 1 })).toEqual({ kind: "line_unavailable", index: 1 });
    expect(checkoutOutcome(400, {}).kind).toBe("invalid");
    expect(checkoutOutcome(429, {}).kind).toBe("rate_limited");
    expect(checkoutOutcome(500, null).kind).toBe("server");
  });
});

describe("order steps", () => {
  it("marks reached steps done and the next one current", () => {
    expect(orderSteps("paid", "courier_chisinau").map((s) => s.state)).toEqual(["done", "current", "todo", "todo"]);
    expect(orderSteps("shipped", "courier_moldova").map((s) => s.state)).toEqual(["done", "done", "done", "current"]);
    expect(orderSteps("delivered", "pickup").map((s) => s.label)).toEqual(["stPaid", "stPrinting", "stPickupReady", "stPickedUp"]);
    expect(orderSteps("pending_payment", "pickup").every((s) => s.state === "todo")).toBe(true);
  });
});

describe("priceTierTable", () => {
  it("consecutive ranges, last one open", () => {
    expect(
      priceTierTable([
        { minQty: 5, priceMdl: 60 },
        { minQty: 1, priceMdl: 100 },
        { minQty: 2, priceMdl: 80 },
      ]),
    ).toEqual([
      { minQty: 1, maxQty: 1, price: 100 },
      { minQty: 2, maxQty: 4, price: 80 },
      { minQty: 5, maxQty: null, price: 60 },
    ]);
  });

  it("no table for a single tier or no tiers", () => {
    expect(priceTierTable([{ minQty: 1, priceMdl: 100 }])).toEqual([]);
    expect(priceTierTable(null)).toEqual([]);
  });
});
