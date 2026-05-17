import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
} from "vitest";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN, TEST_SUPERADMIN } from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

describe.skipIf(!shouldRun)("integration: accounting / profit", () => {
  let superCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    const s = await login(TEST_SUPERADMIN.name, TEST_SUPERADMIN.password);
    superCookie = s.cookie;
    const a = await login(TEST_ADMIN.name, TEST_ADMIN.password);
    adminCookie = a.cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("GET /api/admin/accounting/report returns 403 for studio admin", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${baseUrl()}/api/admin/accounting/report?from=${today}&to=${today}`,
      { headers: { Cookie: adminCookie } },
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/admin/accounting/report returns 200 for superadmin", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${baseUrl()}/api/admin/accounting/report?from=${today}&to=${today}`,
      { headers: { Cookie: superCookie } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      summary: { revenue: number; netProfit: number };
      orders: unknown[];
      productionCosts: { mugPrintPerUnit: number };
    };
    expect(Array.isArray(body.orders)).toBe(true);
    expect(typeof body.summary?.revenue).toBe("number");
    expect(typeof body.productionCosts?.mugPrintPerUnit).toBe("number");
  });

  it("GET /api/admin/accounting/settings returns 403 for studio admin", async () => {
    const res = await fetch(`${baseUrl()}/api/admin/accounting/settings`, {
      headers: { Cookie: adminCookie },
    });
    expect(res.status).toBe(403);
  });

  it("POST /api/admin/business-expenses returns 403 for studio admin", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const res = await fetch(`${baseUrl()}/api/admin/business-expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        name: "Test rent",
        type: "rent",
        amount: 100,
        period: "monthly",
        startDate: today,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("PATCH /api/admin/accounting/settings returns 403 for studio admin", async () => {
    const res = await fetch(`${baseUrl()}/api/admin/accounting/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        mugPrintPerUnit: 1,
        notebookPrintPerUnit: 1,
        packagingPerOrder: 1,
        otherConsumablesPerOrder: 1,
      }),
    });
    expect(res.status).toBe(403);
  });

  it("superadmin PATCH settings is reflected in accounting report productionCosts", async () => {
    const cur = await fetch(`${baseUrl()}/api/admin/accounting/settings`, {
      headers: { Cookie: superCookie },
    });
    expect(cur.status).toBe(200);
    const before = (await cur.json()) as {
      productionCosts: {
        mugPrintPerUnit: number;
        notebookPrintPerUnit: number;
        packagingPerOrder: number;
        otherConsumablesPerOrder: number;
      };
    };

    const nextMug =
      before.productionCosts.mugPrintPerUnit === 99127 ? 99128 : 99127;

    const patch = await fetch(`${baseUrl()}/api/admin/accounting/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: superCookie },
      body: JSON.stringify({
        ...before.productionCosts,
        mugPrintPerUnit: nextMug,
      }),
    });
    expect(patch.status).toBe(200);
    const patchBody = (await patch.json()) as typeof before;
    expect(patchBody.productionCosts.mugPrintPerUnit).toBe(nextMug);

    const today = new Date().toISOString().slice(0, 10);
    const report = await fetch(
      `${baseUrl()}/api/admin/accounting/report?from=${today}&to=${today}`,
      { headers: { Cookie: superCookie } },
    );
    expect(report.status).toBe(200);
    const rep = (await report.json()) as {
      productionCosts: { mugPrintPerUnit: number };
    };
    expect(rep.productionCosts.mugPrintPerUnit).toBe(nextMug);

    const restore = await fetch(`${baseUrl()}/api/admin/accounting/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: superCookie },
      body: JSON.stringify(before.productionCosts),
    });
    expect(restore.status).toBe(200);
    const restored = (await restore.json()) as typeof before;
    expect(restored.productionCosts.mugPrintPerUnit).toBe(
      before.productionCosts.mugPrintPerUnit,
    );
  });

  it("superadmin GET /api/admin/business-expenses returns items array", async () => {
    const res = await fetch(`${baseUrl()}/api/admin/business-expenses`, {
      headers: { Cookie: superCookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("superadmin POST / PATCH / DELETE business-expenses round-trip", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const post = await fetch(`${baseUrl()}/api/admin/business-expenses`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: superCookie },
      body: JSON.stringify({
        name: `IT-BE-${Date.now()}`,
        type: "other",
        amount: 420,
        period: "monthly",
        startDate: today,
      }),
    });
    expect(post.status).toBe(200);
    const { item } = (await post.json()) as {
      item: { id: string; amount: number; isActive: boolean };
    };
    expect(item.id.length).toBeGreaterThan(0);
    expect(item.amount).toBe(420);
    expect(item.isActive).toBe(true);

    const patch = await fetch(
      `${baseUrl()}/api/admin/business-expenses/${item.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: superCookie },
        body: JSON.stringify({ isActive: false, amount: 400 }),
      },
    );
    expect(patch.status).toBe(200);
    const patched = (await patch.json()) as {
      item: { isActive: boolean; amount: number };
    };
    expect(patched.item.isActive).toBe(false);
    expect(patched.item.amount).toBe(400);

    const del = await fetch(
      `${baseUrl()}/api/admin/business-expenses/${item.id}`,
      { method: "DELETE", headers: { Cookie: superCookie } },
    );
    expect(del.status).toBe(200);

    const delAgain = await fetch(
      `${baseUrl()}/api/admin/business-expenses/${item.id}`,
      { method: "DELETE", headers: { Cookie: superCookie } },
    );
    expect(delAgain.status).toBe(404);
  });
});
