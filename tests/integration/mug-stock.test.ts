/**
 * HTTP + DB integration tests for mug stock (same prerequisites as api.test.ts):
 * - `TEST_BASE_URL` or `PLAYWRIGHT_BASE_URL` (e.g. http://127.0.0.1:3100)
 * - App running against the same DB as Prisma in this process
 * - `npx prisma db:seed:test-users` so e2e-admin / e2e-workshop can log in
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import {
  baseUrl,
  login,
  TEST_ADMIN,
  TEST_WORKSHOP,
} from "./helpers";
import { MUG_STOCK_KIND } from "@/lib/mug/mugStockKinds";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

describe.skipIf(!shouldRun)("integration: mug stock", () => {
  let adminCookie: string;
  let workshopCookie: string;

  beforeAll(async () => {
    const a = await login(TEST_ADMIN.name, TEST_ADMIN.password);
    adminCookie = a.cookie;
    const w = await login(TEST_WORKSHOP.name, TEST_WORKSHOP.password);
    workshopCookie = w.cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createActiveMugSku(stockQuantity: number) {
    const sku = `IT-MUG-${Date.now()}-${nanoid(6)}`;
    return prisma.mugProduct.create({
      data: {
        sku,
        nameRo: "IT",
        nameRu: "IT",
        nameEn: "IT",
        stockQuantity,
        isActive: true,
      },
    });
  }

  async function cleanupMugProduct(mugProductId: string) {
    await prisma.mugStockMovement.deleteMany({ where: { mugProductId } });
    await prisma.order.deleteMany({ where: { mugProductId } });
    await prisma.mugProduct.deleteMany({ where: { id: mugProductId } });
  }

  it("POST /api/admin/orders mug deducts stock and creates ORDER_SALE movement", async () => {
    const mug = await createActiveMugSku(100);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const res = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "m.png",
            fileUrl: "uploads/it-mug-key",
            copies: 7,
            color: "color",
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const order = await res.json();

    const updated = await prisma.mugProduct.findUnique({
      where: { id: mug.id },
    });
    expect(updated?.stockQuantity).toBe(93);

    const mov = await prisma.mugStockMovement.findFirst({
      where: { orderId: order.id, kind: MUG_STOCK_KIND.ORDER_SALE },
    });
    expect(mov?.delta).toBe(-7);
    expect(mov?.orderNumber).toBe(order.orderNumber);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/orders returns 409 when stock insufficient (public)", async () => {
    const mug = await createActiveMugSku(4);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const res = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "x.png",
            fileUrl: "uploads/it-pub",
            copies: 5,
            color: "color",
          },
        ],
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("insufficient_stock");
    expect(body.requested).toBe(5);
    expect(body.available).toBe(4);

    const unchanged = await prisma.mugProduct.findUnique({ where: { id: mug.id } });
    expect(unchanged?.stockQuantity).toBe(4);

    await cleanupMugProduct(mug.id);
  });

  it("DELETE /api/orders/:id soft-delete restores stock", async () => {
    const mug = await createActiveMugSku(50);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "d.png",
            fileUrl: "uploads/it-del",
            copies: 4,
            color: "color",
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const order = await createRes.json();

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(46);

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(50);

    const ret = await prisma.mugStockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: MUG_STOCK_KIND.ORDER_STOCK_RETURN,
      },
    });
    expect(ret?.delta).toBe(4);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/orders/:id/restore returns 409 if stock too low", async () => {
    const mug = await createActiveMugSku(2);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "r.png",
            fileUrl: "uploads/it-res",
            copies: 2,
            color: "color",
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const order = await createRes.json();

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);
    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(2);

    await prisma.mugProduct.update({
      where: { id: mug.id },
      data: { stockQuantity: 1 },
    });

    const restRes = await fetch(`${baseUrl()}/api/orders/${order.id}/restore`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(restRes.status).toBe(409);
    const body = await restRes.json();
    expect(body.error).toBe("insufficient_stock");
    expect(body.requested).toBe(2);
    expect(body.available).toBe(1);

    const stillTrashed = await prisma.order.findUnique({
      where: { id: order.id },
      select: { deletedAt: true },
    });
    expect(stillTrashed?.deletedAt).not.toBeNull();

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt increases stock (workshop)", async () => {
    const mug = await createActiveMugSku(10);

    const res = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 15 }],
        note: "integration",
      }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.mugProduct.findUnique({ where: { id: mug.id } });
    expect(updated?.stockQuantity).toBe(25);

    const mov = await prisma.mugStockMovement.findFirst({
      where: { mugProductId: mug.id, kind: MUG_STOCK_KIND.RECEIPT },
    });
    expect(mov?.delta).toBe(15);
    expect(mov?.note).toBe("integration");

    await cleanupMugProduct(mug.id);
  });

  it("GET /api/admin/mug-products/:id/stock-movements — workshop 200, admin 403", async () => {
    const mug = await createActiveMugSku(1);

    const ok = await fetch(
      `${baseUrl()}/api/admin/mug-products/${mug.id}/stock-movements`,
      { headers: { Cookie: workshopCookie } },
    );
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(Array.isArray(data.movements)).toBe(true);

    const forbidden = await fetch(
      `${baseUrl()}/api/admin/mug-products/${mug.id}/stock-movements`,
      { headers: { Cookie: adminCookie } },
    );
    expect(forbidden.status).toBe(403);

    await cleanupMugProduct(mug.id);
  });
});
