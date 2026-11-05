import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const auth = vi.hoisted(() => ({
  getSessionUser: vi.fn(async (): Promise<unknown> => null),
  getCustomerSessionUser: vi.fn(async (): Promise<unknown> => null),
  getMaybeCustomerUser: vi.fn(async (): Promise<unknown> => null),
}));
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
vi.mock("@/lib/email/shopNotify", () => ({ notifyShopOrder: vi.fn(async () => {}), sendShopLoginEmail: vi.fn(async () => {}) }));
vi.mock("@/lib/runAfter", () => ({ runAfter: vi.fn() }));
vi.mock("@/lib/shop/account/customers", () => ({
  issueShopLoginToken: vi.fn(async () => ({ token: "tok", code: "123456" })),
}));
vi.mock("@/lib/r2", () => ({ getPresignedUploadUrl: vi.fn(async () => "https://r2.example/put") }));
vi.mock("@/lib/prisma", () => ({ prisma: {}, HEAVY_TX_OPTIONS: {} }));

import { POST as checkoutRoute } from "@/app/api/shop/checkout/route";
import { POST as loginRoute } from "@/app/api/shop/account/login/route";
import { POST as uploadUrlRoute } from "@/app/api/upload-url/route";
import { POST as ordersRoute } from "@/app/api/orders/route";
import { POST as passRoute } from "@/app/api/turnstile/pass/route";
import { SHOP_TESTER_COOKIE, signShopTesterToken } from "@/lib/shop/testerToken";
import { TURNSTILE_HEADER, TURNSTILE_PASS_COOKIE, turnstileConfig } from "./config";
import { signTurnstilePass, verifyTurnstile, verifyTurnstilePass } from "./verify";

const SECRET = "ts-secret";
const fetchMock = vi.fn();

function siteverify(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
}

function post(url: string, body: unknown, headers: Record<string, string> = {}) {
  return new NextRequest(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "x-forwarded-for": "203.0.113.9", ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  auth.getSessionUser.mockResolvedValue(null);
  auth.getCustomerSessionUser.mockResolvedValue(null);
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubEnv("TURNSTILE_SITE_KEY", "site-key");
  vi.stubEnv("TURNSTILE_SECRET_KEY", SECRET);
  vi.stubEnv("TURNSTILE_PROTECT_UPLOADER", "");
  vi.stubEnv("SHOP_TESTER_SECRET", "tester-secret-0123456789");
  vi.stubEnv("SHOP_HOSTS", "anvi.md,www.anvi.md");
  vi.stubEnv("R2_ACCOUNT_ID", "acc");
  checkout.runShopCheckout.mockResolvedValue({ status: 201, body: { ok: true } });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("turnstileConfig", () => {
  it("is off without both keys, uploader protection off by default", () => {
    expect(turnstileConfig({}).enabled).toBe(false);
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: "a" }).enabled).toBe(false);
    expect(turnstileConfig({ TURNSTILE_SECRET_KEY: "b" }).enabled).toBe(false);
    const on = turnstileConfig({ TURNSTILE_SITE_KEY: "a", TURNSTILE_SECRET_KEY: "b" });
    expect(on).toMatchObject({ enabled: true, siteKey: "a", protectUploader: false });
    expect(turnstileConfig({ TURNSTILE_SITE_KEY: "a", TURNSTILE_SECRET_KEY: "b", TURNSTILE_PROTECT_UPLOADER: "1" }).protectUploader).toBe(true);
    // The uploader flag alone does nothing.
    expect(turnstileConfig({ TURNSTILE_PROTECT_UPLOADER: "1" }).protectUploader).toBe(false);
  });
});

describe("verifyTurnstile", () => {
  it("disabled without a secret key", async () => {
    expect(await verifyTurnstile("x", { secretKey: null, fetchImpl: fetchMock })).toEqual({ ok: true, reason: "disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("ok on success, sends secret, token and IP", async () => {
    siteverify({ success: true, action: "login" });
    expect(await verifyTurnstile("tok", { secretKey: SECRET, ip: "1.2.3.4", action: "login", fetchImpl: fetchMock })).toEqual({
      ok: true,
      reason: "verified",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    const form = init.body as URLSearchParams;
    expect(form.get("secret")).toBe(SECRET);
    expect(form.get("response")).toBe("tok");
    expect(form.get("remoteip")).toBe("1.2.3.4");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("fail-closed on an invalid token, a missing token or a foreign action", async () => {
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    expect(await verifyTurnstile("bad", { secretKey: SECRET, fetchImpl: fetchMock })).toMatchObject({ ok: false, reason: "invalid" });
    expect(await verifyTurnstile("", { secretKey: SECRET, fetchImpl: fetchMock })).toMatchObject({ ok: false, reason: "missing" });
    siteverify({ success: true, action: "checkout" });
    expect(await verifyTurnstile("tok", { secretKey: SECRET, action: "login", fetchImpl: fetchMock })).toMatchObject({ ok: false });
  });

  it("fail-open on network errors, HTTP 5xx and internal-error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect(await verifyTurnstile("tok", { secretKey: SECRET, fetchImpl: fetchMock })).toEqual({ ok: true, reason: "unreachable" });
    fetchMock.mockRejectedValueOnce(new DOMException("timeout", "TimeoutError"));
    expect(await verifyTurnstile("tok", { secretKey: SECRET, fetchImpl: fetchMock })).toEqual({ ok: true, reason: "unreachable" });
    siteverify({}, 502);
    expect(await verifyTurnstile("tok", { secretKey: SECRET, fetchImpl: fetchMock })).toEqual({ ok: true, reason: "unreachable" });
    siteverify({ success: false, "error-codes": ["internal-error"] });
    expect(await verifyTurnstile("tok", { secretKey: SECRET, fetchImpl: fetchMock })).toEqual({ ok: true, reason: "unreachable" });
  });
});

describe("pass cookie", () => {
  it("valid until it expires, not with another secret or when tampered", () => {
    const now = Date.UTC(2026, 10, 5);
    const v = signTurnstilePass(SECRET, now);
    expect(verifyTurnstilePass(v, SECRET, now + 60_000)).toBe(true);
    expect(verifyTurnstilePass(v, SECRET, now + 3 * 3600_000)).toBe(false);
    expect(verifyTurnstilePass(v, "other", now)).toBe(false);
    expect(verifyTurnstilePass(v.replace(/^\d+/, (n) => String(Number(n) + 9999)), SECRET, now)).toBe(false);
    expect(verifyTurnstilePass("junk", SECRET, now)).toBe(false);
  });
});

describe("storefront routes", () => {
  const checkoutReq = (h: Record<string, string> = {}) => post("https://anvi.md/api/shop/checkout", {}, h);
  const loginReq = (h: Record<string, string> = {}) => post("https://anvi.md/api/shop/account/login", { email: "a@b.md" }, h);

  it("checkout: 403 without a token, 201 with a valid one", async () => {
    const res = await checkoutRoute(checkoutReq());
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "turnstile_failed" });
    expect(checkout.runShopCheckout).not.toHaveBeenCalled();

    siteverify({ success: true, action: "checkout" });
    expect((await checkoutRoute(checkoutReq({ [TURNSTILE_HEADER]: "good" }))).status).toBe(201);
  });

  it("checkout: invalid token refused, Cloudflare down lets it through", async () => {
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    expect((await checkoutRoute(checkoutReq({ [TURNSTILE_HEADER]: "bad" }))).status).toBe(403);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await checkoutRoute(checkoutReq({ [TURNSTILE_HEADER]: "x" }))).status).toBe(201);
  });

  it("checkout: off without keys", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    expect((await checkoutRoute(checkoutReq())).status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("checkout: staff and testers skip the check", async () => {
    auth.getSessionUser.mockResolvedValue({ id: "u1", role: "admin" });
    expect((await checkoutRoute(checkoutReq())).status).toBe(201);
    auth.getSessionUser.mockResolvedValue(null);
    jar.values.set(SHOP_TESTER_COOKIE, signShopTesterToken("pass", "tester-secret-0123456789"));
    expect((await checkoutRoute(checkoutReq())).status).toBe(201);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("login: 403 without a token, ok with one", async () => {
    expect((await loginRoute(loginReq())).status).toBe(403);
    siteverify({ success: true, action: "login" });
    const res = await loginRoute(loginReq({ [TURNSTILE_HEADER]: "good" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("walk-in uploader", () => {
  const uploadReq = (host = "print.anvi.md", h: Record<string, string> = {}) =>
    post(`https://${host}/api/upload-url`, { fileName: "a.pdf", contentType: "application/pdf", fileSize: 10 }, h);

  it("default off: anonymous upload-url and orders are not checked", async () => {
    expect((await uploadUrlRoute(uploadReq())).status).toBe(200);
    const orders = await ordersRoute(post("https://print.anvi.md/api/orders", {}));
    expect(orders.status).not.toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    const pass = await passRoute(post("https://print.anvi.md/api/turnstile/pass", {}));
    expect(await pass.json()).toEqual({ ok: true, enabled: false });
  });

  it("with TURNSTILE_PROTECT_UPLOADER=1: needs the pass cookie", async () => {
    vi.stubEnv("TURNSTILE_PROTECT_UPLOADER", "1");
    expect((await uploadUrlRoute(uploadReq())).status).toBe(403);
    expect((await ordersRoute(post("https://print.anvi.md/api/orders", {}))).status).toBe(403);

    siteverify({ success: true, action: "upload" });
    const pass = await passRoute(post("https://print.anvi.md/api/turnstile/pass", { token: "good" }));
    expect(pass.status).toBe(200);
    const cookie = pass.cookies.get(TURNSTILE_PASS_COOKIE)?.value;
    expect(cookie).toBeTruthy();
    expect((await uploadUrlRoute(uploadReq("print.anvi.md", { cookie: `${TURNSTILE_PASS_COOKIE}=${cookie}` }))).status).toBe(200);
  });

  it("pass: invalid token refused, Cloudflare unreachable (server or browser) fails open", async () => {
    vi.stubEnv("TURNSTILE_PROTECT_UPLOADER", "1");
    siteverify({ success: false, "error-codes": ["invalid-input-response"] });
    expect((await passRoute(post("https://print.anvi.md/api/turnstile/pass", { token: "bad" }))).status).toBe(403);
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await passRoute(post("https://print.anvi.md/api/turnstile/pass", { token: "x" }))).status).toBe(200);
    const unavailable = await passRoute(post("https://print.anvi.md/api/turnstile/pass", { unavailable: true }));
    expect(unavailable.status).toBe(200);
    expect(unavailable.cookies.get(TURNSTILE_PASS_COOKIE)?.value).toBeTruthy();
  });

  it("staff, cabinet customers, testers and storefront host skip it", async () => {
    vi.stubEnv("TURNSTILE_PROTECT_UPLOADER", "1");
    expect((await uploadUrlRoute(uploadReq("anvi.md"))).status).toBe(200);
    auth.getCustomerSessionUser.mockResolvedValue({ id: "c1" });
    expect((await uploadUrlRoute(uploadReq())).status).toBe(200);
    auth.getCustomerSessionUser.mockResolvedValue(null);
    auth.getSessionUser.mockResolvedValue({ id: "u1", role: "admin" });
    expect((await uploadUrlRoute(uploadReq())).status).toBe(200);
    auth.getSessionUser.mockResolvedValue(null);
    jar.values.set(SHOP_TESTER_COOKIE, signShopTesterToken("pass", "tester-secret-0123456789"));
    expect((await uploadUrlRoute(uploadReq())).status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
