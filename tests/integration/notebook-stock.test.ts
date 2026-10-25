/**
 * Notebook procurement + POST /api/admin/notebook-stock/receipt integration tests.
 * Notebooks are unified «Блокноты» variants: `nb.id` below is the variant id.
 * Prerequisites: same as mug-stock.test.ts / pen-stock.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN, TEST_WORKSHOP } from "./helpers";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { cleanupTestNotebook, createTestNotebook, notebookStock } from "./notebookSeed";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const minimalNotebookLayout = {
  templateId: "text_photo" as const,
  text: "",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{
    fitMode: "cover" | "contain";
    alignment: "left" | "center" | "right";
  }>,
};

describe.skipIf(!shouldRun)("integration: notebook stock", () => {
  let adminCookie: string;
  let workshopCookie: string;

  beforeAll(async () => {
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;
    workshopCookie = (await login(TEST_WORKSHOP.name, TEST_WORKSHOP.password)).cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  function adminNotebookOrder(nbId: string, copies: number) {
    return fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        phone: `+3737${Date.now().toString().slice(-8)}`,
        productType: "notebook",
        notebookProductId: nbId,
        notebookLayoutData: minimalNotebookLayout,
        files: [{ fileName: "n.png", fileUrl: "uploads/it-nb-key", copies, color: "color" }],
      }),
    });
  }

  it("POST /api/admin/orders notebook deducts stock, writes the variant and an ORDER_SALE movement", async () => {
    const nb = await createTestNotebook(100);

    const res = await adminNotebookOrder(nb.id, 5);
    expect(res.status).toBe(201);
    const order = await res.json();

    expect(await notebookStock(nb.id)).toBe(95);
    const line = await prisma.orderLine.findFirst({ where: { orderId: order.id } });
    expect(line?.stockVariantId).toBe(nb.id);

    const mov = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(mov?.delta)).toBe(-5);
    expect(mov?.orderLineId).toBe(line?.id);
    expect(mov?.orderNumber).toBe(order.orderNumber);

    await cleanupTestNotebook(nb.id);
  });

  it("DELETE /api/orders/:id soft-delete restores notebook stock once", async () => {
    const nb = await createTestNotebook(50);
    const createRes = await adminNotebookOrder(nb.id, 4);
    expect(createRes.status).toBe(201);
    const order = await createRes.json();
    expect(await notebookStock(nb.id)).toBe(46);

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);
    expect(await notebookStock(nb.id)).toBe(50);

    const ret = await prisma.stockMovement.findMany({
      where: { orderId: order.id, kind: StockMovementKind.OrderReturn },
    });
    expect(ret.map((m) => Number(m.delta))).toEqual([4]);

    await cleanupTestNotebook(nb.id);
  });

  it("POST /api/admin/notebook-stock/receipt clears needsProcurement and reserves stock for backlog", async () => {
    const nb = await createTestNotebook(0);

    const ordRes = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone: `+3737${Date.now().toString().slice(-8)}`,
        productType: "notebook",
        notebookProductId: nb.id,
        notebookLayoutData: minimalNotebookLayout,
        files: [{ fileName: "bo.png", fileUrl: "uploads/it-nb-backorder", copies: 5, color: "color" }],
      }),
    });
    expect(ordRes.status).toBe(201);
    const order = await ordRes.json();
    expect(order.needsProcurement).toBe(true);
    expect(order.procurementMeta).toMatchObject({
      kind: "stock_variant",
      variantId: nb.id,
      requestedQty: 5,
      stockAtOrder: 0,
    });
    expect(await notebookStock(nb.id)).toBe(0);

    const recRes = await fetch(`${baseUrl()}/api/admin/notebook-stock/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: workshopCookie },
      body: JSON.stringify({
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: nb.id, quantity: 10, totalCostMdl: 0 }],
        note: "nb-backorder-fill",
      }),
    });
    expect(recRes.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true, procurementMeta: true },
    });
    expect(updatedOrder?.needsProcurement).toBe(false);
    expect(updatedOrder?.procurementMeta).toBeNull();
    expect(await notebookStock(nb.id)).toBe(5);

    const sale = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(sale?.delta)).toBe(-5);

    await cleanupTestNotebook(nb.id);
  });

  it("GET /api/admin/notebook-products/:id/stock-movements — workshop 200, studio admin 403", async () => {
    const nb = await createTestNotebook(1);

    const ok = await fetch(`${baseUrl()}/api/admin/notebook-products/${nb.id}/stock-movements`, {
      headers: { Cookie: workshopCookie },
    });
    expect(ok.status).toBe(200);
    const data = (await ok.json()) as { movements: unknown[] };
    expect(Array.isArray(data.movements)).toBe(true);

    const forbidden = await fetch(`${baseUrl()}/api/admin/notebook-products/${nb.id}/stock-movements`, {
      headers: { Cookie: adminCookie },
    });
    expect(forbidden.status).toBe(403);

    await cleanupTestNotebook(nb.id);
  });
});
