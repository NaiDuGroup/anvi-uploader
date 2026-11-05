import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  order: { update: vi.fn() },
  stockVariant: { findMany: vi.fn() },
  stockItem: { findMany: vi.fn(async () => [] as unknown[]) },
  printPricePreset: { findMany: vi.fn(async () => [] as unknown[]) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db, HEAVY_TX_OPTIONS: {} }));

const quote = vi.hoisted(() => ({ quotePublicLines: vi.fn() }));
vi.mock("@/lib/publicQuote/publicQuote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicQuote/publicQuote")>()),
  quotePublicLines: quote.quotePublicLines,
}));

const create = vi.hoisted(() => ({
  resolveOrderLines: vi.fn(),
  createOrderWithResolvedLines: vi.fn(),
}));
vi.mock("@/lib/orderCreate/orderLines", () => create);

const clients = vi.hoisted(() => ({ findClientIdByOrderPhone: vi.fn() }));
vi.mock("@/lib/findClientByOrderPhone", () => clients);

const files = vi.hoisted(() => ({ copyUploadToShopOrders: vi.fn() }));
vi.mock("./shopFiles", () => files);

const accounts = vi.hoisted(() => ({ findOrCreateShopCustomer: vi.fn() }));
vi.mock("./account/customers", () => accounts);
const accountData = vi.hoisted(() => ({ ownsReusableShopFile: vi.fn() }));
vi.mock("./account/data", () => accountData);
const lineLabels = vi.hoisted(() => ({ loadShopLineLabels: vi.fn() }));
vi.mock("@/lib/storefront/lineLabelsServer", () => lineLabels);

const bcShop = vi.hoisted(() => ({ resolveShopBusinessCardLine: vi.fn() }));
vi.mock("./businessCardShop", () => bcShop);

// A real provider is not implemented yet (Paynet stub): tests inject one.
const pay = vi.hoisted(() => ({ override: null as null | (() => unknown) }));
vi.mock("./payment", async (importOriginal) => {
  const m = await importOriginal<typeof import("./payment")>();
  return {
    ...m,
    resolvePaymentProvider: (...args: Parameters<typeof m.resolvePaymentProvider>) =>
      pay.override ? pay.override() : m.resolvePaymentProvider(...args),
  };
});

import { paynetProvider } from "./payment";
import { buildShopStaffNotes, runShopCheckout } from "./checkout";
import { shopPhoneE164 } from "./checkoutSchema";
import { kindNeedsFile, SHOP_FILE_REQUIRED_KINDS } from "@/lib/storefront/fileRules";

const realProvider = {
  name: "paynet",
  startPayment: vi.fn(async () => ({ provider: "paynet", redirectUrl: "https://pay.example/x", paymentRef: "P-1" })),
};

const DEV = { NODE_ENV: "development" };
const PROD = { NODE_ENV: "production", VERCEL_ENV: "production" };
const STOCK_ON = { ...DEV, SHOP_STOCK_CHECK: "1" };

const KEY = "uploads/1762250000000-abcdefgh-logo.png";

function body(over: Record<string, unknown> = {}) {
  return {
    locale: "ro",
    customer: { name: "Ion Popescu", phone: "+373 69 123 456", email: "Ion@Example.com" },
    delivery: { method: "courier_chisinau", city: "Chișinău", address: "str. Ștefan cel Mare 1" },
    lines: [
      {
        quote: { kind: "mug", productId: "mug-1", quantity: 3 },
        files: [{ fileKey: KEY, fileName: "logo.png", sizeBytes: 1234 }],
        title: "Cană albă 320 ml",
        optionsText: "Imprimare full",
        note: "logo centrat",
        // Client-side prices must be ignored.
        total: 1,
        unitPrice: 0.33,
      },
    ],
    acceptTerms: true,
    total: 1,
    ...over,
  };
}

function okLine(total: number, quantity: number, kind = "mug") {
  return { ok: true, kind, quantity, unitPrice: total / quantity, total, currency: "MDL" };
}

beforeEach(() => {
  vi.clearAllMocks();
  pay.override = null;
  quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(300, 3)], subtotal: 300 });
  files.copyUploadToShopOrders.mockImplementation(async (k: string) => k.replace(/^uploads\//, "shop-orders/"));
  create.resolveOrderLines.mockImplementation(async (inputs: unknown[]) => ({
    resolved: inputs.map((input) => ({ input })),
    lfLineTotalsMdl: new Map(),
  }));
  create.createOrderWithResolvedLines.mockImplementation(async () => ({
    id: "order-1",
    orderNumber: 1234,
    publicToken: "tok_abc",
  }));
  clients.findClientIdByOrderPhone.mockResolvedValue("client-7");
  accounts.findOrCreateShopCustomer.mockResolvedValue({ id: "cust-by-email" });
  accountData.ownsReusableShopFile.mockResolvedValue(false);
  lineLabels.loadShopLineLabels.mockResolvedValue(null);
  // No balances found: every line is treated as available (the stock tests set their own).
  db.stockVariant.findMany.mockResolvedValue([]);
});

const UV_VARIANT = "6f1c1a3e-2222-4a2b-9c3d-123456789abc";

/** A valid storefront quote line of `kind` (UV: the shop's stock-item line). */
function lineOf(kind: string, quantity = 1): Record<string, unknown> {
  if (kind === "businessCard") return { kind, pricing: "shopPack", sides: "one", quantity: 100 };
  if (kind === "print") return { kind, mode: "photo", items: [{ size: "10x15", finish: "glossy", copies: quantity }] };
  if (kind === "sublimation") return { kind, variantId: UV_VARIANT, quantity };
  return kind === "uv"
    ? { kind, source: "stock", variantId: UV_VARIANT, quantity, zones: [{ id: "main", placement: "front" }] }
    : { kind, productId: "p-1", quantity };
}

describe("runShopCheckout — validation", () => {
  it("answers 400 with field errors", async () => {
    const res = await runShopCheckout(
      body({
        customer: { name: "", phone: "12" },
        delivery: { method: "courier_moldova" },
        acceptTerms: false,
      }),
      DEV,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("invalid_input");
    const fe = res.body.fieldErrors as Record<string, string>;
    expect(Object.keys(fe)).toEqual(
      expect.arrayContaining(["customer.name", "customer.phone", "acceptTerms", "delivery.city", "delivery.address"]),
    );
    expect(quote.quotePublicLines).not.toHaveBeenCalled();
  });

  it("pickup needs no address", async () => {
    const res = await runShopCheckout(body({ delivery: { method: "pickup" } }), DEV);
    expect(res.status).toBe(201);
    expect(res.body.deliveryPrice).toBe(0);
  });

  it("refuses file keys outside the order upload scope", async () => {
    for (const fileKey of ["catalog/mugs/1762250000000-x-a.png", "uploads/../catalog/a.png", "uploads/no-ts.png", "https://x.y/a.png"]) {
      const b = body();
      (b.lines as { files: { fileKey: string }[] }[])[0]!.files[0]!.fileKey = fileKey;
      const res = await runShopCheckout(b, DEV);
      expect(res.status).toBe(400);
      expect((res.body.fieldErrors as Record<string, string>)["lines.0.files.0.fileKey"]).toBeDefined();
    }
  });

  it("caps the cart at 30 lines", async () => {
    const line = (body().lines as unknown[])[0];
    const res = await runShopCheckout(body({ lines: Array.from({ length: 31 }, () => line) }), DEV);
    expect(res.status).toBe(400);
    expect((res.body.fieldErrors as Record<string, string>).lines).toBeDefined();
  });

  it("requires artwork for every file-required kind (the rule the shop UI uses)", async () => {
    for (const kind of SHOP_FILE_REQUIRED_KINDS) {
      quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(100, 1, kind)], subtotal: 100 });
      const res = await runShopCheckout(
        body({ lines: [{ quote: lineOf(kind), title: "X" }] }),
        DEV,
      );
      expect(res.status).toBe(400);
      expect(res.body.fieldErrors).toEqual({ "lines.0.files": "required" });
    }
  });

  it("a DTF line may be ordered without a file (the product page says so)", async () => {
    expect(kindNeedsFile("dtf")).toBe(false);
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(200, 1, "dtf")], subtotal: 200 });
    const res = await runShopCheckout(
      body({
        lines: [
          {
            quote: {
              kind: "dtf",
              garmentId: "11111111-1111-4111-8111-111111111111",
              sizes: [{ size: "L", quantity: 1 }],
              zones: [{ id: "front", placement: "front", presetId: "22222222-2222-4222-8222-222222222222" }],
            },
            title: "Tricou",
          },
        ],
      }),
      DEV,
    );
    expect(res.body.fieldErrors).toBeUndefined();
  });

  it("saves the phone as E.164", async () => {
    await runShopCheckout(body({ customer: { name: "Ion", phone: "060 000 000" } }), DEV);
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].order.phone).toBe("+37360000000");
    expect(shopPhoneE164("+373.60000000")).toBe("+37360000000");
    expect(shopPhoneE164("60000000")).toBe("+37360000000");
    expect(shopPhoneE164("+373 060 000 000")).toBe("+37360000000");
    expect(shopPhoneE164("0037369123456")).toBe("+37369123456");
    expect(shopPhoneE164("+40 721 000 000")).toBe("+40721000000");
  });

  it("requires artwork for mug / notebook / pen lines", async () => {
    const b = body();
    delete (b.lines as { files?: unknown }[])[0]!.files;
    const res = await runShopCheckout(b, DEV);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "required" });
  });
});

describe("runShopCheckout — pricing", () => {
  it("422 when a line has no price, with its index", async () => {
    const b = body();
    (b.lines as unknown[]).push({ quote: { kind: "pen", productId: "p", quantity: 1 }, files: [{ fileKey: KEY, fileName: "a.png" }], title: "Pix" });
    quote.quotePublicLines.mockResolvedValue({
      currency: "MDL",
      lines: [okLine(300, 3), { ok: false, kind: "pen", reason: "price_unavailable", code: "price_not_set" }],
      subtotal: null,
    });
    const res = await runShopCheckout(b, DEV);
    expect(res).toEqual({
      status: 422,
      body: { error: "line_unavailable", index: 1, reason: "price_unavailable", code: "price_not_set" },
    });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("does not sell plain stock items online yet", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(60, 1, "stockItem")], subtotal: 60 });
    const res = await runShopCheckout(
      body({
        lines: [{ quote: { kind: "stockItem", variantId: "6f1c1a3e-1111-4a2b-9c3d-123456789abc", quantity: 1 }, title: "Geantă" }],
      }),
      DEV,
    );
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "line_unavailable", index: 0, reason: "not_orderable" });
  });

  it("re-prices on the server and ignores client totals; adds delivery", async () => {
    const res = await runShopCheckout(body(), DEV);
    expect(quote.quotePublicLines).toHaveBeenCalledWith([{ kind: "mug", productId: "mug-1", quantity: 3 }], "ro");
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      orderId: "order-1",
      orderNumber: 1234,
      publicToken: "tok_abc",
      total: 345,
      deliveryPrice: 45,
      subtotal: 300,
      payment: { provider: "test", redirectUrl: "/shop/pay/test?token=tok_abc" },
    });
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.price.toString()).toBe("345");
    expect(args.order.deliveryPriceMdl.toString()).toBe("45");
  });

  it("uses the season Moldova price from env", async () => {
    const res = await runShopCheckout(
      body({ delivery: { method: "courier_moldova", city: "Bălți", address: "str. X 1" } }),
      { ...DEV, SHOP_DELIVERY_MOLDOVA_MDL: "70" },
    );
    expect(res.body).toMatchObject({ deliveryPrice: 70, total: 370 });
  });
});

describe("runShopCheckout — DTF bag / toy", () => {
  const A4 = "a8ba2aeb-77ad-4d1a-974f-cf13dbd83f3f";
  const A6 = "930452c6-a866-40d0-8e98-b7fc2bacb975";
  const presetRows = [
    { id: A4, widthCm: 21, heightCm: 30 },
    { id: A6, widthCm: 10, heightCm: 15 },
  ];
  const itemLine = (zones: unknown[]) => ({
    quote: { kind: "dtf", garmentId: "fe814143-0cb2-42d7-b9bb-d39352f74c9e:", sizes: [{ size: "—", quantity: 1 }], zones },
    title: "X",
  });

  it("refuses a print bigger than the item's fallback limit (SEDNA ≤ A6), with the line and the code", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(300, 1, "dtf")], subtotal: 300 });
    db.stockItem.findMany.mockResolvedValueOnce([{ id: "fe814143-0cb2-42d7-b9bb-d39352f74c9e", sku: "NE7565S102", attributes: {} }]);
    db.printPricePreset.findMany.mockResolvedValueOnce(presetRows);
    const res = await runShopCheckout(
      body({ lines: [itemLine([{ id: "front", placement: "other", placementNote: "Косметичка: лицевая сторона", presetId: A4 }])] }),
      DEV,
    );
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: "line_unavailable", index: 0, code: "dtf_zone_too_large_for_item" });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("the stock item's own print area wins over the fallback", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(300, 1, "dtf")], subtotal: 300 });
    db.stockItem.findMany.mockResolvedValueOnce([
      { id: "fe814143-0cb2-42d7-b9bb-d39352f74c9e", sku: "NE7565S102", attributes: { printWidthCm: 22, printHeightCm: 31 } },
    ]);
    db.printPricePreset.findMany.mockResolvedValueOnce(presetRows);
    const res = await runShopCheckout(
      body({ lines: [itemLine([{ id: "front", placement: "other", placementNote: "Косметичка: лицевая сторона", presetId: A4 }])] }),
      DEV,
    );
    expect(res.body.code).toBeUndefined();
  });

  it("NAPA takes the front only", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(300, 1, "dtf")], subtotal: 300 });
    db.stockItem.findMany.mockResolvedValueOnce([{ id: "fe814143-0cb2-42d7-b9bb-d39352f74c9e", sku: "BO7614S129", attributes: {} }]);
    db.printPricePreset.findMany.mockResolvedValueOnce(presetRows);
    const res = await runShopCheckout(
      body({ lines: [itemLine([{ id: "back", placement: "other", placementNote: "Мешочек для бутылки: обратная сторона", presetId: A6 }])] }),
      DEV,
    );
    expect(res.body).toMatchObject({ error: "line_unavailable", code: "dtf_zone_side_unavailable" });
  });

  it("orders a sizeless item line as the wizard's DTF line, its back file tagged with its zone", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(1910, 10, "dtf")], subtotal: 1910 });
    const zones = [
      { id: "front", placement: "other", placementNote: "Мешочек для бутылки: лицевая сторона", presetId: "a8ba2aeb-77ad-4d1a-974f-cf13dbd83f3f" },
      { id: "back", placement: "other", placementNote: "Мешочек для бутылки: обратная сторона", presetId: "930452c6-a866-40d0-8e98-b7fc2bacb975" },
    ];
    const res = await runShopCheckout(
      body({
        lines: [
          {
            quote: { kind: "dtf", garmentId: "fe814143-0cb2-42d7-b9bb-d39352f74c9e:", sizes: [{ size: "—", quantity: 10 }], zones },
            // Only the back artwork now; the front may come later.
            files: [{ fileKey: KEY, fileName: "logo.png", zone: "back" }],
            title: "Săculeț NAPA pentru sticlă",
          },
        ],
      }),
      DEV,
    );
    expect(res.body.fieldErrors).toBeUndefined();
    expect(create.resolveOrderLines.mock.calls[0]![0]).toEqual([
      {
        customerType: "retail",
        productType: "dtf_apparel",
        dtf: {
          garmentSource: "stock",
          garmentProductId: "fe814143-0cb2-42d7-b9bb-d39352f74c9e:",
          sizes: [{ size: "—", quantity: 10 }],
          zones,
        },
        files: [
          { fileName: "logo.png", fileUrl: "shop-orders/1762250000000-abcdefgh-logo.png", copies: 1, color: "color", paperType: "dtf:back" },
        ],
      },
    ]);
  });
});

describe("runShopCheckout — order", () => {
  it("creates one shop order (NEW, payment pending) with the admin line input and copied files", async () => {
    await runShopCheckout(body(), DEV);
    expect(files.copyUploadToShopOrders).toHaveBeenCalledWith(KEY);
    const lineInputs = create.resolveOrderLines.mock.calls[0]![0];
    expect(lineInputs).toEqual([
      {
        customerType: "retail",
        productType: "mug",
        mugProductId: "mug-1",
        files: [{ fileName: "logo.png", fileUrl: "shop-orders/1762250000000-abcdefgh-logo.png", copies: 3, color: "color" }],
      },
    ]);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.actorId).toBeNull();
    expect(args.order).toMatchObject({
      source: "shop",
      status: "NEW",
      isWorkshop: false,
      paymentStatus: "pending",
      paymentProvider: "test",
      phone: "+37369123456",
      clientName: "Ion Popescu",
      customerName: "Ion Popescu",
      customerEmail: "ion@example.com",
      deliveryMethod: "courier_chisinau",
      deliveryCity: "Chișinău",
      deliveryAddress: "str. Ștefan cel Mare 1",
      productType: "mug",
    });
    expect(args.order.notes).toContain("Cană albă 320 ml — Imprimare full — 3 шт. — прим.: logo centrat");
    expect(args.shopLineData).toEqual([
      {
        kind: "mug",
        title: "Cană albă 320 ml",
        optionsText: "Imprimare full",
        note: "logo centrat",
        quantity: 3,
        unitPrice: 100,
        total: 300,
        quote: { kind: "mug", productId: "mug-1", quantity: 3 },
      },
    ]);
  });

  it("marks a test-provider order as TEST: notes prefix, no stock, no client link", async () => {
    await runShopCheckout(body(), DEV);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.skipStock).toBe(true);
    expect(args.order.paymentProvider).toBe("test");
    expect(args.order.notes.startsWith("[ТЕСТ сайт] Сайт · Курьер по Кишинёву")).toBe(true);
    expect(args.order.notes.length).toBeLessThanOrEqual(500);
    expect(args.order.clientId).toBeUndefined();
    expect(clients.findClientIdByOrderPhone).not.toHaveBeenCalled();
  });

  it("a real (non-test) order deducts stock and links the client by phone", async () => {
    pay.override = () => realProvider;
    const res = await runShopCheckout(body(), PROD);
    expect(res.status).toBe(201);
    expect(db.order.update).toHaveBeenCalledWith({ where: { id: "order-1" }, data: { paymentRef: "P-1" } });
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.skipStock).toBe(false);
    expect(args.order.notes.startsWith("Сайт · ")).toBe(true);
    expect(args.order.clientId).toBe("client-7");
  });

  it("an explicit SHOP_PAYMENT_MODE=test in production still creates test orders", async () => {
    await runShopCheckout(body(), { ...PROD, SHOP_PAYMENT_MODE: "test" });
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.skipStock).toBe(true);
    expect(args.order.paymentProvider).toBe("test");
  });

  it("400 when an uploaded file is missing from storage", async () => {
    files.copyUploadToShopOrders.mockResolvedValue(null);
    const res = await runShopCheckout(body(), DEV);
    expect(res).toEqual({ status: 400, body: { error: "file_not_found", index: 0, fileKey: KEY } });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("production without a tester: 503 payment_unavailable and NOTHING is written", async () => {
    const res = await runShopCheckout(body(), PROD);
    expect(res).toEqual({ status: 503, body: { error: "payment_unavailable" } });
    expect(quote.quotePublicLines).not.toHaveBeenCalled();
    expect(files.copyUploadToShopOrders).not.toHaveBeenCalled();
    expect(create.resolveOrderLines).not.toHaveBeenCalled();
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
    expect(db.order.update).not.toHaveBeenCalled();
  });

  it("SHOP_PAYMENT_MODE=paynet (stub) in production is still unavailable", async () => {
    const res = await runShopCheckout(body(), { ...PROD, SHOP_PAYMENT_MODE: "paynet" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("payment_unavailable");
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("production with a tester pass: a TEST order (test provider, no stock, no client link)", async () => {
    const res = await runShopCheckout(body(), PROD, { tester: true });
    expect(res.status).toBe(201);
    expect(res.body.payment).toEqual({ provider: "test", redirectUrl: "/shop/pay/test?token=tok_abc" });
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.skipStock).toBe(true);
    expect(args.order.paymentProvider).toBe("test");
    expect(args.order.notes.startsWith("[ТЕСТ сайт]")).toBe(true);
    expect(clients.findClientIdByOrderPhone).not.toHaveBeenCalled();
  });

  it("503 payment_not_configured when a selected provider fails to start (order kept)", async () => {
    pay.override = () => paynetProvider;
    const res = await runShopCheckout(body(), PROD);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: "payment_not_configured", publicToken: "tok_abc", orderNumber: 1234, total: 345 });
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].order.paymentProvider).toBe("paynet");
  });
});

describe("runShopCheckout — stock switch off (default)", () => {
  it("does not refuse lines for stock and reads no balances; the order is created as before", async () => {
    db.stockVariant.findMany.mockResolvedValue([{ id: "mug-1", stockQuantity: 0 }]);
    for (const env of [DEV, { ...DEV, SHOP_STOCK_CHECK: "0" }, { ...DEV, SHOP_STOCK_CHECK: "true" }]) {
      vi.clearAllMocks();
      create.createOrderWithResolvedLines.mockResolvedValue({ id: "order-1", orderNumber: 1, publicToken: "tok" });
      const res = await runShopCheckout(body(), env);
      expect(res.status).toBe(201);
      expect(db.stockVariant.findMany).not.toHaveBeenCalled();
      expect(create.createOrderWithResolvedLines).toHaveBeenCalledTimes(1);
    }
  });

  it("a real order still deducts stock (skipStock false) with the switch off", async () => {
    pay.override = () => realProvider;
    db.stockVariant.findMany.mockResolvedValue([{ id: "mug-1", stockQuantity: 0 }]);
    const res = await runShopCheckout(body(), PROD);
    expect(res.status).toBe(201);
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].skipStock).toBe(false);
  });
});

describe("runShopCheckout — stock (SHOP_STOCK_CHECK=1)", () => {
  const file = [{ fileKey: KEY, fileName: "logo.png" }];

  it("422 out_of_stock with the pieces left when a line asks for more than the stock", async () => {
    db.stockVariant.findMany.mockResolvedValue([{ id: "mug-1", stockQuantity: 2 }]);
    const res = await runShopCheckout(body(), STOCK_ON);
    expect(res).toEqual({
      status: 422,
      body: { error: "line_unavailable", index: 0, reason: "out_of_stock", code: "out_of_stock", available: 2 },
    });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("checks test orders too (testers see the real answer), but they still skip the deduction", async () => {
    db.stockVariant.findMany.mockResolvedValue([{ id: "mug-1", stockQuantity: 0 }]);
    const res = await runShopCheckout(body(), STOCK_ON);
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ reason: "out_of_stock", available: 0 });

    db.stockVariant.findMany.mockResolvedValue([{ id: "mug-1", stockQuantity: 3 }]);
    const ok = await runShopCheckout(body(), STOCK_ON);
    expect(ok.status).toBe(201);
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].skipStock).toBe(true);
  });

  it("adds up lines of the same variant and reports the line that goes over", async () => {
    db.stockVariant.findMany.mockResolvedValue([{ id: "p-1", stockQuantity: 5 }]);
    quote.quotePublicLines.mockResolvedValue({
      currency: "MDL",
      lines: [okLine(300, 3), okLine(300, 3)],
      subtotal: 600,
    });
    const res = await runShopCheckout(
      body({
        lines: [
          { quote: lineOf("notebook", 3), files: file, title: "A" },
          { quote: lineOf("notebook", 3), files: file, title: "B" },
        ],
      }),
      STOCK_ON,
    );
    expect(res.body).toMatchObject({ error: "line_unavailable", index: 1, reason: "out_of_stock", available: 2 });
  });

  it("checks a UV stock-item line by its variant", async () => {
    db.stockVariant.findMany.mockResolvedValue([{ id: UV_VARIANT, stockQuantity: 4 }]);
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(600, 5, "uv")], subtotal: 600 });
    const res = await runShopCheckout(body({ lines: [{ quote: lineOf("uv", 5), files: file, title: "Cană" }] }), STOCK_ON);
    expect(res.body).toMatchObject({ index: 0, reason: "out_of_stock", available: 4 });
  });

  it("checks DTF lines per size (the size is in the answer)", async () => {
    const item = "11111111-1111-4111-8111-111111111111";
    db.stockVariant.findMany.mockImplementation(async (args: { where: { itemId?: unknown } }) =>
      args.where.itemId
        ? [
            { id: "v-m", itemId: item, options: { color: "Alb", size: "M" }, label: null, sortOrder: 0 },
            { id: "v-l", itemId: item, options: { color: "Alb", size: "L" }, label: null, sortOrder: 1 },
          ]
        : [
            { id: "v-m", stockQuantity: 10 },
            { id: "v-l", stockQuantity: 1 },
          ],
    );
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(600, 3, "dtf")], subtotal: 600 });
    const res = await runShopCheckout(
      body({
        lines: [
          {
            quote: {
              kind: "dtf",
              garmentId: `${item}:alb`,
              sizes: [
                { size: "M", quantity: 1 },
                { size: "L", quantity: 2 },
              ],
              zones: [{ id: "front", placement: "front", presetId: "22222222-2222-4222-8222-222222222222" }],
            },
            title: "Tricou",
          },
        ],
      }),
      STOCK_ON,
    );
    expect(res.body).toMatchObject({ index: 0, reason: "out_of_stock", available: 1, size: "L" });
  });

  it("a variant without a known balance is not blocked (not tracked)", async () => {
    db.stockVariant.findMany.mockResolvedValue([{ id: "other", stockQuantity: 0 }]);
    const res = await runShopCheckout(body(), STOCK_ON);
    expect(res.status).toBe(201);
  });
});

describe("shopLineFiles", () => {
  it("tags DTF files with their print zone (unknown zone → first one)", async () => {
    const { shopLineFiles } = await import("./checkout");
    const out = shopLineFiles(
      "dtf",
      [
        { fileKey: "shop-orders/a.png", fileName: "a.png", zone: "back" },
        { fileKey: "shop-orders/b.png", fileName: "b.png" },
        { fileKey: "shop-orders/c.png", fileName: "c.png", zone: "sleeve" },
      ],
      3,
      ["front", "back"],
    );
    expect(out.map((f) => [f.fileName, f.paperType, f.copies])).toEqual([
      ["a.png", "dtf:back", 1],
      ["b.png", "dtf:front", 1],
      ["c.png", "dtf:front", 1],
    ]);
    // Mugs keep the run in the first file's copies and carry no zone.
    const mug = shopLineFiles("mug", [{ fileKey: "k", fileName: "m.png", zone: "front" }], 4);
    expect(mug).toEqual([{ fileName: "m.png", fileUrl: "k", copies: 4, color: "color" }]);
  });
});

describe("runShopCheckout — storefront account", () => {
  const STORED = "shop-orders/1762250000000-abcdefgh-logo.png";

  it("links the order to the account of the checkout e-mail (lower-cased) and keeps the language", async () => {
    await runShopCheckout(body({ locale: "ru" }), DEV);
    expect(accounts.findOrCreateShopCustomer).toHaveBeenCalledWith(
      "ion@example.com",
      expect.objectContaining({ name: "Ion Popescu", phone: "+37369123456", locale: "ru" }),
    );
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order).toMatchObject({ shopCustomerId: "cust-by-email", shopLocale: "ru" });
  });

  it("a signed-in account wins over the typed e-mail (no lookup)", async () => {
    await runShopCheckout(body(), DEV, { customerId: "cust-session" });
    expect(accounts.findOrCreateShopCustomer).not.toHaveBeenCalled();
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].order.shopCustomerId).toBe("cust-session");
  });

  it("no e-mail and no session → a guest order", async () => {
    await runShopCheckout(body({ customer: { name: "Ion", phone: "+373 69 123 456" } }), DEV);
    expect(accounts.findOrCreateShopCustomer).not.toHaveBeenCalled();
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].order.shopCustomerId).toBeNull();
  });

  it("an account failure never blocks the checkout (guest order)", async () => {
    accounts.findOrCreateShopCustomer.mockRejectedValue(new Error("db down"));
    const res = await runShopCheckout(body(), DEV);
    expect(res.status).toBe(201);
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].order.shopCustomerId).toBeNull();
  });

  it("«Repetă comanda»: a stored shop-orders key is reused (no copy) for its signed-in owner", async () => {
    accountData.ownsReusableShopFile.mockResolvedValue(true);
    const b = body();
    (b.lines[0] as { files: unknown[] }).files = [{ fileKey: STORED, fileName: "logo.png" }];
    const res = await runShopCheckout(b, DEV, { customerId: "cust-session" });
    expect(res.status).toBe(201);
    expect(accountData.ownsReusableShopFile).toHaveBeenCalledWith("cust-session", STORED);
    expect(files.copyUploadToShopOrders).not.toHaveBeenCalled();
    expect(create.resolveOrderLines.mock.calls[0]![0][0].files[0].fileUrl).toBe(STORED);
  });

  it("a stored key of someone else (or without a session) is file_not_found", async () => {
    const b = body();
    (b.lines[0] as { files: unknown[] }).files = [{ fileKey: STORED, fileName: "logo.png" }];
    const res = await runShopCheckout(b, DEV);
    expect(res).toEqual({ status: 400, body: { error: "file_not_found", index: 0, fileKey: STORED } });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });
});

describe("buildShopStaffNotes — staff note in Russian", () => {
  const req: Parameters<typeof buildShopStaffNotes>[0] = {
    locale: "ro",
    customer: { name: "Ion", phone: "+37369123456", email: undefined },
    delivery: { method: "pickup", city: undefined, address: undefined, note: undefined },
    lines: [
      { quote: {}, title: "Chipiu ERIS", optionsText: "Negru · logo 9×5 cm" },
      { quote: {}, title: "Tricou DOGO", optionsText: "Alb · M×2 · Față: A4" },
    ],
    acceptTerms: true,
  };

  it("adds the pieces and the Russian options; the line names stay", () => {
    const text = buildShopStaffNotes(req, {
      lines: [
        { quantity: 10, optionsRu: "Чёрный · лого 9×5 см" },
        { quantity: 2, optionsRu: "Белый · M×2 · Перед: A4" },
      ],
    });
    expect(text).toBe(
      "Сайт · Самовывоз\n1) Chipiu ERIS — Чёрный · лого 9×5 см — 10 шт.\n2) Tricou DOGO — Белый · M×2 · Перед: A4 — 2 шт.",
    );
  });

  it("a big mixed order: one concise row per line, every line within 500 characters", () => {
    const n = 10;
    const big: typeof req = {
      ...req,
      delivery: { method: "courier_moldova", city: "Bălți", address: "str. Independenței 5, bl. 3, ap. 12", note: "sunați înainte ".repeat(20) },
      lines: Array.from({ length: n }, (_, i) => ({
        quote: {},
        title: i % 3 === 0 ? "Printare documente" : i % 3 === 1 ? "Printare foto" : "Cană albă 320 ml",
        optionsText: "Alb · logo centrat · ".repeat(6),
        note: i === 2 ? "logo pe ambele părți, centrat, cât mai mare" : undefined,
      })),
    };
    const lines = big.lines.map((_, i) =>
      i % 3 === 0
        ? { quantity: 20, summaryRu: "Печать документов: 4 файла, 20 стр. (A4 ч/б ×13, A4 цвет ×7)", shortRu: "Печать документов: 4 файла, 20 стр." }
        : i % 3 === 1
          ? { quantity: 5, summaryRu: "Фотопечать: 5 фото (10×15 ×3, 30×45 ×2)", shortRu: "Фотопечать: 5 фото" }
          : { quantity: 1, titleRu: "Кружка белая 320 мл", optionsRu: "Белый · лого по центру · ".repeat(6) },
    );
    const text = buildShopStaffNotes(big, { lines });
    expect(text.length).toBeLessThanOrEqual(500);
    for (let i = 1; i <= n; i++) expect(text).toMatch(new RegExp(`^${i}\\) `, "m"));
    expect(text).toContain("1) Печать документов: 4 файла, 20 стр.");
    expect(text).toContain("2) Фотопечать: 5 фото");
    expect(text).toContain("3) Кружка белая 320 мл");
    // No per-file lists, no duplicated summaries.
    expect(text.match(/Печать документов/g)).toHaveLength(4);
    expect(text).not.toContain("…и ещё");
  });

  it("a small mixed order keeps the full summaries", () => {
    const mixed: typeof req = {
      ...req,
      lines: [
        { quote: {}, title: "Printare documente" },
        { quote: {}, title: "Printare foto" },
        { quote: {}, title: "Cană albă 320 ml" },
      ],
    };
    const text = buildShopStaffNotes(mixed, {
      lines: [
        { quantity: 20, summaryRu: "Печать документов: 4 файла, 20 стр. (A4 ч/б ×13, A4 цвет ×7)" },
        { quantity: 5, summaryRu: "Фотопечать: 5 фото (10×15 ×3, 30×45 ×2)" },
        { quantity: 1, titleRu: "Кружка белая 320 мл", optionsRu: "" },
      ],
    });
    expect(text).toBe(
      "Сайт · Самовывоз\n1) Печать документов: 4 файла, 20 стр. (A4 ч/б ×13, A4 цвет ×7)\n2) Фотопечать: 5 фото (10×15 ×3, 30×45 ×2)\n3) Кружка белая 320 мл — 1 шт.",
    );
  });

  it("too many lines for 500 characters: the last ones are counted, never dropped silently", () => {
    const many: typeof req = {
      ...req,
      lines: Array.from({ length: 30 }, (_, i) => ({ quote: {}, title: `Cană personalizată cu fotografie nr. ${i + 1}` })),
    };
    const text = buildShopStaffNotes(many, { lines: many.lines.map(() => ({ quantity: 1 })) });
    expect(text.length).toBeLessThanOrEqual(500);
    const shown = text.split("\n").filter((r) => /^\d+\) /.test(r)).length;
    expect(shown).toBeGreaterThan(5);
    expect(text).toMatch(new RegExp(`…и ещё ${30 - shown} позици`));
  });

  it("keeps the customer's options when the catalog does not know the line", () => {
    const text = buildShopStaffNotes(req, { lines: [{ quantity: 10, optionsRu: null }, null] });
    expect(text).toContain("1) Chipiu ERIS — Negru · logo 9×5 cm — 10 шт.");
    expect(text).toContain("2) Tricou DOGO — Alb · M×2 · Față: A4");
  });

  it("the checkout writes the Russian note from the live RU catalog", async () => {
    lineLabels.loadShopLineLabels.mockResolvedValue({
      variants: { "mug-1": { slug: "cana", name: "Кружка", option: "Белая 320 мл" } },
      garments: {},
      prints: {},
    });
    await runShopCheckout(body(), DEV);
    expect(lineLabels.loadShopLineLabels).toHaveBeenCalledWith("ru");
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.notes).toContain("1) Кружка — Белая 320 мл — 3 шт. — прим.: logo centrat");
  });
});

describe("runShopCheckout — business-card pack", () => {
  const BACK_KEY = "uploads/1762250000001-bcdefghi-back.pdf";
  const pack = { kind: "businessCard", pricing: "shopPack", sides: "two", quantity: 200 };
  const bcBody = (files: { fileKey: string; fileName: string; zone?: string }[], quote: Record<string, unknown> = pack) =>
    body({ lines: [{ quote, files, title: "Cărți de vizită 90×50 mm", optionsText: "Față + verso" }] });
  const lineData = { quantity: 200, sides: "two", sheetsUsed: 17, cardsPerSheet: 12, totalSellPriceMdl: 400, pricingSource: "shop_pack" };

  beforeEach(() => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(400, 200, "businessCard")], subtotal: 400 });
    bcShop.resolveShopBusinessCardLine.mockResolvedValue({
      sheetPaperId: "paper-350",
      businessCardLineData: lineData,
      totalSellPriceMdl: 400,
      sheetsUsed: 17,
    });
  });

  it("creates a studio business-card line: paper, 90×50, sides, the pack, faces tagged", async () => {
    const res = await runShopCheckout(
      bcBody([
        { fileKey: BACK_KEY, fileName: "back.pdf", zone: "back" },
        { fileKey: KEY, fileName: "logo.png", zone: "front" },
      ]),
      DEV,
    );
    expect(res.status).toBe(201);
    expect(res.body.total).toBe(445);
    // Resolved here with the shop price, not by the order pipeline (per-sheet rate, whole sheets).
    expect(create.resolveOrderLines).not.toHaveBeenCalled();
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    const r = args.resolved[0];
    expect(r.input).toMatchObject({
      productType: "business_card",
      customerType: "retail",
      sheetPaperId: "paper-350",
      cardSides: "two",
      cardPresetId: "trim_90x50",
      quantity: 200,
    });
    expect(r.input.files).toEqual([
      expect.objectContaining({ fileName: "back.pdf", paperType: "business_card_back", copies: 1 }),
      expect.objectContaining({ fileName: "logo.png", paperType: "business_card_front", copies: 1 }),
    ]);
    expect(r.businessCardExtras).toEqual({ sheetPaperId: "paper-350", businessCardLineData: lineData, sheetsUsed: 17 });
    expect(args.shopLineData[0]).toMatchObject({ kind: "businessCard", quantity: 200, total: 400, quote: pack });
  });

  it("keeps the other lines on the order pipeline, in cart order", async () => {
    quote.quotePublicLines.mockResolvedValue({
      currency: "MDL",
      lines: [okLine(300, 3), okLine(400, 200, "businessCard")],
      subtotal: 700,
    });
    const b = body();
    (b.lines as unknown[]).push({
      quote: pack,
      files: [
        { fileKey: KEY, fileName: "f.png", zone: "front" },
        { fileKey: BACK_KEY, fileName: "b.pdf", zone: "back" },
      ],
      title: "Cărți de vizită",
    });
    const res = await runShopCheckout(b, DEV);
    expect(res.status).toBe(201);
    expect(create.resolveOrderLines.mock.calls[0]![0]).toHaveLength(1);
    const resolved = create.createOrderWithResolvedLines.mock.calls[0]![0].resolved;
    expect(resolved.map((r: { input: { productType: string } }) => r.input.productType)).toEqual(["mug", "business_card"]);
  });

  it("needs a file for every printed face", async () => {
    const res = await runShopCheckout(bcBody([{ fileKey: KEY, fileName: "front.png", zone: "front" }]), DEV);
    expect(res.status).toBe(400);
    expect(res.body.fieldErrors).toEqual({ "lines.0.files": "required" });
    const none = await runShopCheckout(bcBody([]), DEV);
    expect(none.body.fieldErrors).toEqual({ "lines.0.files": "required" });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
  });

  it("refuses a back file on a one-sided card; an untagged file is the front", async () => {
    const one = { ...pack, sides: "one", quantity: 100 };
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(150, 100, "businessCard")], subtotal: 150 });
    const extra = await runShopCheckout(
      bcBody(
        [
          { fileKey: KEY, fileName: "f.png" },
          { fileKey: BACK_KEY, fileName: "b.pdf", zone: "back" },
        ],
        one,
      ),
      DEV,
    );
    expect(extra.status).toBe(400);
    expect(extra.body.fieldErrors).toEqual({ "lines.0.files": "too_many" });
    const ok = await runShopCheckout(bcBody([{ fileKey: KEY, fileName: "f.png" }], one), DEV);
    expect(ok.status).toBe(201);
    const files = create.createOrderWithResolvedLines.mock.calls[0]![0].resolved[0].input.files;
    expect(files).toEqual([expect.objectContaining({ paperType: "business_card_front" })]);
  });

  it("the staff note names the sides in Russian", async () => {
    lineLabels.loadShopLineLabels.mockResolvedValue({ variants: {}, garments: {}, prints: {} });
    await runShopCheckout(
      bcBody([
        { fileKey: KEY, fileName: "f.png", zone: "front" },
        { fileKey: BACK_KEY, fileName: "b.pdf", zone: "back" },
      ]),
      DEV,
    );
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.notes).toContain(
      "1) Визитки 90×50 мм — Лицо + оборот — 200 шт. — прим.: Файл лицевой стороны: f.png; Файл оборотной стороны: b.pdf",
    );
  });

  it("names the business card in Russian even when the catalog is unreachable, with the fit", async () => {
    lineLabels.loadShopLineLabels.mockResolvedValue(null);
    await runShopCheckout(bcBody([{ fileKey: KEY, fileName: "f.png", zone: "front" }, { fileKey: BACK_KEY, fileName: "b.pdf", zone: "back" }], { ...pack, fit: "contain" }), DEV);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.notes).toContain("1) Визитки 90×50 мм — Лицо + оборот · Вписать (белые поля) — 200 шт.");
    expect(args.shopLineData[0]).toMatchObject({ quote: { fit: "contain" } });
  });
});

describe("runShopCheckout — the staff note is the same Russian note in ro / ru / en", () => {
  const BACK_KEY = "uploads/1762250000001-bcdefghi-back.pdf";
  const DTF = {
    kind: "dtf",
    garmentId: "11111111-1111-4111-8111-111111111111:alb",
    sizes: [{ size: "M", quantity: 2 }],
    zones: [{ id: "front", placement: "front", presetId: "22222222-2222-4222-8222-222222222222" }],
  };
  /** The same cart, as each language names it (titles, options, the business-card file note). */
  const localized = {
    ro: { mug: "Cană albă cu imprimarea ta", bc: "Cărți de vizită 90×50 mm", front: "Fișierul pentru față", back: "Fișierul pentru verso", nb: "Carnet A5 roșu", pen: "Pix", uv: "Termos", dtf: "Tricou" },
    ru: { mug: "Белая кружка с вашей печатью", bc: "Визитки 90×50 мм", front: "Файл лицевой стороны", back: "Файл оборотной стороны", nb: "Блокнот A5", pen: "Ручка", uv: "Термос", dtf: "Футболка" },
    en: { mug: "White mug with your print", bc: "Business cards 90×50 mm", front: "Front file", back: "Back file", nb: "Red A5 notebook", pen: "Pen", uv: "Thermos", dtf: "T-shirt" },
  } as const;
  const labels = {
    variants: {
      "mug-1": { slug: "cana", name: "Кружка белая", option: "320 мл" },
      "nb-1": { slug: "carnet", name: "Блокнот A5", option: "Красный" },
      "pen-1": { slug: "pix", name: "Ручка металлическая", option: "Синяя" },
      [UV_VARIANT]: { slug: "termos", name: "Термос", option: "Чёрный 500 мл" },
    },
    garments: { "11111111-1111-4111-8111-111111111111:alb": { slug: "tricou", name: "Футболка DOGO", color: "Белый", garment: "tshirt" } },
    prints: { "22222222-2222-4222-8222-222222222222": "A4 21×30" },
  };

  async function noteFor(lang: "ro" | "ru" | "en"): Promise<string> {
    const L = localized[lang];
    const quotes = [
      { kind: "mug", productId: "mug-1", quantity: 1 },
      { kind: "businessCard", pricing: "shopPack", sides: "two", quantity: 200 },
      { kind: "notebook", productId: "nb-1", quantity: 2 },
      { kind: "pen", productId: "pen-1", quantity: 50 },
      { kind: "uv", source: "stock", variantId: UV_VARIANT, quantity: 1, zones: [{ id: "main", placement: "front" }] },
      DTF,
    ];
    quote.quotePublicLines.mockResolvedValue({
      currency: "MDL",
      lines: [okLine(100, 1), okLine(400, 200, "businessCard"), okLine(200, 2, "notebook"), okLine(500, 50, "pen"), okLine(300, 1, "uv"), okLine(400, 2, "dtf")],
      subtotal: 1900,
    });
    bcShop.resolveShopBusinessCardLine.mockResolvedValue({ sheetPaperId: "p", businessCardLineData: {}, totalSellPriceMdl: 400, sheetsUsed: 17 });
    lineLabels.loadShopLineLabels.mockResolvedValue(labels);
    create.createOrderWithResolvedLines.mockClear();
    const res = await runShopCheckout(
      body({
        locale: lang,
        lines: [
          { quote: quotes[0], files: [{ fileKey: KEY, fileName: "mug.png" }], title: L.mug, optionsText: "320 ml" },
          {
            quote: quotes[1],
            files: [
              { fileKey: KEY, fileName: "f.png", zone: "front" },
              { fileKey: BACK_KEY, fileName: "b.pdf", zone: "back" },
            ],
            title: L.bc,
            note: `${L.front}: f.png; ${L.back}: b.pdf`,
          },
          { quote: quotes[2], files: [{ fileKey: KEY, fileName: "nb.png" }], title: L.nb },
          { quote: quotes[3], files: [{ fileKey: KEY, fileName: "pen.png" }], title: L.pen },
          { quote: quotes[4], files: [{ fileKey: KEY, fileName: "uv.png" }], title: L.uv },
          { quote: quotes[5], files: [{ fileKey: KEY, fileName: "dtf.png", zone: "front" }], title: L.dtf },
        ],
      }),
      DEV,
    );
    expect(res.status).toBe(201);
    return create.createOrderWithResolvedLines.mock.calls[0]![0].order.notes as string;
  }

  it("a checkout in ro, ru or en writes one Russian note", async () => {
    const ro = await noteFor("ro");
    expect(await noteFor("ru")).toBe(ro);
    expect(await noteFor("en")).toBe(ro);
    expect(ro).toBe(
      [
        "[ТЕСТ сайт] Сайт · Курьер по Кишинёву, Chișinău, str. Ștefan cel Mare 1",
        "1) Кружка белая — 320 мл — 1 шт.",
        "2) Визитки 90×50 мм — Лицо + оборот — 200 шт. — прим.: Файл лицевой стороны: f.png; Файл оборотной стороны: b.pdf",
        "3) Блокнот A5 — Красный — 2 шт.",
        "4) Ручка металлическая — Синяя — 50 шт.",
        "5) Термос — Чёрный 500 мл — 1 шт.",
        "6) Футболка DOGO — Белый · M×2 · Спереди: A4 21×30 — 2 шт.",
      ].join("\n"),
    );
    // No Romanian / English product words leak in.
    expect(ro).not.toMatch(/Cărți|Fișierul|mug|Business|Front file/);
  });
});

describe("runShopCheckout — courier in Chișinău", () => {
  it("saves «Chișinău» whatever city a stale draft sent", async () => {
    const res = await runShopCheckout(
      body({ delivery: { method: "courier_chisinau", city: "Bălți", address: "str. Independenței 5" } }),
      DEV,
    );
    expect(res.status).toBe(201);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.deliveryCity).toBe("Chișinău");
    expect(args.order.notes).toContain("Курьер по Кишинёву, Chișinău, str. Independenței 5");
    expect(args.order.notes).not.toContain("Bălți");
  });

  it("keeps the city of a Moldova-wide courier order", async () => {
    await runShopCheckout(body({ delivery: { method: "courier_moldova", city: "Bălți", address: "str. Independenței 5" } }), DEV);
    const args = create.createOrderWithResolvedLines.mock.calls[0]![0];
    expect(args.order.deliveryCity).toBe("Bălți");
  });
});
