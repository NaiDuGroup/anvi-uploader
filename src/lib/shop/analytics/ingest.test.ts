import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({
  shopEvent: {
    createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length })),
    deleteMany: vi.fn(async (args: unknown) => ({ count: args ? 7 : 0 })),
  },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
const catalog = vi.hoisted(() => ({
  tryLoadShopCatalog: vi.fn(async () => ({ categories: [], products: [{ slug: "cana-alba", category: "cani" }] })),
}));
vi.mock("@/lib/storefront/catalog", () => catalog);

import {
  fixedShopProductCategories,
  ingestShopEvents,
  loadShopProductCategoryMap,
  pruneShopEvents,
  shopEventsRetentionCutoff,
} from "./ingest";

const BROWSER = new Headers({
  "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile Safari/604.1",
  "x-real-ip": "203.0.113.9",
});
const SID = "0123456789abcdef";
const body = {
  events: [
    { type: "page_view", sid: SID, product: "cana-alba", path: "/p/cana-alba" },
    { type: "add_to_cart", sid: SID, product: "cana-alba" },
  ],
};

beforeEach(() => {
  db.shopEvent.createMany.mockClear();
  db.shopEvent.deleteMany.mockClear();
});

describe("ingestShopEvents", () => {
  it("stores valid events, with the category from the catalog and no IP / UA", async () => {
    const res = await ingestShopEvents(body, BROWSER);
    expect(res).toEqual({ status: "stored", count: 2 });
    const rows = db.shopEvent.createMany.mock.calls[0]![0].data as Record<string, unknown>[];
    expect(rows[0]).toMatchObject({ sessionId: SID, type: "page_view", product: "cana-alba", category: "cani" });
    const json = JSON.stringify(rows);
    expect(json).not.toContain("203.0.113.9");
    expect(json).not.toContain("iPhone");
  });

  it("stores nothing with DNT or GPC", async () => {
    for (const [k, v] of [["dnt", "1"], ["sec-gpc", "1"]] as const) {
      const headers = new Headers(BROWSER);
      headers.set(k, v);
      expect(await ingestShopEvents(body, headers)).toEqual({ status: "skipped", reason: "dnt" });
    }
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });

  it("stores nothing for bots", async () => {
    const res = await ingestShopEvents(body, new Headers({ "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)" }));
    expect(res).toEqual({ status: "skipped", reason: "bot" });
    expect(await ingestShopEvents(body, new Headers())).toEqual({ status: "skipped", reason: "bot" });
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });

  it("invalid shape / no valid events", async () => {
    expect(await ingestShopEvents({ foo: 1 }, BROWSER)).toEqual({ status: "invalid" });
    expect(await ingestShopEvents({ events: [{ type: "x" }] }, BROWSER)).toEqual({ status: "skipped", reason: "empty" });
    expect(db.shopEvent.createMany).not.toHaveBeenCalled();
  });

  it("knows the print-shop pages without the catalog", async () => {
    const fixed = fixedShopProductCategories();
    expect(fixed.get("carti-de-vizita")).toBe("carti-de-vizita");
    expect(fixed.get("printare")).toBe("printare");
    expect(fixed.get("flyere")).toBe("tipografie");
    expect(fixed.get("roll-up")).toBe("print-mare-format");
    const map = await loadShopProductCategoryMap(1);
    expect(map.get("cana-alba")).toBe("cani");
  });
});

describe("retention", () => {
  it("cutoff is 180 days back", () => {
    const now = new Date("2026-11-05T10:00:00.000Z");
    expect(shopEventsRetentionCutoff(now).toISOString()).toBe("2026-05-09T10:00:00.000Z");
  });
  it("deletes older events only", async () => {
    const now = new Date("2026-11-05T10:00:00.000Z");
    expect(await pruneShopEvents(now)).toBe(7);
    expect(db.shopEvent.deleteMany).toHaveBeenCalledWith({ where: { createdAt: { lt: new Date("2026-05-09T10:00:00.000Z") } } });
  });
});
