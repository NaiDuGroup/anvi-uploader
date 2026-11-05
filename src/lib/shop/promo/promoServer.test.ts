import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const tx = {
    order: { updateMany: vi.fn(), findUnique: vi.fn() },
    orderLog: { create: vi.fn() },
    promoCode: { update: vi.fn() },
  };
  return {
    tx,
    promoCode: { findUnique: vi.fn() },
    order: { count: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    stockVariant: { findMany: vi.fn(async () => [] as unknown[]) },
    stockItem: { findMany: vi.fn(async () => [] as unknown[]) },
    printPricePreset: { findMany: vi.fn(async () => [] as unknown[]) },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db, HEAVY_TX_OPTIONS: {} }));

const resolver = vi.hoisted(() => ({
  loadShopLineRefResolver: vi.fn(async () => (q: unknown) => {
    const kind = (q as { kind?: string }).kind;
    if (kind === "mug") return { slug: "cana-alba", category: "cani" };
    if (kind === "pen") return { slug: "pix-metal", category: "pixuri" };
    return null;
  }),
}));
vi.mock("@/lib/shop/lineProductServer", () => resolver);

const quote = vi.hoisted(() => ({ quotePublicLines: vi.fn() }));
vi.mock("@/lib/publicQuote/publicQuote", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/publicQuote/publicQuote")>()),
  quotePublicLines: quote.quotePublicLines,
}));
const create = vi.hoisted(() => ({ resolveOrderLines: vi.fn(), createOrderWithResolvedLines: vi.fn() }));
vi.mock("@/lib/orderCreate/orderLines", () => create);
vi.mock("@/lib/findClientByOrderPhone", () => ({ findClientIdByOrderPhone: vi.fn(async () => null) }));
vi.mock("../shopFiles", () => ({ copyUploadToShopOrders: vi.fn(async (k: string) => k.replace(/^uploads\//, "shop-orders/")) }));
vi.mock("../account/customers", () => ({ findOrCreateShopCustomer: vi.fn(async () => ({ id: "cust-1" })) }));
vi.mock("../account/data", () => ({ ownsReusableShopFile: vi.fn(async () => false) }));
vi.mock("@/lib/storefront/lineLabelsServer", () => ({ loadShopLineLabels: vi.fn(async () => null) }));
vi.mock("../businessCardShop", () => ({ resolveShopBusinessCardLine: vi.fn() }));

const pay = vi.hoisted(() => ({
  provider: {
    name: "paynet",
    startPayment: vi.fn(async () => ({ provider: "paynet", redirectUrl: "https://pay.example/x" })),
  },
}));
vi.mock("../payment", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../payment")>()),
  resolvePaymentProvider: () => pay.provider,
}));

import { runShopCheckout } from "../checkout";
import { markShopOrderPaid } from "../orders";
import { applyShopPromo, countPromoUseOnPaid, PROMO_PENDING_HOLD_MS, promoHoldingOrdersWhere } from "./promoServer";
import { previewShopPromo } from "./promoPreview";

const NOW = new Date("2026-11-10T10:00:00.000Z");
const KEY = "uploads/1762250000000-abcdefgh-logo.png";

function promoRow(over: Record<string, unknown> = {}) {
  return {
    id: "promo-1",
    code: "LANSARE10",
    type: "percent",
    value: 10,
    minOrderMdl: null,
    validFrom: null,
    validTo: null,
    maxUsesTotal: null,
    maxUsesPerCustomer: null,
    categories: [] as string[],
    products: [] as string[],
    active: true,
    usesCount: 0,
    ...over,
  };
}

function okLine(total: number, quantity: number, kind = "mug") {
  return { ok: true, kind, quantity, unitPrice: total / quantity, total, currency: "MDL" };
}

function body(over: Record<string, unknown> = {}) {
  return {
    locale: "ro",
    customer: { name: "Ion Popescu", phone: "+373 69 123 456", email: "Ion@Example.com" },
    delivery: { method: "courier_chisinau", city: "Chișinău", address: "str. Ștefan cel Mare 1" },
    lines: [
      {
        quote: { kind: "mug", productId: "mug-1", quantity: 3 },
        files: [{ fileKey: KEY, fileName: "logo.png" }],
        title: "Cană albă 320 ml",
      },
    ],
    acceptTerms: true,
    promoCode: " lansare10 ",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.promoCode.findUnique.mockResolvedValue(promoRow());
  db.order.count.mockResolvedValue(0);
  quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(300, 3)], subtotal: 300 });
  create.resolveOrderLines.mockImplementation(async (inputs: unknown[]) => ({ resolved: inputs.map((input) => ({ input })) }));
  create.createOrderWithResolvedLines.mockResolvedValue({ id: "order-1", orderNumber: 77, publicToken: "tok" });
  db.tx.order.updateMany.mockResolvedValue({ count: 1 });
  db.tx.order.findUnique.mockResolvedValue({ promoCodeId: "promo-1", promoCountedAt: null });
});

describe("applyShopPromo — server checks", () => {
  const lines = [
    { quote: { kind: "mug" }, total: 300 },
    { quote: { kind: "pen" }, total: 100 },
  ];

  it("normalises the code before the lookup; garbage never reaches the database", async () => {
    await applyShopPromo({ code: "  lansare10\n", lines, deliveryPrice: 45, now: NOW });
    expect(db.promoCode.findUnique).toHaveBeenCalledWith({ where: { code: "LANSARE10" } });
    db.promoCode.findUnique.mockClear();
    await expect(applyShopPromo({ code: "' OR 1=1 --", lines, deliveryPrice: 45, now: NOW })).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(db.promoCode.findUnique).not.toHaveBeenCalled();
  });

  it("unknown and inactive look the same", async () => {
    db.promoCode.findUnique.mockResolvedValueOnce(null);
    await expect(applyShopPromo({ code: "NOPE", lines, deliveryPrice: 45 })).resolves.toEqual({ ok: false, reason: "invalid" });
    db.promoCode.findUnique.mockResolvedValueOnce(promoRow({ active: false }));
    await expect(applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45 })).resolves.toEqual({ ok: false, reason: "invalid" });
  });

  it("categories come from each line's quote (the resolver), not from the browser", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ categories: ["pixuri"] }));
    const r = await applyShopPromo({
      code: "LANSARE10",
      // A tampered line claiming to be a pen: its quote says mug.
      lines: [{ quote: { kind: "mug", slug: "pix-metal", category: "pixuri" }, total: 300 }],
      deliveryPrice: 45,
    });
    expect(r).toEqual({ ok: false, reason: "not_applicable" });
    const ok = await applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45 });
    expect(ok).toMatchObject({ ok: true, eligibleSubtotal: 100, discount: 10, total: 435 });
  });

  it("no restriction → the resolver (catalog) is not loaded", async () => {
    await applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45 });
    expect(resolver.loadShopLineRefResolver).not.toHaveBeenCalled();
  });

  it("total limit: paid usesCount + unpaid orders of the last 24 h", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ maxUsesTotal: 3, usesCount: 2 }));
    db.order.count.mockResolvedValue(1);
    await expect(applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45, now: NOW })).resolves.toMatchObject({
      ok: false,
      reason: "limit_reached",
    });
    const where = db.order.count.mock.calls[0]![0].where;
    expect(where).toMatchObject({ promoCodeId: "promo-1", deletedAt: null, paymentStatus: { not: "paid" } });
    expect(where.createdAt.gte.getTime()).toBe(NOW.getTime() - PROMO_PENDING_HOLD_MS);
    db.order.count.mockResolvedValue(0);
    await expect(applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45, now: NOW })).resolves.toMatchObject({ ok: true });
  });

  it("per-customer limit counts that e-mail's paid and held orders", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ maxUsesPerCustomer: 1 }));
    db.order.count.mockResolvedValue(1);
    await expect(
      applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45, email: "ION@example.com", now: NOW }),
    ).resolves.toMatchObject({ ok: false, reason: "customer_limit" });
    expect(db.order.count.mock.calls[0]![0].where).toEqual(promoHoldingOrdersWhere("promo-1", NOW, "ion@example.com"));
    await expect(applyShopPromo({ code: "LANSARE10", lines, deliveryPrice: 45, now: NOW })).resolves.toMatchObject({
      reason: "email_required",
    });
  });

  it("the per-customer query: paid ones, or unpaid ones still held, never trashed or test", () => {
    expect(promoHoldingOrdersWhere("p", NOW, "a@b.c")).toEqual({
      promoCodeId: "p",
      deletedAt: null,
      NOT: { paymentProvider: "test" },
      customerEmail: "a@b.c",
      OR: [
        { paymentStatus: "paid" },
        { paymentStatus: { not: "paid" }, createdAt: { gte: new Date(NOW.getTime() - PROMO_PENDING_HOLD_MS) } },
      ],
    });
  });
});

describe("runShopCheckout with a promo code", () => {
  it("prices the discount on the server and stores it on the order", async () => {
    const res = await runShopCheckout(body(), { NODE_ENV: "development" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ subtotal: 300, deliveryPrice: 45, discount: 30, promoCode: "LANSARE10", total: 315 });
    const order = create.createOrderWithResolvedLines.mock.calls[0]![0].order;
    expect(order.price.toString()).toBe("315");
    expect(order.deliveryPriceMdl.toString()).toBe("45");
    expect(order.promoDiscountMdl.toString()).toBe("30");
    expect(order).toMatchObject({ promoCodeId: "promo-1", promoCode: "LANSARE10" });
    expect(order.promoData).toMatchObject({ type: "percent", value: 10, discount: 30, subtotal: 300 });
    expect(order.notes).toContain("Промокод LANSARE10 (−10%): −30 MDL");
    expect(order.notes.length).toBeLessThanOrEqual(500);
    // The payment is for the discounted total.
    expect(pay.provider.startPayment).toHaveBeenCalledWith(expect.objectContaining({ amountMdl: 315 }));
  });

  it("ignores any discount or total the browser sends", async () => {
    const res = await runShopCheckout(
      body({ discount: 300, total: 1, promoDiscountMdl: 300, promoCodeId: "other", price: 1 }),
      { NODE_ENV: "development" },
    );
    expect(res.body).toMatchObject({ discount: 30, total: 315 });
    const order = create.createOrderWithResolvedLines.mock.calls[0]![0].order;
    expect(order.promoCodeId).toBe("promo-1");
  });

  it("an invalid code answers 422 promo_invalid and creates no order", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ validTo: new Date("2020-01-01T00:00:00Z") }));
    const res = await runShopCheckout(body(), { NODE_ENV: "development" });
    expect(res).toEqual({ status: 422, body: { error: "promo_invalid", reason: "expired" } });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
    expect(pay.provider.startPayment).not.toHaveBeenCalled();
  });

  it("min total answer carries the amount", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ minOrderMdl: 500 }));
    const res = await runShopCheckout(body(), { NODE_ENV: "development" });
    expect(res).toEqual({ status: 422, body: { error: "promo_invalid", reason: "min_total", minOrderMdl: 500 } });
  });

  it("free delivery: the order keeps the tariff, the discount is the delivery", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ type: "free_delivery", value: 0 }));
    const res = await runShopCheckout(body(), { NODE_ENV: "development" });
    expect(res.body).toMatchObject({ subtotal: 300, deliveryPrice: 45, discount: 45, total: 300 });
  });

  it("a fixed code is capped so the payment is at least 10 lei (never a 0-lei order)", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ type: "fixed", value: 1000 }));
    const res = await runShopCheckout(body(), { NODE_ENV: "development" });
    expect(res.status).toBe(201);
    // Courier: 1000 is cut to the subtotal (300); 45 delivery stays payable, above the minimum.
    expect(res.body).toMatchObject({ subtotal: 300, deliveryPrice: 45, discount: 300, total: 45 });
    db.promoCode.findUnique.mockResolvedValue(promoRow({ type: "fixed", value: 1000 }));
    // Pickup: 300 would leave 0 → limited to 290, the payment is 10 lei.
    const pickup = await runShopCheckout(body({ delivery: { method: "pickup" } }), { NODE_ENV: "development" });
    expect(pickup.body).toMatchObject({ subtotal: 300, deliveryPrice: 0, discount: 290, total: 10 });
    const order = create.createOrderWithResolvedLines.mock.calls[1]![0].order;
    expect(order.price.toString()).toBe("10");
    expect(order.promoData).toMatchObject({ discount: 290, limited: 1, uncappedDiscount: 300 });
    expect(order.notes).toContain("ограничено");
    expect(pay.provider.startPayment).toHaveBeenLastCalledWith(expect.objectContaining({ amountMdl: 10 }));
  });

  it("an order already at or under 10 lei gets no discount: 422 min_payable, no order", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [okLine(8, 1)], subtotal: 8 });
    db.promoCode.findUnique.mockResolvedValue(promoRow({ type: "fixed", value: 5 }));
    const res = await runShopCheckout(body({ delivery: { method: "pickup" } }), { NODE_ENV: "development" });
    expect(res).toEqual({ status: 422, body: { error: "promo_invalid", reason: "min_payable", minOrderMdl: 10 } });
    expect(create.createOrderWithResolvedLines).not.toHaveBeenCalled();
    expect(pay.provider.startPayment).not.toHaveBeenCalled();
  });

  it("without a code nothing about promos is read or written", async () => {
    const res = await runShopCheckout(body({ promoCode: undefined }), { NODE_ENV: "development" });
    expect(res.body).not.toHaveProperty("discount");
    expect(db.promoCode.findUnique).not.toHaveBeenCalled();
    const order = create.createOrderWithResolvedLines.mock.calls[0]![0].order;
    expect(order).not.toHaveProperty("promoCodeId");
    expect(order.price.toString()).toBe("345");
  });
});

describe("previewShopPromo («Aplică»)", () => {
  it("re-prices the cart and answers the same discount as the checkout", async () => {
    await expect(
      previewShopPromo({ code: "lansare10", lines: [{ quote: { kind: "mug", productId: "m", quantity: 3 } }], delivery: { method: "pickup" } }),
    ).resolves.toEqual({
      ok: true,
      code: "LANSARE10",
      type: "percent",
      discount: 30,
      subtotal: 300,
      deliveryPrice: 0,
      total: 270,
      limited: false,
    });
  });
  it("a fixed code bigger than the cart is limited to keep 10 lei payable", async () => {
    db.promoCode.findUnique.mockResolvedValue(promoRow({ type: "fixed", value: 500 }));
    await expect(
      previewShopPromo({ code: "lansare10", lines: [{ quote: { kind: "mug", productId: "m", quantity: 3 } }], delivery: { method: "pickup" } }),
    ).resolves.toMatchObject({ ok: true, discount: 290, total: 10, limited: true });
  });
  it("a cart line without a price → cart_unavailable; a bad body → invalid_input", async () => {
    quote.quotePublicLines.mockResolvedValue({ currency: "MDL", lines: [{ ok: false }], subtotal: null });
    await expect(
      previewShopPromo({ code: "X1X", lines: [{ quote: {} }], delivery: { method: "pickup" } }),
    ).resolves.toEqual({ ok: false, reason: "cart_unavailable" });
    await expect(previewShopPromo({ code: "", lines: [] })).resolves.toEqual({ ok: false, reason: "invalid_input" });
  });
});

describe("the use counter moves only when the order is paid", () => {
  it("countPromoUseOnPaid counts once", async () => {
    await expect(countPromoUseOnPaid(db.tx as never, "o1", NOW)).resolves.toBe(true);
    expect(db.tx.order.updateMany).toHaveBeenCalledWith({ where: { id: "o1", promoCountedAt: null }, data: { promoCountedAt: NOW } });
    expect(db.tx.promoCode.update).toHaveBeenCalledWith({ where: { id: "promo-1" }, data: { usesCount: { increment: 1 } } });

    db.tx.promoCode.update.mockClear();
    db.tx.order.findUnique.mockResolvedValue({ promoCodeId: "promo-1", promoCountedAt: NOW });
    await expect(countPromoUseOnPaid(db.tx as never, "o1")).resolves.toBe(false);
    db.tx.order.findUnique.mockResolvedValue({ promoCodeId: "promo-1", promoCountedAt: null });
    db.tx.order.updateMany.mockResolvedValue({ count: 0 }); // a parallel callback won the race
    await expect(countPromoUseOnPaid(db.tx as never, "o1")).resolves.toBe(false);
    expect(db.tx.promoCode.update).not.toHaveBeenCalled();
  });

  it("checkout does not count a use (the order is only pending)", async () => {
    await runShopCheckout(body(), { NODE_ENV: "development" });
    expect(db.tx.promoCode.update).not.toHaveBeenCalled();
  });

  it("markShopOrderPaid counts the use when it settles the order", async () => {
    db.order.findUnique.mockResolvedValue({
      id: "o1",
      source: "shop",
      deletedAt: null,
      paymentStatus: "pending",
      paymentProvider: "paynet",
      promoCodeId: "promo-1",
    });
    await expect(markShopOrderPaid("tok", "paynet", "P-1")).resolves.toBe("paid");
    expect(db.tx.promoCode.update).toHaveBeenCalledTimes(1);
  });

  it("a test payment (closed test) never uses up a code", async () => {
    db.order.findUnique.mockResolvedValue({
      id: "o1",
      source: "shop",
      deletedAt: null,
      paymentStatus: "pending",
      paymentProvider: "test",
      promoCodeId: "promo-1",
    });
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("paid");
    expect(db.tx.promoCode.update).not.toHaveBeenCalled();
  });

  it("an already paid order or one without a code counts nothing", async () => {
    db.order.findUnique.mockResolvedValue({ id: "o1", source: "shop", deletedAt: null, paymentStatus: "paid", paymentProvider: "paynet", promoCodeId: "promo-1" });
    await expect(markShopOrderPaid("tok", "paynet")).resolves.toBe("already_paid");
    db.order.findUnique.mockResolvedValue({ id: "o1", source: "shop", deletedAt: null, paymentStatus: "pending", paymentProvider: "paynet", promoCodeId: null });
    await expect(markShopOrderPaid("tok", "paynet")).resolves.toBe("paid");
    // Lost race: another call already flipped it to paid.
    db.order.findUnique.mockResolvedValue({ id: "o1", source: "shop", deletedAt: null, paymentStatus: "pending", paymentProvider: "paynet", promoCodeId: "promo-1" });
    db.tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(markShopOrderPaid("tok", "paynet")).resolves.toBe("already_paid");
    expect(db.tx.promoCode.update).not.toHaveBeenCalled();
  });
});
