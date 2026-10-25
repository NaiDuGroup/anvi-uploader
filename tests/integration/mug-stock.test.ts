/**
 * HTTP + DB integration tests for mug stock (same prerequisites as api.test.ts):
 * - `TEST_BASE_URL` or `PLAYWRIGHT_BASE_URL` (e.g. http://127.0.0.1:3100)
 * - App running against the same DB as Prisma in this process
 * - `npx prisma db:seed:test-users` so e2e-admin / e2e-workshop can log in
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import {
  baseUrl,
  login,
  TEST_ADMIN,
  TEST_WORKSHOP,
} from "./helpers";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { adjustToActual } from "@/lib/stock/unified/ledger";
import { cleanupTestMugs, createTestMug, mugStock } from "./mugSeed";
import { seedOrderWithFiles } from "./orderSeed";

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

  /** Unified «Кружки» variant (`id` = variant id). */
  const createActiveMugSku = (stockQuantity: number) => createTestMug(stockQuantity);

  const cleanupMugProduct = (variantId: string) => cleanupTestMugs([variantId]);

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

    expect(await mugStock(mug.id)).toBe(93);

    const mov = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(mov?.delta)).toBe(-7);
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
      kind: "stock_variant",
      variantId: mug.id,
      requestedQty: 5,
      stockAtOrder: 4,
    });

    expect(await mugStock(mug.id)).toBe(4);

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
      await mugStock(mug.id),
    ).toBe(46);

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);

    expect(
      await mugStock(mug.id),
    ).toBe(50);

    const ret = await prisma.stockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: StockMovementKind.OrderReturn,
      },
    });
    expect(Number(ret?.delta)).toBe(4);

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
      await mugStock(mug.id),
    ).toBe(2);

    await prisma.$transaction((tx) =>
      adjustToActual(tx, { variantId: mug.id, actualQuantity: 1, createdById: null }),
    );

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
      kind: "stock_variant",
      variantId: mug.id,
      requestedQty: 2,
      stockAtOrder: 1,
    });

    expect(
      await mugStock(mug.id),
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
      await mugStock(mug.id),
    ).toBe(0);

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 10, totalCostMdl: 0 }],
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
      await mugStock(mug.id),
    ).toBe(5);

    const sale = await prisma.stockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: StockMovementKind.OrderSale,
      },
    });
    expect(Number(sale?.delta)).toBe(-5);

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
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 10, totalCostMdl: 0 }],
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
      await mugStock(mug.id),
    ).toBe(3);

    const saleA = await prisma.stockMovement.findFirst({
      where: { orderId: orderA.id, kind: StockMovementKind.OrderSale },
    });
    const saleB = await prisma.stockMovement.findFirst({
      where: { orderId: orderB.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(saleA?.delta)).toBe(-4);
    expect(Number(saleB?.delta)).toBe(-3);

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
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 5, totalCostMdl: 0 }],
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
      await mugStock(mug.id),
    ).toBe(5);

    const sales = await prisma.stockMovement.count({
      where: {
        variantId: mug.id,
        kind: StockMovementKind.OrderSale,
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
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 3, totalCostMdl: 0 }],
      }),
    });
    expect(recRes.status).toBe(200);

    const o = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true },
    });
    expect(o?.needsProcurement).toBe(true);

    expect(
      await mugStock(mug.id),
    ).toBe(3);

    const saleCount = await prisma.stockMovement.count({
      where: {
        orderId: order.id,
        kind: StockMovementKind.OrderSale,
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
        purchasedAt: new Date().toISOString(),
        lines: [
          { productId: mug.id, quantity: 4, totalCostMdl: 0 },
          { productId: mug.id, quantity: 3, totalCostMdl: 0 },
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
      await mugStock(mug.id),
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
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 2, totalCostMdl: 0 }],
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
      await mugStock(mug.id),
    ).toBe(2);

    const rec2 = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 10, totalCostMdl: 0 }],
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
      await mugStock(mug.id),
    ).toBe(6);

    const sale = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(sale?.delta)).toBe(-6);

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
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: mug.id, quantity: 15, totalCostMdl: 0 }],
        note: "integration",
      }),
    });
    expect(res.status).toBe(200);

    expect(await mugStock(mug.id)).toBe(25);

    const mov = await prisma.stockMovement.findFirst({
      where: { variantId: mug.id, kind: StockMovementKind.Receipt },
    });
    expect(Number(mov?.delta)).toBe(15);
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

  /** A mug migrated from `mug_products`: the item keeps the old id in `legacyId`. */
  async function createLegacyMug(stockQuantity: number) {
    const mug = await createActiveMugSku(stockQuantity);
    const legacyId = randomUUID();
    await prisma.stockItem.update({ where: { id: mug.itemId }, data: { legacyKind: "mug", legacyId } });
    return { mug, legacyId };
  }

  it("receipt fills an order that waited with a legacy `mug` procurement entry", async () => {
    const { mug, legacyId } = await createLegacyMug(0);
    const order = await seedOrderWithFiles(
      {
        phone: `+3737${Date.now().toString().slice(-8)}`,
        productType: "mug",
        publicToken: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
        needsProcurement: true,
        procurementMeta: { kind: "mug", productId: legacyId, sku: "OLD", requestedQty: 3, stockAtOrder: 0 },
      },
      [{ fileName: "w.png", fileUrl: "uploads/it-mug-legacy-wait", copies: 3, color: "color" }],
    );
    // Migrated lines carry the variant.
    await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { stockVariantId: mug.id } });

    const recRes = await fetch(`${baseUrl()}/api/admin/mug-stock/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: workshopCookie },
      body: JSON.stringify({
        purchasedAt: new Date().toISOString(),
        // A legacy mug id still resolves to its variant.
        lines: [{ productId: legacyId, quantity: 5, totalCostMdl: 50 }],
      }),
    });
    expect(recRes.status).toBe(200);

    const filled = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true, procurementMeta: true },
    });
    expect(filled?.needsProcurement).toBe(false);
    expect(filled?.procurementMeta).toBeNull();
    expect(await mugStock(mug.id)).toBe(2);

    await cleanupMugProduct(mug.id);
  });

  it("DELETE of an old order (legacy sale without line id) returns the mugs once", async () => {
    const mug = await createActiveMugSku(10);
    const order = await seedOrderWithFiles(
      {
        phone: `+3737${Date.now().toString().slice(-8)}`,
        productType: "mug",
        publicToken: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
      [{ fileName: "o.png", fileUrl: "uploads/it-mug-old", copies: 4, color: "color" }],
    );
    await prisma.orderLine.updateMany({ where: { orderId: order.id }, data: { stockVariantId: mug.id } });
    // Sale copied from the legacy mug ledger: tied to the order, not to a line.
    await prisma.stockMovement.create({
      data: { variantId: mug.id, delta: -4, kind: StockMovementKind.OrderSale, orderId: order.id },
    });
    await prisma.stockVariant.update({ where: { id: mug.id }, data: { stockQuantity: 6 } });

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);
    expect(await mugStock(mug.id)).toBe(10);

    const restRes = await fetch(`${baseUrl()}/api/orders/${order.id}/restore`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(restRes.status).toBe(200);
    expect(await mugStock(mug.id)).toBe(6);

    await cleanupMugProduct(mug.id);
  });
});
