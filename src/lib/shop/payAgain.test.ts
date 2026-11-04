import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ order: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

import { restartShopPayment } from "./payAgain";

const DEV = { NODE_ENV: "development" };
const PROD = { NODE_ENV: "production", VERCEL_ENV: "production" };

const order = {
  id: "o1",
  orderNumber: 77,
  publicToken: "tok",
  source: "shop",
  deletedAt: null,
  paymentStatus: "pending",
  isPaid: false,
  paymentProvider: "test",
  price: { toString: () => "325.00" },
  phone: "+37360000000",
  customerName: "Ana",
  clientName: null,
  customerEmail: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.order.findUnique.mockResolvedValue(order);
});

describe("restartShopPayment («Plătește acum»)", () => {
  it("sends an unpaid test order back to the test pay page", async () => {
    const r = await restartShopPayment("tok", "ro", DEV);
    expect(r).toEqual({ status: 200, body: { payment: { provider: "test", redirectUrl: "/shop/pay/test?token=tok" } } });
  });

  it("in production only a tester / staff may use the test payment", async () => {
    expect((await restartShopPayment("tok", "ro", PROD)).body).toEqual({ error: "payment_unavailable" });
    expect((await restartShopPayment("tok", "ro", PROD, { tester: true })).status).toBe(200);
  });

  it("never settles a real order with the test provider", async () => {
    db.order.findUnique.mockResolvedValue({ ...order, paymentProvider: "paynet" });
    expect((await restartShopPayment("tok", "ro", DEV)).body).toEqual({ error: "payment_unavailable" });
  });

  it("refuses paid, studio, trashed and unknown orders", async () => {
    db.order.findUnique.mockResolvedValue({ ...order, paymentStatus: "paid" });
    expect((await restartShopPayment("tok", "ro", DEV)).status).toBe(409);
    db.order.findUnique.mockResolvedValue({ ...order, isPaid: true });
    expect((await restartShopPayment("tok", "ro", DEV)).status).toBe(409);
    db.order.findUnique.mockResolvedValue({ ...order, source: "studio" });
    expect((await restartShopPayment("tok", "ro", DEV)).status).toBe(404);
    db.order.findUnique.mockResolvedValue({ ...order, deletedAt: new Date() });
    expect((await restartShopPayment("tok", "ro", DEV)).status).toBe(404);
    db.order.findUnique.mockResolvedValue(null);
    expect((await restartShopPayment("tok", "ro", DEV)).status).toBe(404);
    expect((await restartShopPayment("x".repeat(65), "ro", DEV)).status).toBe(404);
  });
});
