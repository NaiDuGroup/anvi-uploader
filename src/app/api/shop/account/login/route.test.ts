import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

/**
 * The real fixed-window limiter (`hitRateLimit`) over an in-memory stand-in
 * for the `rate_limit_hits` upsert, so the route's limits are tested end to end.
 */
const db = vi.hoisted(() => {
  const counts = new Map<string, number>();
  return {
    counts,
    fail: false,
    $queryRaw: vi.fn(async (_s: TemplateStringsArray, key: string, start: Date) => {
      if (db.fail) throw new Error("db down");
      const k = `${key}@${start.getTime()}`;
      const n = (counts.get(k) ?? 0) + 1;
      counts.set(k, n);
      return [{ count: n }];
    }),
    $executeRaw: vi.fn(async () => 0),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/runAfter", () => ({ runAfter: (task: () => Promise<unknown>) => void task() }));
const mail = vi.hoisted(() => ({ sendShopLoginEmail: vi.fn(async (opts: unknown) => void opts) }));
vi.mock("@/lib/email/shopNotify", () => mail);
const customers = vi.hoisted(() => ({ issueShopLoginToken: vi.fn(async () => ({ token: "tok", code: "123456" })) }));
vi.mock("@/lib/shop/account/customers", () => customers);
vi.mock("@/lib/shop/account/tokens", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/shop/account/tokens")>()),
  shopSessionSecret: () => "test-secret-0123456789abcdef",
}));

import { POST } from "./route";

function login(email: string, ip = "203.0.113.7") {
  return POST(
    new NextRequest("https://anvi.md/api/shop/account/login", {
      method: "POST",
      // Vercel: x-real-ip is the client; x-forwarded-for may carry a chain.
      headers: { "content-type": "application/json", "x-real-ip": ip, "x-forwarded-for": `${ip}, 10.0.0.1` },
      body: JSON.stringify({ email, lang: "ru" }),
    }),
  );
}

beforeEach(() => {
  db.counts.clear();
  db.fail = false;
  mail.sendShopLoginEmail.mockClear();
  customers.issueShopLoginToken.mockClear();
});

describe("POST /api/shop/account/login — rate limits", () => {
  it("per address: 3 e-mails per 10 min; the 4th+ answer the same 200 but send nothing", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const res = await login("Ana@Example.md");
      statuses.push(res.status);
      expect(await res.json()).toEqual({ ok: true });
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200]);
    expect(customers.issueShopLoginToken).toHaveBeenCalledTimes(3);
    expect(mail.sendShopLoginEmail).toHaveBeenCalledTimes(3);
    // Case and spaces do not make a new address.
    await login("  ana@example.md ");
    expect(mail.sendShopLoginEmail).toHaveBeenCalledTimes(3);
  });

  it("per IP: 10 requests per 10 min, the 11th is 429 with Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await login(`u${i}@example.md`)).status).toBe(200);
    const res = await login("u10@example.md");
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(mail.sendShopLoginEmail).toHaveBeenCalledTimes(10);
    // Another client is not affected.
    expect((await login("u11@example.md", "198.51.100.2")).status).toBe(200);
  });

  it("fails open when the counter table is unreachable", async () => {
    db.fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (let i = 0; i < 5; i++) expect((await login("ana@example.md")).status).toBe(200);
    expect(mail.sendShopLoginEmail).toHaveBeenCalledTimes(5);
    err.mockRestore();
  });
});
