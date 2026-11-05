import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  limit: 1,
  $queryRaw: vi.fn(async () => [{ count: db.limit }]),
  $executeRaw: vi.fn(async () => 0),
  shopEvent: { createMany: vi.fn(async (a: { data: unknown[] }) => ({ count: a.data.length })) },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/storefront/catalog", () => ({ tryLoadShopCatalog: async () => ({ categories: [], products: [] }) }));

import { POST } from "./route";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const events = JSON.stringify({ events: [{ type: "page_view", sid: "abcdef0123456789", product: "flyere" }] });

function beacon(body: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest("https://anvi.md/api/shop/e", {
      method: "POST",
      body,
      headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": UA, "x-real-ip": "198.51.100.4", ...headers },
    }),
  );
}

beforeEach(() => {
  db.limit = 1;
  db.$queryRaw.mockClear();
  db.shopEvent.createMany.mockClear();
});

describe("POST /api/shop/e", () => {
  it("stores a beacon batch and answers 204 without cookies", async () => {
    const res = await beacon(events);
    expect(res.status).toBe(204);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(db.shopEvent.createMany).toHaveBeenCalledTimes(1);
    const rows = db.shopEvent.createMany.mock.calls[0]![0].data as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ product: "flyere", category: "tipografie" });
  });

  it("DNT / GPC: 204, not even counted", async () => {
    expect((await beacon(events, { dnt: "1" })).status).toBe(204);
    expect((await beacon(events, { "sec-gpc": "1" })).status).toBe(204);
    expect(db.$queryRaw).not.toHaveBeenCalled();
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });

  it("bots: 204, nothing stored", async () => {
    expect((await beacon(events, { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" })).status).toBe(204);
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });

  it("rate limited per IP", async () => {
    db.limit = 301;
    const res = await beacon(events);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBeTruthy();
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });

  it("malformed or oversized bodies", async () => {
    expect((await beacon("{not json")).status).toBe(400);
    expect((await beacon(JSON.stringify({ x: 1 }))).status).toBe(400);
    const huge = JSON.stringify({ events: [{ type: "page_view", sid: "abcdef0123456789", path: "/" + "a".repeat(20_000) }] });
    expect((await beacon(huge)).status).toBe(413);
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });
});
