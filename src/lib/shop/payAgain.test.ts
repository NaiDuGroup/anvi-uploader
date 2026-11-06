import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ order: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const api = vi.hoisted(() => ({ getPaynetOrder: vi.fn(), createPaynetOrder: vi.fn() }));
vi.mock("./paynet", async (importOriginal) => ({ ...(await importOriginal<typeof import("./paynet")>()), ...api }));
const settle = vi.hoisted(() => ({ syncPaynetOrderByToken: vi.fn(async () => "paid") }));
vi.mock("./paynetSettle", () => settle);

import { SHOP_LEGAL_VERSION } from "@/lib/storefront/legalTexts.generated";
import { parsePayAgainBody, restartShopPayment } from "./payAgain";

const DEV = { NODE_ENV: "development" };
const PROD = { NODE_ENV: "production", VERCEL_ENV: "production" };
/** The terms checkbox above «Plătește acum» is ticked. */
const OK = { acceptTerms: true };

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
    const r = await restartShopPayment("tok", "ro", DEV, OK);
    expect(r).toEqual({ status: 200, body: { payment: { provider: "test", redirectUrl: "/shop/pay/test?token=tok" } } });
  });

  it("in production only a tester / staff may use the test payment", async () => {
    expect((await restartShopPayment("tok", "ro", PROD, OK)).body).toEqual({ error: "payment_unavailable" });
    expect((await restartShopPayment("tok", "ro", PROD, { ...OK, tester: true })).status).toBe(200);
  });

  it("never settles a real order with the test provider", async () => {
    db.order.findUnique.mockResolvedValue({ ...order, paymentProvider: "paynet" });
    expect((await restartShopPayment("tok", "ro", DEV, OK)).body).toEqual({ error: "payment_unavailable" });
  });

  it("refuses paid, studio, trashed and unknown orders", async () => {
    db.order.findUnique.mockResolvedValue({ ...order, paymentStatus: "paid" });
    expect((await restartShopPayment("tok", "ro", DEV, OK)).status).toBe(409);
    db.order.findUnique.mockResolvedValue({ ...order, isPaid: true });
    expect((await restartShopPayment("tok", "ro", DEV, OK)).status).toBe(409);
    db.order.findUnique.mockResolvedValue({ ...order, source: "studio" });
    expect((await restartShopPayment("tok", "ro", DEV, OK)).status).toBe(404);
    db.order.findUnique.mockResolvedValue({ ...order, deletedAt: new Date() });
    expect((await restartShopPayment("tok", "ro", DEV, OK)).status).toBe(404);
    db.order.findUnique.mockResolvedValue(null);
    expect((await restartShopPayment("tok", "ro", DEV, OK)).status).toBe(404);
    expect((await restartShopPayment("x".repeat(65), "ro", DEV, OK)).status).toBe(404);
  });

  it("requires the terms checkbox and refreshes the consent proof", async () => {
    expect(await restartShopPayment("tok", "ro", DEV)).toEqual({ status: 400, body: { error: "terms_required" } });
    expect((await restartShopPayment("tok", "ro", DEV, { acceptTerms: false })).status).toBe(400);
    expect(db.order.findUnique).not.toHaveBeenCalled();

    expect((await restartShopPayment("tok", "ro", DEV, OK)).status).toBe(200);
    expect(db.order.update).toHaveBeenCalledWith({
      where: { id: "o1" },
      data: expect.objectContaining({ consentAt: expect.any(Date), consentVersion: SHOP_LEGAL_VERSION }),
    });
  });

  describe("with Paynet", () => {
    const PAYNET = {
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      SHOP_PAYMENT_MODE: "paynet",
      SHOP_PUBLIC_BASE_URL: "https://anvi.md",
      PAYNET_API_URL: "https://paynet.example",
      PAYNET_USERNAME: "u",
      PAYNET_PASSWORD: "p",
      PAYNET_SALE_AREA_CODE: "area",
      PAYNET_MERCHANT_CODE: "265505",
      PAYNET_NOTIFICATION_SECRET: "s",
    };
    const pn = { ...order, paymentProvider: "paynet", paymentRef: "paynet:7700:41", paymentStatus: "failed" };
    const open = (n: number, over: Record<string, unknown> = {}) => ({
      paymentId: 40 + (n % 100),
      paymentLink: `https://pay/${n}?s=sig`,
      status: 1,
      order: n,
      merchantCode: "265505",
      amount: { requestAmount: 32500, paidAmount: null },
      expiryDate: "2099-01-01 00:00:00",
      paidDate: null,
      ...over,
    });

    it("re-uses the open payment of the same amount; a failed order waits again", async () => {
      db.order.findUnique.mockResolvedValue(pn);
      api.getPaynetOrder.mockImplementation(async (_c: unknown, n: number) => (n === 7700 ? open(7700) : null));
      api.createPaynetOrder.mockImplementation(async (_c: unknown, i: { paynetOrder: number }) => open(i.paynetOrder));
      const r = await restartShopPayment("tok", "ro", PAYNET, OK);
      expect(r).toEqual({ status: 200, body: { payment: { provider: "paynet", redirectUrl: "https://pay/7700?s=sig" } } });
      expect(db.order.update).toHaveBeenCalledWith({
        where: { id: "o1" },
        data: expect.objectContaining({ paymentRef: "paynet:7700:40", paymentStatus: "pending" }),
      });
    });

    it("an expired payment → the next Paynet order number", async () => {
      db.order.findUnique.mockResolvedValue({ ...pn, paymentStatus: "pending" });
      api.getPaynetOrder.mockImplementation(async (_c: unknown, n: number) => (n === 7700 ? open(7700, { expiryDate: "2020-01-01 00:00:00" }) : null));
      api.createPaynetOrder.mockImplementation(async (_c: unknown, i: { paynetOrder: number }) => open(i.paynetOrder));
      const r = await restartShopPayment("tok", "ro", PAYNET, OK);
      expect(r.body).toEqual({ payment: { provider: "paynet", redirectUrl: "https://pay/7701?s=sig" } });
      expect(db.order.update).toHaveBeenCalledWith({ where: { id: "o1" }, data: expect.objectContaining({ paymentRef: "paynet:7701:41" }) });
    });

    it("paid meanwhile on Paynet → settled, 409 already_paid, no new payment", async () => {
      db.order.findUnique.mockResolvedValue(pn);
      api.getPaynetOrder.mockResolvedValue(open(7700, { status: 4, paidDate: "2026-11-06 18:00:00", amount: { requestAmount: 32500, paidAmount: 32500 } }));
      const r = await restartShopPayment("tok", "ro", PAYNET, OK);
      expect(r).toEqual({ status: 409, body: { error: "already_paid" } });
      expect(api.createPaynetOrder).not.toHaveBeenCalled();
      expect(settle.syncPaynetOrderByToken).toHaveBeenCalledWith("tok");
    });

    it("a test order cannot be paid through Paynet", async () => {
      expect((await restartShopPayment("tok", "ro", PAYNET, OK)).body).toEqual({ error: "payment_unavailable" });
    });
  });

  it("parses the request body", () => {
    expect(parsePayAgainBody(null)).toEqual({ locale: "ro", acceptTerms: false });
    expect(parsePayAgainBody({ locale: "ru", acceptTerms: true })).toEqual({ locale: "ru", acceptTerms: true });
    expect(parsePayAgainBody({ locale: "xx", acceptTerms: "true" })).toEqual({ locale: "ro", acceptTerms: false });
  });
});
