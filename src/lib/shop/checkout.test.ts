import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ order: { update: vi.fn() }, stockVariant: { findMany: vi.fn() } }));
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
import { runShopCheckout } from "./checkout";
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
  // No balances found: every line is treated as available (the stock tests set their own).
  db.stockVariant.findMany.mockResolvedValue([]);
});

const UV_VARIANT = "6f1c1a3e-2222-4a2b-9c3d-123456789abc";

/** A valid storefront quote line of `kind` (UV: the shop's stock-item line). */
function lineOf(kind: string, quantity = 1): Record<string, unknown> {
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
    expect(args.order.notes).toContain("Cană albă 320 ml — Imprimare full — прим.: logo centrat");
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
