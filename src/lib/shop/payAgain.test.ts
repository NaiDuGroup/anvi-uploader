import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({ order: { findUnique: vi.fn(), update: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

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

  it("parses the request body", () => {
    expect(parsePayAgainBody(null)).toEqual({ locale: "ro", acceptTerms: false });
    expect(parsePayAgainBody({ locale: "ru", acceptTerms: true })).toEqual({ locale: "ru", acceptTerms: true });
    expect(parsePayAgainBody({ locale: "xx", acceptTerms: "true" })).toEqual({ locale: "ro", acceptTerms: false });
  });
});
