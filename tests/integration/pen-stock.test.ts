/**
 * Pen procurement + POST /api/admin/pen-stock/receipt integration tests.
 * Prerequisites: same as mug-stock.test.ts / notebook-stock.test.ts.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN, TEST_WORKSHOP } from "./helpers";
import { PEN_STOCK_KIND } from "@/lib/pen/penStockKinds";

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
    return prisma.penProduct.create({
      data: {
        sku,
        nameRo: "IT Pen",
        nameRu: "IT Pen",
        nameEn: "IT Pen",
        stockQuantity,
        isActive: true,
      },
    });
  }

  async function cleanupPenProduct(penProductId: string) {
    await prisma.penStockMovement.deleteMany({ where: { penProductId } });
    await prisma.order.deleteMany({ where: { penProductId } });
    await prisma.penProduct.deleteMany({ where: { id: penProductId } });
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

    const updated = await prisma.penProduct.findUnique({
      where: { id: pen.id },
    });
    expect(updated?.stockQuantity).toBe(95);

    const mov = await prisma.penStockMovement.findFirst({
      where: { orderId: order.id, kind: PEN_STOCK_KIND.ORDER_SALE },
    });
    expect(mov?.delta).toBe(-5);
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
      kind: "pen",
      requestedQty: 5,
      stockAtOrder: 3,
    });

    const unchanged = await prisma.penProduct.findUnique({ where: { id: pen.id } });
    expect(unchanged?.stockQuantity).toBe(3);

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

    expect(
      (await prisma.penProduct.findUnique({ where: { id: pen.id } }))
        ?.stockQuantity,
    ).toBe(46);

    const delRes = await fetch(`${baseUrl()}/api/orders/${order.id}`, {
      method: "DELETE",
      headers: { Cookie: adminCookie },
    });
    expect(delRes.status).toBe(200);

    expect(
      (await prisma.penProduct.findUnique({ where: { id: pen.id } }))
        ?.stockQuantity,
    ).toBe(50);

    const ret = await prisma.penStockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: PEN_STOCK_KIND.ORDER_STOCK_RETURN,
      },
    });
    expect(ret?.delta).toBe(4);

    await cleanupPenProduct(pen.id);
  });

  it("POST /api/admin/pen-stock/receipt increases stock without auto-allocating backlog", async () => {
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

    expect(
      (await prisma.penProduct.findUnique({ where: { id: pen.id } }))
        ?.stockQuantity,
    ).toBe(0);

    const recRes = await fetch(`${baseUrl()}/api/admin/pen-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        penProductId: pen.id,
        quantity: 15,
        note: "pen-backorder-fill",
      }),
    });
    expect(recRes.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({
      where: { id: order.id },
      select: { needsProcurement: true, procurementMeta: true },
    });
    expect(updatedOrder?.needsProcurement).toBe(true);
    expect(updatedOrder?.procurementMeta).not.toBeNull();

    expect(
      (await prisma.penProduct.findUnique({ where: { id: pen.id } }))
        ?.stockQuantity,
    ).toBe(15);

    const saleCount = await prisma.penStockMovement.count({
      where: {
        orderId: order.id,
        kind: PEN_STOCK_KIND.ORDER_SALE,
      },
    });
    expect(saleCount).toBe(0);

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
        penProductId: pen.id,
        quantity: 20,
        note: "integration test",
      }),
    });
    expect(res.status).toBe(200);

    const updated = await prisma.penProduct.findUnique({ where: { id: pen.id } });
    expect(updated?.stockQuantity).toBe(30);

    const mov = await prisma.penStockMovement.findFirst({
      where: { penProductId: pen.id, kind: PEN_STOCK_KIND.RECEIPT },
    });
    expect(mov?.delta).toBe(20);
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
