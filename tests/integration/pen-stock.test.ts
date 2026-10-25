/**
 * Pen procurement + POST /api/admin/pen-stock/receipt integration tests.
 * Pens are unified «Ручки» variants: `pen.id` below is the variant id.
 * Prerequisites: same as mug-stock.test.ts / notebook-stock.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN, TEST_WORKSHOP } from "./helpers";
import { createPenCatalogItem } from "@/lib/pen/penCatalogWrite";
import { PEN_ATTRIBUTE_DEFAULTS } from "@/lib/pen/penVariant";
import { StockMovementKind } from "@/lib/stock/unified/kinds";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const minimalPenLayout = {
  templateId: "text_only" as const,
  text: "Test",
  fontFamily: "Roboto",
  textColor: "#000000",
  backgroundColor: "transparent",
  photoUrls: [] as string[],
  photoSettings: [] as Array<{
    fitMode: "cover" | "contain";
    alignment: "left" | "center" | "right";
    verticalAlignment: "top" | "center" | "bottom";
  }>,
};

describe.skipIf(!shouldRun)("integration: pen stock", () => {
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

  async function createActivePenSku(stockQuantity: number) {
    const sku = `IT-PEN-${Date.now()}-${nanoid(6)}`;
    return prisma.$transaction((tx) =>
      createPenCatalogItem(
        tx,
        {
          sku,
          nameRo: "IT Pen",
          nameRu: "IT Pen",
          nameEn: "IT Pen",
          stockQuantity,
          sellPrice: null,
          dealerPrice: null,
          purchaseCost: null,
          imageUrl: null,
          ...PEN_ATTRIBUTE_DEFAULTS,
          isActive: true,
          sortOrder: 0,
          internalNotes: null,
        },
        null,
      ),
    );
  }

  async function penStock(variantId: string): Promise<number> {
    const v = await prisma.stockVariant.findUnique({ where: { id: variantId } });
    return Number(v?.stockQuantity ?? 0);
  }

  async function cleanupPenProduct(variantId: string) {
    const v = await prisma.stockVariant.findUnique({ where: { id: variantId }, select: { itemId: true } });
    await prisma.order.deleteMany({ where: { orderLines: { some: { stockVariantId: variantId } } } });
    await prisma.stockMovement.deleteMany({ where: { variantId } });
    if (v) await prisma.stockItem.deleteMany({ where: { id: v.itemId } });
  }

  it("POST /api/admin/orders pen deducts stock and creates ORDER_SALE movement", async () => {
    const pen = await createActivePenSku(100);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const res = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        productType: "pen",
        penProductId: pen.id,
        penLayoutData: minimalPenLayout,
        files: [
          {
            fileName: "p.png",
            fileUrl: "uploads/it-pen-key",
            copies: 5,
            color: "color",
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const order = await res.json();

    expect(await penStock(pen.id)).toBe(95);

    const mov = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(mov?.delta)).toBe(-5);
    expect(mov?.orderLineId).toBeTruthy();
    expect(mov?.orderNumber).toBe(order.orderNumber);

    await cleanupPenProduct(pen.id);
  });

  it("POST /api/orders creates backorder when pen stock insufficient (public)", async () => {
    const pen = await createActivePenSku(3);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const res = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "pen",
        penProductId: pen.id,
        penLayoutData: minimalPenLayout,
        files: [
          {
            fileName: "x.png",
            fileUrl: "uploads/it-pub-pen",
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
      variantId: pen.id,
      requestedQty: 5,
      stockAtOrder: 3,
    });

    expect(await penStock(pen.id)).toBe(3);

    await prisma.order.deleteMany({ where: { id: order.id } });
    await cleanupPenProduct(pen.id);
  });

  it("DELETE /api/orders/:id soft-delete restores pen stock", async () => {
    const pen = await createActivePenSku(50);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        productType: "pen",
        penProductId: pen.id,
        penLayoutData: minimalPenLayout,
        files: [
          {
            fileName: "d.png",
            fileUrl: "uploads/it-del-pen",
            copies: 4,
            color: "color",
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const order = await createRes.json();

    expect(await penStock(pen.id)).toBe(46);

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);

    expect(await penStock(pen.id)).toBe(50);

    const ret = await prisma.stockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: StockMovementKind.OrderReturn,
      },
    });
    expect(Number(ret?.delta)).toBe(4);

    await cleanupPenProduct(pen.id);
  });

  it("POST /api/admin/pen-stock/receipt clears needsProcurement and reserves stock for backlog", async () => {
    const pen = await createActivePenSku(0);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const ordRes = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "pen",
        penProductId: pen.id,
        penLayoutData: minimalPenLayout,
        files: [
          {
            fileName: "bo.png",
            fileUrl: "uploads/it-pen-backorder",
            copies: 10,
            color: "color",
          },
        ],
      }),
    });
    expect(ordRes.status).toBe(201);
    const order = await ordRes.json();
    expect(order.needsProcurement).toBe(true);

    expect(await penStock(pen.id)).toBe(0);

    const recRes = await fetch(`${baseUrl()}/api/admin/pen-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: pen.id, quantity: 15, totalCostMdl: 0 }],
        note: "pen-backorder-fill",
      }),
    });
    expect(recRes.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true, procurementMeta: true },
    });
    expect(updatedOrder?.needsProcurement).toBe(false);
    expect(updatedOrder?.procurementMeta).toBeNull();

    expect(await penStock(pen.id)).toBe(5);

    const sale = await prisma.stockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: StockMovementKind.OrderSale,
      },
    });
    expect(Number(sale?.delta)).toBe(-10);

    await cleanupPenProduct(pen.id);
  });

  it("POST /api/admin/pen-stock/receipt increases stock (workshop)", async () => {
    const pen = await createActivePenSku(10);

    const res = await fetch(`${baseUrl()}/api/admin/pen-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        purchasedAt: new Date().toISOString(),
        lines: [{ productId: pen.id, quantity: 20, totalCostMdl: 0 }],
        note: "integration test",
      }),
    });
    expect(res.status).toBe(200);

    expect(await penStock(pen.id)).toBe(30);

    const mov = await prisma.stockMovement.findFirst({
      where: { variantId: pen.id, kind: StockMovementKind.Receipt },
    });
    expect(Number(mov?.delta)).toBe(20);
    expect(mov?.note).toBe("integration test");

    await cleanupPenProduct(pen.id);
  });

  /**
   * Unlike mug/notebook, the pen catalog is open to the studio admin role
   * as well (commit b981a77 "Allow studio admin role"), so both workshop
   * and admin get 200 here.
   */
  it("GET /api/admin/pen-products/:id/stock-movements — workshop and admin both 200", async () => {
    const pen = await createActivePenSku(1);

    const ok = await fetch(
      `${baseUrl()}/api/admin/pen-products/${pen.id}/stock-movements`,
      { headers: { Cookie: workshopCookie } },
    );
    expect(ok.status).toBe(200);
    const data = await ok.json();
    expect(Array.isArray(data.movements)).toBe(true);

    const adminRes = await fetch(
      `${baseUrl()}/api/admin/pen-products/${pen.id}/stock-movements`,
      { headers: { Cookie: adminCookie } },
    );
    expect(adminRes.status).toBe(200);

    await cleanupPenProduct(pen.id);
  });
});
