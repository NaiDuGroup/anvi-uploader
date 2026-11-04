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
const auth = vi.hoisted(() => ({ getSessionUser: vi.fn(async (): Promise<unknown> => null) }));
vi.mock("@/lib/auth", () => auth);
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined) }),
}));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 20, retryAfterSec: 1 })),
}));

const notify = vi.hoisted(() => ({ notifyShopOrderByToken: vi.fn(async () => {}) }));
vi.mock("@/lib/email/shopNotify", () => notify);

import { markShopOrderPaid } from "./orders";
import { POST as payTest } from "@/app/api/shop/pay/test/route";
import { SHOP_TESTER_COOKIE, signShopTesterToken } from "./testerToken";

const shopOrder = { id: "o1", source: "shop", deletedAt: null, paymentStatus: "pending", paymentProvider: "test" };
const SECRET = "tester-secret-0123456789";

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  auth.getSessionUser.mockResolvedValue(null);
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

  it("the test provider never settles a non-test order", async () => {
    db.order.findUnique.mockResolvedValue({ ...shopOrder, paymentProvider: "paynet" });
    await expect(markShopOrderPaid("tok", "test")).resolves.toBe("not_found");
    expect(db.tx.order.updateMany).not.toHaveBeenCalled();
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
    // «Comanda achitată» once: only for the call that settled the order.
    expect(notify.notifyShopOrderByToken).toHaveBeenCalledTimes(1);
    expect(notify.notifyShopOrderByToken).toHaveBeenCalledWith("tok", "paid");
  });

  it("production: a valid tester pass cookie allows it", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SHOP_PAYMENT_MODE", "");
    vi.stubEnv("SHOP_TESTER_SECRET", SECRET);
    db.order.findUnique.mockResolvedValue(shopOrder);
    jar.values.set(SHOP_TESTER_COOKIE, signShopTesterToken("pass", SECRET));
    expect((await payTest(req("tok"))).status).toBe(200);
  });

  it("production: a forged, expired or link-kind cookie is refused", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SHOP_PAYMENT_MODE", "");
    vi.stubEnv("SHOP_TESTER_SECRET", SECRET);
    for (const v of [
      signShopTesterToken("pass", "another-secret-0123456789"),
      signShopTesterToken("pass", SECRET, Date.now() - 8 * 24 * 3600 * 1000),
      signShopTesterToken("link", SECRET),
      "garbage",
    ]) {
      jar.values.set(SHOP_TESTER_COOKIE, v);
      expect((await payTest(req("tok"))).status).toBe(404);
    }
    expect(db.order.findUnique).not.toHaveBeenCalled();
  });

  it("production: a staff session allows it (print.anvi.md/shop)", async () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("SHOP_PAYMENT_MODE", "");
    auth.getSessionUser.mockResolvedValue({ id: "u1", role: "admin" });
    db.order.findUnique.mockResolvedValue(shopOrder);
    expect((await payTest(req("tok"))).status).toBe(200);
  });

  it("404 for an unknown token", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    db.order.findUnique.mockResolvedValue(null);
    expect((await payTest(req("nope"))).status).toBe(404);
  });
});
