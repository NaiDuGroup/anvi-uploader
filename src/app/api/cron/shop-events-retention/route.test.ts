import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));
const db = vi.hoisted(() => ({ shopEvent: { deleteMany: vi.fn(async () => ({ count: 3 })) } }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("@/lib/storefront/catalog", () => ({ tryLoadShopCatalog: async () => null }));

import { GET } from "./route";

const req = (auth?: string) =>
  new NextRequest("https://print.anvi.md/api/cron/shop-events-retention", { headers: auth ? { authorization: auth } : {} });

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
  db.shopEvent.deleteMany.mockClear();
});

describe("shop events retention cron", () => {
  it("refuses a wrong secret", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(req("Bearer nope"))).status).toBe(401);
    expect((await GET(req())).status).toBe(401);
    expect(db.shopEvent.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes events older than 180 days", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-05T03:45:00.000Z"));
    const res = await GET(req("Bearer s3cret"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted: 3, retentionDays: 180 });
    expect(db.shopEvent.deleteMany).toHaveBeenCalledWith({
      where: { createdAt: { lt: new Date("2026-05-09T03:45:00.000Z") } },
    });
  });
});
