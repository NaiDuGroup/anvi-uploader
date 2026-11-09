import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({ getSessionUser: vi.fn(async (): Promise<unknown> => null) }));
vi.mock("@/lib/auth", () => auth);
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 20, retryAfterSec: 1 })),
}));
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined) }),
}));
const checkout = vi.hoisted(() => ({ runShopCheckout: vi.fn() }));
vi.mock("@/lib/shop/checkout", () => checkout);
vi.mock("@/lib/shop/account/session", () => ({ getShopCustomer: vi.fn(async () => null) }));
vi.mock("@/lib/email/shopNotify", () => ({ notifyShopOrder: vi.fn(async () => {}) }));
vi.mock("@/lib/notify/staffAlerts", () => ({ alertShopOrderCreated: vi.fn(async () => {}) }));
const pod = vi.hoisted(() => ({ isShopPayOnDelivery: vi.fn(async () => false) }));
vi.mock("@/lib/shop/payOnDelivery", () => pod);

import { POST as linkRoute } from "@/app/api/admin/shop-tester-link/route";
import { POST as checkoutRoute } from "@/app/api/shop/checkout/route";
import { GET as testerRoute } from "@/app/shop/tester/route";
import { SHOP_TESTER_COOKIE, verifyShopTesterToken } from "./testerToken";

const SECRET = "tester-secret-0123456789";

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  auth.getSessionUser.mockResolvedValue(null);
  vi.stubEnv("SHOP_TESTER_SECRET", SECRET);
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("SHOP_PAYMENT_MODE", "");
  checkout.runShopCheckout.mockResolvedValue({ status: 201, body: { ok: true } });
});
afterEach(() => vi.unstubAllEnvs());

function get(url: string) {
  const u = new URL(url);
  return new NextRequest(u, { headers: { host: u.host } });
}

describe("admin tester link", () => {
  it("401 without a staff session", async () => {
    const res = await linkRoute(new NextRequest("https://print.anvi.md/api/admin/shop-tester-link", { method: "POST" }));
    expect(res.status).toBe(401);
  });

  it("503 without a signing secret", async () => {
    vi.stubEnv("SHOP_TESTER_SECRET", "");
    vi.stubEnv("CRON_SECRET", "");
    auth.getSessionUser.mockResolvedValue({ id: "u", role: "admin" });
    const res = await linkRoute(new NextRequest("https://print.anvi.md/api/admin/shop-tester-link", { method: "POST" }));
    expect(res.status).toBe(503);
  });

  it("production: a 10-minute link on https://anvi.md/shop/tester; the tester route sets a 7-day pass", async () => {
    auth.getSessionUser.mockResolvedValue({ id: "u", role: "admin" });
    const res = await linkRoute(new NextRequest("https://print.anvi.md/api/admin/shop-tester-link", { method: "POST" }));
    const { url } = (await res.json()) as { url: string };
    const link = new URL(url);
    expect(link.origin).toBe("https://anvi.md");
    expect(link.pathname).toBe("/shop/tester");
    const token = link.searchParams.get("token")!;
    expect(verifyShopTesterToken(token, "link", SECRET)).toBe(true);

    const opened = await testerRoute(get(url));
    expect(opened.status).toBe(303);
    expect(opened.headers.get("location")).toBe("https://anvi.md/");
    const cookie = opened.cookies.get(SHOP_TESTER_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.maxAge).toBe(7 * 24 * 3600);
    expect(verifyShopTesterToken(cookie.value, "pass", SECRET)).toBe(true);
  });

  it("an expired or forged link opens the shop without a pass", async () => {
    const opened = await testerRoute(get("https://anvi.md/shop/tester?token=v1.link.1.x.y"));
    expect(opened.status).toBe(303);
    expect(opened.cookies.get(SHOP_TESTER_COOKIE)).toBeUndefined();
    // print.anvi.md/shop/tester goes back to /shop.
    expect((await testerRoute(get("https://print.anvi.md/shop/tester"))).headers.get("location")).toBe("https://print.anvi.md/shop");
  });
});

describe("POST /api/shop/checkout passes the tester flag", () => {
  const post = () =>
    checkoutRoute(
      new NextRequest("https://anvi.md/api/shop/checkout", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json", host: "anvi.md" },
      }),
    );

  it("anonymous → tester false; pass cookie → true; staff → true", async () => {
    await post();
    expect(checkout.runShopCheckout.mock.calls[0]![2]).toEqual({ tester: false, payOnDelivery: false, customerId: null });

    const opened = await testerRoute(
      get(`https://anvi.md/shop/tester?token=${encodeURIComponent((await (async () => {
        auth.getSessionUser.mockResolvedValueOnce({ id: "u", role: "admin" });
        const r = await linkRoute(new NextRequest("https://print.anvi.md/api/admin/shop-tester-link", { method: "POST" }));
        return new URL(((await r.json()) as { url: string }).url).searchParams.get("token")!;
      })()))}`),
    );
    jar.values.set(SHOP_TESTER_COOKIE, opened.cookies.get(SHOP_TESTER_COOKIE)!.value);
    await post();
    expect(checkout.runShopCheckout.mock.calls[1]![2]).toEqual({ tester: true, payOnDelivery: false, customerId: null });

    jar.values.clear();
    auth.getSessionUser.mockResolvedValue({ id: "u", role: "admin" });
    await post();
    expect(checkout.runShopCheckout.mock.calls[2]![2]).toEqual({ tester: true, payOnDelivery: false, customerId: null });
  });

  it("passes the «Оплата только при получении» switch to the checkout", async () => {
    pod.isShopPayOnDelivery.mockResolvedValueOnce(true);
    await post();
    expect(checkout.runShopCheckout.mock.calls[0]![2]).toEqual({ tester: false, payOnDelivery: true, customerId: null });
  });
});
