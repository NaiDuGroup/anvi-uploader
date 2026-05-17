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

  it("POST /api/orders creates backorder when stock insufficient (public)", async () => {
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

    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order.needsProcurement).toBe(true);
    expect(order.procurementMeta).toMatchObject({
      kind: "mug",
      requestedQty: 5,
      stockAtOrder: 4,
    });

    const unchanged = await prisma.mugProduct.findUnique({ where: { id: mug.id } });
    expect(unchanged?.stockQuantity).toBe(4);

    await prisma.order.deleteMany({ where: { id: order.id } });
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

  it("POST /api/orders/:id/restore succeeds with procurement flag when stock too low", async () => {
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
    expect(restRes.status).toBe(200);

    const restored = await prisma.order.findUnique({
      where: { id: order.id },
      select: { deletedAt: true, needsProcurement: true, procurementMeta: true },
    });
    expect(restored?.deletedAt).toBeNull();
    expect(restored?.needsProcurement).toBe(true);
    expect(restored?.procurementMeta).toMatchObject({
      kind: "mug",
      requestedQty: 2,
      stockAtOrder: 1,
    });

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(1);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt clears needsProcurement and reserves stock for backlog", async () => {
    const mug = await createActiveMugSku(0);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const ordRes = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "bo.png",
            fileUrl: "uploads/it-backorder",
            copies: 5,
            color: "color",
          },
        ],
      }),
    });
    expect(ordRes.status).toBe(201);
    const order = await ordRes.json();
    expect(order.needsProcurement).toBe(true);

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(0);

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 10 }],
        note: "backorder-fill",
      }),
    });
    expect(recRes.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true, procurementMeta: true },
    });
    expect(updatedOrder?.needsProcurement).toBe(false);
    expect(updatedOrder?.procurementMeta).toBeNull();

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(5);

    const sale = await prisma.mugStockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: MUG_STOCK_KIND.ORDER_SALE,
      },
    });
    expect(sale?.delta).toBe(-5);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt fulfills two backorders FIFO when receipt covers both", async () => {
    const mug = await createActiveMugSku(0);
    const phoneA = `+3737${Date.now().toString().slice(-8)}`;
    const phoneB = `+3738${Date.now().toString().slice(-8)}`;

    const pub = (phone: string, copies: number, fileUrl: string) =>
      fetch(`${baseUrl()}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          productType: "mug",
          mugProductId: mug.id,
          files: [
            {
              fileName: "fifo.png",
              fileUrl,
              copies,
              color: "color",
            },
          ],
        }),
      });

    const resA = await pub(phoneA, 4, "uploads/it-fifo-a");
    expect(resA.status).toBe(201);
    const orderA = await resA.json();
    expect(orderA.needsProcurement).toBe(true);

    const resB = await pub(phoneB, 3, "uploads/it-fifo-b");
    expect(resB.status).toBe(201);
    const orderB = await resB.json();
    expect(orderB.needsProcurement).toBe(true);

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 10 }],
      }),
    });
    expect(recRes.status).toBe(200);

    const [a, b] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderA.id },
        select: { needsProcurement: true },
      }),
      prisma.order.findUnique({
        where: { id: orderB.id },
        select: { needsProcurement: true },
      }),
    ]);
    expect(a?.needsProcurement).toBe(false);
    expect(b?.needsProcurement).toBe(false);

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(3);

    const saleA = await prisma.mugStockMovement.findFirst({
      where: { orderId: orderA.id, kind: MUG_STOCK_KIND.ORDER_SALE },
    });
    const saleB = await prisma.mugStockMovement.findFirst({
      where: { orderId: orderB.id, kind: MUG_STOCK_KIND.ORDER_SALE },
    });
    expect(saleA?.delta).toBe(-4);
    expect(saleB?.delta).toBe(-3);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt leaves queue blocked when oldest backorder still not coverable", async () => {
    const mug = await createActiveMugSku(0);
    const phoneA = `+3739${Date.now().toString().slice(-8)}`;
    const phoneB = `+3740${Date.now().toString().slice(-8)}`;

    const pub = (phone: string, copies: number, fileUrl: string) =>
      fetch(`${baseUrl()}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          productType: "mug",
          mugProductId: mug.id,
          files: [
            {
              fileName: "blk.png",
              fileUrl,
              copies,
              color: "color",
            },
          ],
        }),
      });

    const resA = await pub(phoneA, 10, "uploads/it-block-a");
    expect(resA.status).toBe(201);
    const orderA = await resA.json();

    const resB = await pub(phoneB, 2, "uploads/it-block-b");
    expect(resB.status).toBe(201);
    const orderB = await resB.json();

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 5 }],
      }),
    });
    expect(recRes.status).toBe(200);

    const [a, b] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderA.id },
        select: { needsProcurement: true },
      }),
      prisma.order.findUnique({
        where: { id: orderB.id },
        select: { needsProcurement: true },
      }),
    ]);
    expect(a?.needsProcurement).toBe(true);
    expect(b?.needsProcurement).toBe(true);

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(5);

    const sales = await prisma.mugStockMovement.count({
      where: {
        mugProductId: mug.id,
        kind: MUG_STOCK_KIND.ORDER_SALE,
      },
    });
    expect(sales).toBe(0);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt keeps backorder when receipt below order qty", async () => {
    const mug = await createActiveMugSku(0);
    const phone = `+3741${Date.now().toString().slice(-8)}`;

    const ordRes = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "p.png",
            fileUrl: "uploads/it-partial",
            copies: 8,
            color: "color",
          },
        ],
      }),
    });
    expect(ordRes.status).toBe(201);
    const order = await ordRes.json();
    expect(order.needsProcurement).toBe(true);

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 3 }],
      }),
    });
    expect(recRes.status).toBe(200);

    const o = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true },
    });
    expect(o?.needsProcurement).toBe(true);

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(3);

    const saleCount = await prisma.mugStockMovement.count({
      where: {
        orderId: order.id,
        kind: MUG_STOCK_KIND.ORDER_SALE,
      },
    });
    expect(saleCount).toBe(0);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt two lines same SKU clears two backorders in one request", async () => {
    const mug = await createActiveMugSku(0);
    const phoneA = `+3742${Date.now().toString().slice(-8)}`;
    const phoneB = `+3743${Date.now().toString().slice(-8)}`;

    const pub = (phone: string, copies: number, fileUrl: string) =>
      fetch(`${baseUrl()}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          productType: "mug",
          mugProductId: mug.id,
          files: [
            {
              fileName: "m.png",
              fileUrl,
              copies,
              color: "color",
            },
          ],
        }),
      });

    const resA = await pub(phoneA, 4, "uploads/it-2line-a");
    expect(resA.status).toBe(201);
    const orderA = await resA.json();

    const resB = await pub(phoneB, 3, "uploads/it-2line-b");
    expect(resB.status).toBe(201);
    const orderB = await resB.json();

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [
          { mugProductId: mug.id, quantity: 4 },
          { mugProductId: mug.id, quantity: 3 },
        ],
      }),
    });
    expect(recRes.status).toBe(200);

    const [a, b] = await Promise.all([
      prisma.order.findUnique({
        where: { id: orderA.id },
        select: { needsProcurement: true },
      }),
      prisma.order.findUnique({
        where: { id: orderB.id },
        select: { needsProcurement: true },
      }),
    ]);
    expect(a?.needsProcurement).toBe(false);
    expect(b?.needsProcurement).toBe(false);

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(0);

    await cleanupMugProduct(mug.id);
  });

  it("POST /api/admin/mug-stock/receipt second receipt clears backorder after partial first receipt", async () => {
    const mug = await createActiveMugSku(0);
    const phone = `+3744${Date.now().toString().slice(-8)}`;

    const ordRes = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "mug",
        mugProductId: mug.id,
        files: [
          {
            fileName: "s.png",
            fileUrl: "uploads/it-staged",
            copies: 6,
            color: "color",
          },
        ],
      }),
    });
    expect(ordRes.status).toBe(201);
    const order = await ordRes.json();
    expect(order.needsProcurement).toBe(true);

    const rec1 = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 2 }],
      }),
    });
    expect(rec1.status).toBe(200);

    expect(
      (
        await prisma.order.findUnique({
          where: { id: order.id },
          select: { needsProcurement: true },
        })
      )?.needsProcurement,
    ).toBe(true);
    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(2);

    const rec2 = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ mugProductId: mug.id, quantity: 10 }],
      }),
    });
    expect(rec2.status).toBe(200);

    const cleared = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true, procurementMeta: true },
    });
    expect(cleared?.needsProcurement).toBe(false);
    expect(cleared?.procurementMeta).toBeNull();

    expect(
      (await prisma.mugProduct.findUnique({ where: { id: mug.id } }))
        ?.stockQuantity,
    ).toBe(6);

    const sale = await prisma.mugStockMovement.findFirst({
      where: { orderId: order.id, kind: MUG_STOCK_KIND.ORDER_SALE },
    });
    expect(sale?.delta).toBe(-6);

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
