/**
 * Notebook procurement + POST /api/admin/notebook-stock/receipt (same prerequisites as mug-stock).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_WORKSHOP } from "./helpers";
import { NOTEBOOK_STOCK_KIND } from "@/lib/notebook/notebookStockKinds";

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

describe.skipIf(!shouldRun)("integration: notebook stock receipt + backlog", () => {
  let workshopCookie: string;

  beforeAll(async () => {
    workshopCookie = (
      await login(TEST_WORKSHOP.name, TEST_WORKSHOP.password)
    ).cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createActiveNotebookSku(stockQuantity: number) {
    const sku = `IT-NB-RC-${Date.now()}-${nanoid(6)}`;
    return prisma.notebookProduct.create({
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

  async function cleanupNotebookProduct(notebookProductId: string) {
    await prisma.notebookStockMovement.deleteMany({
      where: { notebookProductId },
    });
    await prisma.order.deleteMany({ where: { notebookProductId } });
    await prisma.notebookProduct.deleteMany({ where: { id: notebookProductId } });
  }

  it("POST /api/admin/notebook-stock/receipt clears needsProcurement and reserves stock for backlog", async () => {
    const nb = await createActiveNotebookSku(0);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const ordRes = await fetch(`${baseUrl()}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        productType: "notebook",
        notebookProductId: nb.id,
        notebookLayoutData: minimalNotebookLayout,
        files: [
          {
            fileName: "bo.png",
            fileUrl: "uploads/it-nb-backorder",
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
      (await prisma.notebookProduct.findUnique({ where: { id: nb.id } }))
        ?.stockQuantity,
    ).toBe(0);

    const recRes = await fetch(`${baseUrl()}/api/admin/notebook-stock/receipt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: workshopCookie,
      },
      body: JSON.stringify({
        lines: [{ notebookProductId: nb.id, quantity: 10 }],
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

    expect(
      (await prisma.notebookProduct.findUnique({ where: { id: nb.id } }))
        ?.stockQuantity,
    ).toBe(5);

    const sale = await prisma.notebookStockMovement.findFirst({
      where: {
        orderId: order.id,
        kind: NOTEBOOK_STOCK_KIND.ORDER_SALE,
      },
    });
    expect(sale?.delta).toBe(-5);

    await cleanupNotebookProduct(nb.id);
  });
});
