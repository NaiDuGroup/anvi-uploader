import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const db = vi.hoisted(() => ({
  shopCustomer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  shopLoginToken: { create: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  order: { findFirst: vi.fn(), findMany: vi.fn() },
  file: { findMany: vi.fn(), updateMany: vi.fn() },
  session: { findUnique: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const jar = vi.hoisted(() => ({ values: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (jar.values.has(name) ? { name, value: jar.values.get(name)! } : undefined) }),
  headers: async () => new Headers(),
}));
const r2 = vi.hoisted(() => ({ deleteShopOrderFiles: vi.fn(async () => {}) }));
vi.mock("../shopFiles", () => r2);
vi.mock("@/lib/storefront/catalog", () => ({ tryLoadShopCatalog: vi.fn(async () => null) }));
const rl = vi.hoisted(() => ({ allowed: true }));
vi.mock("@/lib/rateLimit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rateLimit")>()),
  hitRateLimit: vi.fn(async (rule: { limit: number }) => ({ allowed: rl.allowed, count: 1, limit: rule.limit, retryAfterSec: 60 })),
}));
const mail = vi.hoisted(() => ({ sendShopLoginEmail: vi.fn(async (opts: unknown) => void opts) }));
vi.mock("@/lib/email/shopNotify", () => mail);

import { ADMIN_SESSION_COOKIE, CUSTOMER_SESSION_COOKIE, getCustomerSessionUser, getSessionUser } from "@/lib/auth";
import { RATE_LIMITS } from "@/lib/rateLimit";
import { POST as loginRoute } from "@/app/api/shop/account/login/route";
import { POST as verifyRoute } from "@/app/api/shop/account/verify/route";
import { buildRepeatLines, groupCustomerFiles, orderNeedsFiles } from "./accountRules";
import { consumeShopLoginCode, consumeShopLoginToken, findOrCreateShopCustomer, issueShopLoginToken } from "./customers";
import { deleteAccountFile, listAccountOrders, loadAccountOrder, ownsReusableShopFile } from "./data";
import { getShopCustomer } from "./session";
import {
  SHOP_LOGIN_MAX_ATTEMPTS,
  SHOP_LOGIN_TTL_MS,
  SHOP_SESSION_COOKIE,
  hashLoginCode,
  hashLoginToken,
  loginTokenUsable,
  normalizeLoginCode,
  normalizeShopEmail,
  safeShopNext,
  shopSessionSecret,
  signShopSession,
  verifyShopSession,
} from "./tokens";

const SECRET = "shop-session-secret-0123456789";
const CID = "6f1c1a3e-2222-4a2b-9c3d-123456789abc";

beforeEach(() => {
  vi.clearAllMocks();
  jar.values.clear();
  rl.allowed = true;
  vi.stubEnv("SHOP_SESSION_SECRET", SECRET);
});

describe("tokens", () => {
  it("hashes link tokens and codes; plain values are never what is stored", () => {
    const h = hashLoginToken("abc");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("abc");
    expect(hashLoginToken("abc")).toBe(h);
    expect(hashLoginToken("abd")).not.toBe(h);
    const c = hashLoginCode(SECRET, "a@b.md", "123456");
    expect(c).not.toBe(hashLoginCode("other-secret-0123456789", "a@b.md", "123456"));
    expect(c).not.toBe(hashLoginCode(SECRET, "x@b.md", "123456"));
  });

  it("usable only unused, unexpired and under the attempt limit", () => {
    const now = 1_000_000;
    const ok = { expiresAt: new Date(now + 1), usedAt: null, attempts: 0 };
    expect(loginTokenUsable(ok, now)).toBe(true);
    expect(loginTokenUsable({ ...ok, expiresAt: new Date(now) }, now)).toBe(false);
    expect(loginTokenUsable({ ...ok, usedAt: new Date(now - 5) }, now)).toBe(false);
    expect(loginTokenUsable({ ...ok, attempts: SHOP_LOGIN_MAX_ATTEMPTS }, now)).toBe(false);
  });

  it("normalises e-mails and codes", () => {
    expect(normalizeShopEmail("  Ana@Example.MD ")).toBe("ana@example.md");
    expect(normalizeShopEmail("nope")).toBeNull();
    expect(normalizeLoginCode("123 456")).toBe("123456");
    expect(normalizeLoginCode("12345")).toBeNull();
  });

  it("session cookie: signed, expiring, tamper-proof", () => {
    const now = 5_000_000;
    const v = signShopSession(CID, SECRET, now, 1000);
    expect(verifyShopSession(v, SECRET, now + 999)).toBe(CID);
    expect(verifyShopSession(v, SECRET, now + 1000)).toBeNull();
    expect(verifyShopSession(v, "another-secret-0123456789", now)).toBeNull();
    const other = "11111111-2222-4a2b-9c3d-123456789abc";
    expect(verifyShopSession(v.replace(CID, other), SECRET, now)).toBeNull();
    expect(verifyShopSession("garbage", SECRET, now)).toBeNull();
  });

  it("secret: env chain; production without one turns accounts off", () => {
    expect(shopSessionSecret({ SHOP_SESSION_SECRET: SECRET })).toBe(SECRET);
    expect(shopSessionSecret({ CRON_SECRET: "cron-secret-0123456789" })).toBe("cron-secret-0123456789");
    expect(shopSessionSecret({ NODE_ENV: "production" })).toBeNull();
    expect(shopSessionSecret({ NODE_ENV: "development" })).toBeTruthy();
  });

  it("next: only storefront account / order / cart paths", () => {
    expect(safeShopNext("/cont/comenzi")).toBe("/cont/comenzi");
    expect(safeShopNext("/shop/checkout")).toBe("/checkout");
    expect(safeShopNext("//evil.com")).toBeNull();
    expect(safeShopNext("https://evil.com")).toBeNull();
    expect(safeShopNext("/admin")).toBeNull();
  });
});

describe("find-or-create + login tokens", () => {
  it("finds the account case-insensitively and only fills empty fields", async () => {
    db.shopCustomer.findUnique.mockResolvedValue({ id: CID, email: "ana@example.md", name: "Ana", phone: null, delivery: null, locale: "ro" });
    db.shopCustomer.update.mockImplementation(async ({ data }: { data: object }) => ({ id: CID, ...data }));
    await findOrCreateShopCustomer("ANA@Example.md", { name: "Other", phone: "+37369000000", locale: "ro" });
    expect(db.shopCustomer.findUnique).toHaveBeenCalledWith({ where: { email: "ana@example.md" } });
    expect(db.shopCustomer.create).not.toHaveBeenCalled();
    expect(db.shopCustomer.update.mock.calls[0]![0].data).toEqual({ phone: "+37369000000" });
  });

  it("creates a missing account; a concurrent create (P2002) resolves to the existing row", async () => {
    db.shopCustomer.findUnique.mockResolvedValueOnce(null);
    db.shopCustomer.create.mockResolvedValueOnce({ id: CID, email: "new@x.md" });
    expect((await findOrCreateShopCustomer("New@X.md", { name: "N" })).id).toBe(CID);
    expect(db.shopCustomer.create.mock.calls[0]![0].data).toMatchObject({ email: "new@x.md", name: "N" });

    const { Prisma } = await import("@prisma/client");
    db.shopCustomer.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "winner", email: "race@x.md" });
    db.shopCustomer.create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5" }));
    expect((await findOrCreateShopCustomer("race@x.md")).id).toBe("winner");
  });

  it("stores only hashes; login tokens live 15 minutes", async () => {
    const now = 10_000_000;
    const issued = await issueShopLoginToken("A@B.md", SECRET, { now, ip: "1.2.3.4" });
    const data = db.shopLoginToken.create.mock.calls[0]![0].data;
    expect(data.email).toBe("a@b.md");
    expect(data.tokenHash).toBe(hashLoginToken(issued.token));
    expect(data.codeHash).toBe(hashLoginCode(SECRET, "a@b.md", issued.code!));
    expect(JSON.stringify(data)).not.toContain(issued.token);
    expect(issued.code).toMatch(/^\d{6}$/);
    expect(data.expiresAt.getTime()).toBe(now + SHOP_LOGIN_TTL_MS);
  });

  it("a link token works once: the second use loses (usedAt already set)", async () => {
    const row = { id: "t1", email: "a@b.md", expiresAt: new Date(Date.now() + 60_000), usedAt: null, attempts: 0 };
    db.shopLoginToken.findUnique.mockResolvedValue(row);
    db.shopLoginToken.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    db.shopCustomer.findUnique.mockResolvedValue({ id: CID, email: "a@b.md", emailVerifiedAt: null });
    db.shopCustomer.update.mockResolvedValue({ id: CID, email: "a@b.md" });
    expect(await consumeShopLoginToken("x".repeat(43))).toMatchObject({ id: CID });
    expect(db.shopLoginToken.updateMany.mock.calls[0]![0]).toEqual({ where: { id: "t1", usedAt: null }, data: { usedAt: expect.any(Date) } });
    expect(db.shopCustomer.update.mock.calls[0]![0].data).toMatchObject({ emailVerifiedAt: expect.any(Date) });
    expect(await consumeShopLoginToken("x".repeat(43))).toBeNull();
  });

  it("an expired or used token is refused without a write", async () => {
    db.shopLoginToken.findUnique.mockResolvedValue({ id: "t1", email: "a@b.md", expiresAt: new Date(Date.now() - 1), usedAt: null, attempts: 0 });
    expect(await consumeShopLoginToken("x".repeat(43))).toBeNull();
    expect(db.shopLoginToken.updateMany).not.toHaveBeenCalled();
  });

  it("a wrong code counts an attempt on the e-mail's open tokens", async () => {
    db.shopLoginToken.findMany.mockResolvedValue([{ id: "t1", codeHash: hashLoginCode(SECRET, "a@b.md", "111111") }]);
    expect(await consumeShopLoginCode("a@b.md", "222222", SECRET)).toBeNull();
    expect(db.shopLoginToken.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["t1"] } }, data: { attempts: { increment: 1 } } });
    expect(db.shopLoginToken.findMany.mock.calls[0]![0].where).toMatchObject({ email: "a@b.md", usedAt: null, attempts: { lt: SHOP_LOGIN_MAX_ATTEMPTS } });
  });
});

describe("login / verify routes", () => {
  function post(url: string, body: unknown) {
    return new NextRequest(`http://shop.localhost${url}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json", "x-real-ip": "1.2.3.4" },
    });
  }

  it("login answers the same for any well-formed address and sends the e-mail", async () => {
    db.shopLoginToken.create.mockResolvedValue({});
    const res = await loginRoute(post("/api/shop/account/login", { email: "Who@Ever.md", lang: "ru" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await vi.waitFor(() => expect(mail.sendShopLoginEmail).toHaveBeenCalled());
    expect(mail.sendShopLoginEmail.mock.calls[0]![0]).toMatchObject({ email: "who@ever.md", lang: "ru" });
    expect(db.shopCustomer.findUnique).not.toHaveBeenCalled();
  });

  it("login is rate-limited (429 per IP)", async () => {
    rl.allowed = false;
    const res = await loginRoute(post("/api/shop/account/login", { email: "a@b.md" }));
    expect(res.status).toBe(429);
    expect(db.shopLoginToken.create).not.toHaveBeenCalled();
    expect(RATE_LIMITS.shopLogin.limit).toBeLessThanOrEqual(20);
    expect(RATE_LIMITS.shopLoginEmail.limit).toBeLessThanOrEqual(5);
  });

  it("verify sets a host-only httpOnly shop_session cookie", async () => {
    db.shopLoginToken.findUnique.mockResolvedValue({ id: "t1", email: "a@b.md", expiresAt: new Date(Date.now() + 60_000), usedAt: null, attempts: 0 });
    db.shopLoginToken.updateMany.mockResolvedValue({ count: 1 });
    db.shopCustomer.findUnique.mockResolvedValue({ id: CID, email: "a@b.md", emailVerifiedAt: new Date() });
    db.shopCustomer.update.mockResolvedValue({ id: CID, email: "a@b.md" });
    const res = await verifyRoute(post("/api/shop/account/verify", { token: "x".repeat(43), next: "//evil.com" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, next: "/cont" });
    const set = res.headers.get("set-cookie") ?? "";
    expect(set).toContain(`${SHOP_SESSION_COOKIE}=v1.${CID}.`);
    expect(set.toLowerCase()).toContain("httponly");
    expect(set.toLowerCase()).not.toContain("domain=");
  });

  it("verify with a bad code: 400, no cookie", async () => {
    db.shopLoginToken.findMany.mockResolvedValue([]);
    const res = await verifyRoute(post("/api/shop/account/verify", { email: "a@b.md", code: "000000" }));
    expect(res.status).toBe(400);
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});

describe("session separation (shop ≠ staff ≠ dealer)", () => {
  it("staff / dealer cookies never sign a storefront customer in", async () => {
    jar.values.set(ADMIN_SESSION_COOKIE, "staff-token");
    jar.values.set(CUSTOMER_SESSION_COOKIE, "dealer-token");
    expect(await getShopCustomer()).toBeNull();
    expect(db.shopCustomer.findUnique).not.toHaveBeenCalled();
  });

  it("a shop_session cookie grants no staff or dealer session", async () => {
    jar.values.set(SHOP_SESSION_COOKIE, signShopSession(CID, SECRET));
    expect(await getSessionUser()).toBeNull();
    expect(await getCustomerSessionUser()).toBeNull();
    expect(db.session.findUnique).not.toHaveBeenCalled();
  });

  it("a staff token pasted into shop_session is refused (not signed)", async () => {
    jar.values.set(SHOP_SESSION_COOKIE, "a".repeat(64));
    expect(await getShopCustomer()).toBeNull();
  });

  it("a valid shop_session loads that customer", async () => {
    jar.values.set(SHOP_SESSION_COOKIE, signShopSession(CID, SECRET));
    db.shopCustomer.findUnique.mockResolvedValue({ id: CID });
    expect(await getShopCustomer()).toEqual({ id: CID });
    expect(db.shopCustomer.findUnique).toHaveBeenCalledWith({ where: { id: CID } });
  });
});

describe("account data is scoped to the customer", () => {
  it("orders: every query filters by the signed-in account", async () => {
    db.order.findMany.mockResolvedValue([]);
    await listAccountOrders(CID);
    expect(db.order.findMany.mock.calls[0]![0].where).toEqual({ shopCustomerId: CID, source: "shop", deletedAt: null });
    db.order.findFirst.mockResolvedValue(null);
    expect(await loadAccountOrder(CID, 77, "ro")).toBeNull();
    expect(db.order.findFirst.mock.calls[0]![0].where).toEqual({ shopCustomerId: CID, source: "shop", deletedAt: null, orderNumber: 77 });
  });

  it("files: another account's key is not_found and nothing is deleted", async () => {
    db.file.findMany.mockResolvedValue([
      { id: "f1", order: { shopCustomerId: "someone-else", orderNumber: 1, status: "DELIVERED", paymentStatus: "paid", isPaid: true, deletedAt: null } },
    ]);
    expect(await deleteAccountFile(CID, "shop-orders/1762250000000-x.png")).toEqual({ ok: false, error: "not_found" });
    expect(r2.deleteShopOrderFiles).not.toHaveBeenCalled();
    expect(await deleteAccountFile(CID, "uploads/1762250000000-x.png")).toEqual({ ok: false, error: "not_found" });
  });

  it("files: refused while an order in work needs it; deleted (object + rows) after delivery", async () => {
    const own = (status: string) => ({ id: "f1", order: { shopCustomerId: CID, orderNumber: 9, status, paymentStatus: "paid", isPaid: true, deletedAt: null } });
    db.file.findMany.mockResolvedValueOnce([own("IN_PROGRESS")]);
    expect(await deleteAccountFile(CID, "shop-orders/1762250000000-x.png")).toEqual({ ok: false, error: "in_use", orders: [9] });
    db.file.findMany.mockResolvedValueOnce([own("DELIVERED")]);
    expect(await deleteAccountFile(CID, "shop-orders/1762250000000-x.png")).toEqual({ ok: true });
    expect(r2.deleteShopOrderFiles).toHaveBeenCalledWith(["shop-orders/1762250000000-x.png"]);
    expect(db.file.updateMany).toHaveBeenCalledWith({ where: { id: { in: ["f1"] } }, data: { metaStatus: "missing" } });
  });

  it("checkout reuse: only the owner, only while the object exists", async () => {
    const key = "shop-orders/1762250000000-x.png";
    expect(await ownsReusableShopFile(null, key)).toBe(false);
    db.file.findMany.mockResolvedValueOnce([{ metaStatus: null, order: { shopCustomerId: CID } }]);
    expect(await ownsReusableShopFile(CID, key)).toBe(true);
    db.file.findMany.mockResolvedValueOnce([{ metaStatus: null, order: { shopCustomerId: "other" } }]);
    expect(await ownsReusableShopFile(CID, key)).toBe(false);
    db.file.findMany.mockResolvedValueOnce([{ metaStatus: "missing", order: { shopCustomerId: CID } }]);
    expect(await ownsReusableShopFile(CID, key)).toBe(false);
  });
});

describe("account rules", () => {
  const st = (o: Partial<Parameters<typeof orderNeedsFiles>[0]> = {}) => ({
    orderNumber: 1,
    status: "NEW",
    paymentStatus: "paid",
    isPaid: true,
    deletedAt: null,
    ...o,
  });

  it("an order needs its files while paid / pending and not delivered or trashed", () => {
    expect(orderNeedsFiles(st())).toBe(true);
    expect(orderNeedsFiles(st({ paymentStatus: "pending", isPaid: false }))).toBe(true);
    expect(orderNeedsFiles(st({ status: "DELIVERED" }))).toBe(false);
    expect(orderNeedsFiles(st({ deletedAt: new Date() }))).toBe(false);
    expect(orderNeedsFiles(st({ paymentStatus: "failed", isPaid: false }))).toBe(false);
  });

  it("groups one stored object used by several orders", () => {
    const key = "shop-orders/1762250000000-a.png";
    const out = groupCustomerFiles([
      { fileUrl: key, fileName: "a.png", sizeBytes: 10, createdAt: new Date("2026-10-01"), order: st({ orderNumber: 1, status: "DELIVERED" }) },
      { fileUrl: key, fileName: "a.png", sizeBytes: 10, createdAt: new Date("2026-11-01"), order: st({ orderNumber: 2 }) },
      { fileUrl: "uploads/x", fileName: "x", sizeBytes: null, createdAt: new Date(), order: st() },
    ]);
    expect(out).toEqual([
      { key, name: "a.png", sizeBytes: 10, createdAt: new Date("2026-10-01").toISOString(), orderNumbers: [2, 1], inUseBy: [2] },
    ]);
  });

  it("repeat: same quote and stored files; deleted files are named; unknown products skipped", () => {
    const quote = { kind: "dtf", garmentId: "g1", sizes: [{ size: "M", quantity: 2 }], zones: [{ id: "front", placement: "front", presetId: "a4" }] };
    const out = buildRepeatLines(
      [
        {
          shopLineData: { kind: "dtf", title: "Tricou", optionsText: "Negru", note: "Față: logo.png", quantity: 2, total: 400, quote },
          files: [
            { fileUrl: "shop-orders/1762250000000-logo.png", fileName: "logo.png", paperType: "dtf:front", sizeBytes: 5, metaStatus: null },
            { fileUrl: "shop-orders/1762250000000-back.png", fileName: "back.png", paperType: "dtf:back", sizeBytes: 5, metaStatus: "missing" },
          ],
        },
        { shopLineData: { title: "Gone", quote: { kind: "mug", productId: "old", quantity: 1 } }, files: [] },
        { shopLineData: null, files: [] },
      ],
      (q) => (q.kind === "dtf" ? { slug: "tricouri-basic", image: "/t.png" } : null),
    );
    expect(out.skipped).toBe(2);
    expect(out.lines).toEqual([
      {
        slug: "tricouri-basic",
        title: "Tricou",
        optionsText: "Negru",
        image: "/t.png",
        quote,
        files: [{ fileKey: "shop-orders/1762250000000-logo.png", fileName: "logo.png", sizeBytes: 5, zone: "front" }],
        note: "Față: logo.png",
        lastTotal: null,
        missingFiles: ["back.png"],
      },
    ]);
  });
});
