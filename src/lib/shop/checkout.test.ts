import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ order: { update: vi.fn() } }));
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

import { runShopCheckout } from "./checkout";

const DEV = { NODE_ENV: "development" };
const PROD = { NODE_ENV: "production", VERCEL_ENV: "production" };

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
});

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
      phone: "+373 69 123 456",
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
    await runShopCheckout(body(), PROD);
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

  it("503 without a payment provider, but the order exists and its token is returned", async () => {
    const res = await runShopCheckout(body(), PROD);
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ error: "payment_not_configured", publicToken: "tok_abc", orderNumber: 1234, total: 345 });
    expect(create.createOrderWithResolvedLines).toHaveBeenCalledTimes(1);
    expect(create.createOrderWithResolvedLines.mock.calls[0]![0].order.paymentProvider).toBeNull();
  });

  it("503 when Paynet is selected (stub)", async () => {
    const res = await runShopCheckout(body(), { ...PROD, SHOP_PAYMENT_MODE: "paynet" });
    expect(res.status).toBe(503);
    expect(res.body.error).toBe("payment_not_configured");
  });
});
