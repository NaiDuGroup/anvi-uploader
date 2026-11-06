import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const tx = { order: { updateMany: vi.fn() }, orderLog: { create: vi.fn() } };
  return {
    tx,
    order: { findUnique: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
    orderLog: { findFirst: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const notify = vi.hoisted(() => ({ notifyShopOrderByToken: vi.fn(async () => {}) }));
vi.mock("@/lib/email/shopNotify", () => notify);
const alerts = vi.hoisted(() => ({ alertShopOrderPaid: vi.fn(async () => {}) }));
vi.mock("@/lib/notify/staffAlerts", () => alerts);
vi.mock("./promo/promoServer", () => ({ countPromoUseOnPaid: vi.fn(async () => {}) }));
const api = vi.hoisted(() => ({ getPaynetOrder: vi.fn() }));
vi.mock("./paynet", async (importOriginal) => ({ ...(await importOriginal<typeof import("./paynet")>()), getPaynetOrder: api.getPaynetOrder }));

import { paynetNotificationHash, normalizePaynetNotification, type PaynetPayment } from "./paynet";
import { syncPaynetOrderByPaynetOrder, syncPaynetOrderByToken } from "./paynetSettle";
import { POST as notificationPOST } from "@/app/api/shop/pay/paynet/notification/route";

const ENV = {
  SHOP_PAYMENT_MODE: "paynet",
  PAYNET_API_URL: "https://paynet.example",
  PAYNET_USERNAME: "u",
  PAYNET_PASSWORD: "p",
  PAYNET_SALE_AREA_CODE: "area",
  PAYNET_MERCHANT_CODE: "265505",
  PAYNET_NOTIFICATION_SECRET: "test-secret",
};

const order = {
  id: "o1",
  orderNumber: 1234,
  publicToken: "tok",
  source: "shop",
  deletedAt: null,
  paymentStatus: "pending",
  isPaid: false,
  paymentProvider: "paynet",
  paymentRef: "paynet:123400:777",
  price: { toString: () => "325.00" },
  promoCodeId: null,
};

const paid = (over: Partial<PaynetPayment> = {}): PaynetPayment => ({
  paymentId: 777,
  paymentLink: "https://pay/777",
  status: 4,
  order: 123400,
  merchantCode: "265505",
  amount: { requestAmount: 32500, paidAmount: 32500 },
  expiryDate: "2026-11-06 20:00:00",
  paidDate: "2026-11-06 18:01:40",
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
  db.order.findUnique.mockResolvedValue(order);
  db.tx.order.updateMany.mockResolvedValue({ count: 1 });
  db.order.updateMany.mockResolvedValue({ count: 1 });
  db.orderLog.findFirst.mockResolvedValue(null);
  api.getPaynetOrder.mockResolvedValue(paid());
});

describe("syncPaynetOrderByToken", () => {
  it("paid with the order total → settled once, e-mail + staff alert queued", async () => {
    expect(await syncPaynetOrderByToken("tok")).toBe("paid");
    expect(api.getPaynetOrder).toHaveBeenCalledWith(expect.objectContaining({ merchantCode: "265505" }), 123400);
    expect(db.tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", paymentStatus: { not: "paid" } },
      data: expect.objectContaining({ paymentStatus: "paid", isPaid: true, paymentProvider: "paynet", paymentRef: "paynet:123400:777" }),
    });
    expect(db.tx.orderLog.create).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(notify.notifyShopOrderByToken).toHaveBeenCalledWith("tok", "paid"));
    expect(alerts.alertShopOrderPaid).toHaveBeenCalledWith("tok");
  });

  it("idempotent: a concurrent settle (count 0) sends nothing; an already paid order is not even checked", async () => {
    db.tx.order.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await syncPaynetOrderByToken("tok")).toBe("already_paid");
    expect(notify.notifyShopOrderByToken).not.toHaveBeenCalled();
    db.order.findUnique.mockResolvedValue({ ...order, paymentStatus: "paid", isPaid: true });
    expect(await syncPaynetOrderByToken("tok")).toBe("already_paid");
    expect(api.getPaynetOrder).toHaveBeenCalledTimes(1);
  });

  it("another paid amount → NOT settled, one staff history note per payment", async () => {
    api.getPaynetOrder.mockResolvedValue(paid({ amount: { requestAmount: 30000, paidAmount: 30000 } }));
    expect(await syncPaynetOrderByToken("tok")).toBe("mismatch");
    expect(db.tx.order.updateMany).not.toHaveBeenCalled();
    expect(db.orderLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: "o1",
        action: "payment_mismatch",
        newValue: "paynet:123400:777",
        metadata: expect.objectContaining({ paidMdl: 300, totalMdl: 325 }),
      }),
    });
    db.orderLog.findFirst.mockResolvedValue({ id: "log1" });
    expect(await syncPaynetOrderByToken("tok")).toBe("mismatch");
    expect(db.orderLog.create).toHaveBeenCalledTimes(1);
    expect(notify.notifyShopOrderByToken).not.toHaveBeenCalled();
  });

  it("unpaid → pending; test / studio orders and foreign Paynet answers are left alone", async () => {
    api.getPaynetOrder.mockResolvedValue(paid({ status: 1, paidDate: null, amount: { requestAmount: 32500, paidAmount: null } }));
    expect(await syncPaynetOrderByToken("tok")).toBe("pending");
    db.order.findUnique.mockResolvedValue({ ...order, paymentProvider: "test" });
    expect(await syncPaynetOrderByToken("tok")).toBe("not_found");
    db.order.findUnique.mockResolvedValue({ ...order, paymentRef: "paynet:999900:1" });
    expect(await syncPaynetOrderByToken("tok")).toBe("not_found");
    db.order.findUnique.mockResolvedValue(order);
    api.getPaynetOrder.mockResolvedValue(paid({ merchantCode: "other" }));
    expect(await syncPaynetOrderByToken("tok")).toBe("not_found");
    expect(db.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it("by Paynet order number: an earlier attempt paid late is still settled", async () => {
    db.order.findUnique.mockResolvedValue({ ...order, paymentRef: "paynet:123401:778" });
    api.getPaynetOrder.mockResolvedValue(paid());
    const r = await syncPaynetOrderByPaynetOrder(123400);
    expect(r).toEqual({ result: "paid", publicToken: "tok", orderId: "o1" });
    expect(db.order.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { orderNumber: 1234 } }));
    expect(api.getPaynetOrder).toHaveBeenCalledWith(expect.anything(), 123400);
  });
});

function signed(body: Record<string, unknown>, secret = "test-secret"): NextRequest {
  const hash = paynetNotificationHash(normalizePaynetNotification(body)!, secret);
  return new NextRequest("http://localhost/api/shop/pay/paynet/notification", {
    method: "POST",
    headers: { "content-type": "application/json", Hash: hash },
    body: JSON.stringify(body),
  });
}

const NOTE = {
  Eventid: 1001,
  EventType: "PAID",
  EventDate: "2026-11-06T18:01:41",
  Payment: { Id: 777, ExternalId: 123400, Merchant: "265505", Customer: "1234", StatusDate: "2026-11-06T18:01:40", Amount: 32500 },
};

describe("POST /api/shop/pay/paynet/notification", () => {
  it("valid PAID → re-checked with Paynet and settled; a repeat is acknowledged without a second e-mail", async () => {
    const res = await notificationPOST(signed(NOTE));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: "paid" });
    db.order.findUnique.mockResolvedValue({ ...order, paymentStatus: "paid", isPaid: true });
    const again = await notificationPOST(signed(NOTE));
    expect(await again.json()).toEqual({ ok: true, result: "already_paid" });
    await vi.waitFor(() => expect(notify.notifyShopOrderByToken).toHaveBeenCalledTimes(1));
  });

  it("bad Hash → 401, nothing read from Paynet", async () => {
    const res = await notificationPOST(signed(NOTE, "wrong"));
    expect(res.status).toBe(401);
    expect(api.getPaynetOrder).not.toHaveBeenCalled();
  });

  it("another merchant → 400", async () => {
    const res = await notificationPOST(signed({ ...NOTE, Payment: { ...NOTE.Payment, Merchant: "1" } }));
    expect(res.status).toBe(400);
  });

  it("a PAID body that Paynet does not confirm settles nothing", async () => {
    api.getPaynetOrder.mockResolvedValue(paid({ status: 1, paidDate: null, amount: { requestAmount: 32500, paidAmount: null } }));
    const res = await notificationPOST(signed(NOTE));
    expect(await res.json()).toEqual({ ok: true, result: "pending" });
    expect(db.tx.order.updateMany).not.toHaveBeenCalled();
  });

  it("FAIL → failed (unless paid); pay again stays possible", async () => {
    api.getPaynetOrder.mockResolvedValue(paid({ status: 1, paidDate: null, amount: { requestAmount: 32500, paidAmount: null } }));
    const res = await notificationPOST(signed({ ...NOTE, EventType: "Fail" }));
    expect(res.status).toBe(200);
    expect(db.order.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "o1", isPaid: false, paymentStatus: { in: ["pending", "unpaid"] } }),
      data: { paymentStatus: "failed" },
    });
  });

  it("Paynet unreachable → 500 so Paynet retries", async () => {
    api.getPaynetOrder.mockRejectedValue(new Error("timeout"));
    const res = await notificationPOST(signed(NOTE));
    expect(res.status).toBe(500);
  });
});
