import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => {
  const tx = { order: { updateMany: vi.fn() }, orderLog: { create: vi.fn() } };
  return {
    tx,
    order: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth", () => ({ getSessionUser: vi.fn(async () => null) }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 20, retryAfterSec: 1 })),
}));

import { markShopOrderPaid } from "./orders";
import { POST as payTest } from "@/app/api/shop/pay/test/route";

const shopOrder = { id: "o1", source: "shop", deletedAt: null, paymentStatus: "pending" };

beforeEach(() => {
  vi.clearAllMocks();
  db.tx.order.updateMany.mockResolvedValue({ count: 1 });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("markShopOrderPaid", () => {
  it("marks a pending storefront order paid and logs it", async () => {
    db.order.findUnique.mockResolvedValue(shopOrder);
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("paid");
    const call = db.tx.order.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: "o1", paymentStatus: { not: "paid" } });
    expect(call.data).toMatchObject({ paymentStatus: "paid", isPaid: true, paymentProvider: "test" });
    expect(call.data.paidAt).toBeInstanceOf(Date);
    expect(call.data.paymentRef).toMatch(/^test-/);
    expect(db.tx.orderLog.create).toHaveBeenCalledTimes(1);
  });

  it("is idempotent", async () => {
    db.order.findUnique.mockResolvedValue({ ...shopOrder, paymentStatus: "paid" });
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("already_paid");
    expect(db.tx.order.updateMany).not.toHaveBeenCalled();
    // Lost race: another request paid it between the read and the write.
    db.order.findUnique.mockResolvedValue(shopOrder);
    db.tx.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("already_paid");
    expect(db.tx.orderLog.create).not.toHaveBeenCalled();
  });

  it("ignores studio, trashed and unknown orders", async () => {
    db.order.findUnique.mockResolvedValue({ ...shopOrder, source: "studio" });
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("not_found");
    db.order.findUnique.mockResolvedValue({ ...shopOrder, deletedAt: new Date() });
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("not_found");
    db.order.findUnique.mockResolvedValue(null);
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("not_found");
  });
});

function req(token: unknown) {
  return new NextRequest("http://localhost/api/shop/pay/test", {
    method: "POST",
    body: JSON.stringify({ token }),
    headers: { "content-type": "application/json" },
  });
}

describe("POST /api/shop/pay/test guard", () => {
  it("404 on Vercel production without SHOP_PAYMENT_MODE=test", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SHOP_PAYMENT_MODE", "");
    const res = await payTest(req("tok"));
    expect(res.status).toBe(404);
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });

  it("pays on a preview deployment; repeat calls stay ok", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    db.order.findUnique.mockResolvedValueOnce(shopOrder).mockResolvedValueOnce({ ...shopOrder, paymentStatus: "paid" });
    const first = await payTest(req("tok"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });
    const second = await payTest(req("tok"));
    expect(await second.json()).toEqual({ ok: true });
  });

  it("404 for an unknown token", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    db.order.findUnique.mockResolvedValue(null);
    expect((await payTest(req("nope"))).status).toBe(404);
  });
});
