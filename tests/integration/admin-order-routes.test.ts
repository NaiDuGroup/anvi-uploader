/**
 * GET /api/admin/orders/by-client; PATCH mug-layout / notebook-layout.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const minimalMugLayout = {
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

describe.skipIf(!shouldRun)("integration: admin order by-client & layout routes", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createActiveMugSku(stockQuantity: number) {
    const sku = `IT-OR-M-${Date.now()}-${nanoid(6)}`;
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

  async function createActiveNotebookSku(stockQuantity: number) {
    const sku = `IT-OR-N-${Date.now()}-${nanoid(6)}`;
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

  async function cleanupMugProduct(mugProductId: string) {
    await prisma.mugStockMovement.deleteMany({ where: { mugProductId } });
    await prisma.order.deleteMany({ where: { mugProductId } });
    await prisma.mugProduct.deleteMany({ where: { id: mugProductId } });
  }

  async function cleanupNotebookProduct(notebookProductId: string) {
    await prisma.notebookStockMovement.deleteMany({
      where: { notebookProductId },
    });
    await prisma.order.deleteMany({ where: { notebookProductId } });
    await prisma.notebookProduct.deleteMany({ where: { id: notebookProductId } });
  }

  it("GET /api/admin/orders/by-client requires clientId; lists orders for client", async () => {
    const client = await prisma.studioCustomer.create({
      data: {
        kind: "INDIVIDUAL",
        phone: `+3737${Date.now().toString().slice(-8)}`,
      },
    });
    const phone = `+3738${Date.now().toString().slice(-8)}`;

    const bad = await fetch(`${baseUrl()}/api/admin/orders/by-client`, {
      headers: { Cookie: adminCookie },
    });
    expect(bad.status).toBe(400);

    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        clientId: client.id,
        lines: [
          {
            productType: "paper_print",
            files: [
              {
                fileName: "a.pdf",
                fileUrl: "uploads/it-by-client",
                copies: 1,
                color: "bw",
                paperType: "A4",
                pageCount: 1,
              },
            ],
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as { id: string };

    const list = await fetch(
      `${baseUrl()}/api/admin/orders/by-client?clientId=${client.id}`,
      { headers: { Cookie: adminCookie } },
    );
    expect(list.status).toBe(200);
    const body = (await list.json()) as {
      orders: Array<{ id: string; orderNumber: number }>;
    };
    expect(body.orders.some((o) => o.id === order.id)).toBe(true);

    await prisma.order.delete({ where: { id: order.id } });
    await prisma.studioCustomer.delete({ where: { id: client.id } });
  });

  it("PATCH mug-layout — 200 happy path; 400 wrong orderLineId", async () => {
    const mug = await createActiveMugSku(40);
    const phone = `+3739${Date.now().toString().slice(-8)}`;

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
            fileName: "m.png",
            fileUrl: "uploads/it-mug-layout",
            copies: 2,
            color: "color",
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as { id: string };

    const ok = await fetch(
      `${baseUrl()}/api/admin/orders/${order.id}/mug-layout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          mugLayoutData: minimalMugLayout,
          fileUrl: "uploads/it-mug-layout-2",
          fileName: "x.png",
          copies: 1,
        }),
      },
    );
    expect(ok.status).toBe(200);

    const badLine = await fetch(
      `${baseUrl()}/api/admin/orders/${order.id}/mug-layout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          mugLayoutData: minimalMugLayout,
          fileUrl: "uploads/it-mug-layout-3",
          fileName: "y.png",
          // Valid UUID v4 (Zod rejects invalid version nibble); not an order line on this order.
          orderLineId: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
        }),
      },
    );
    expect(badLine.status).toBe(400);
    const err = (await badLine.json()) as { error: string };
    expect(err.error).toBe("Mug line not found");

    await prisma.order.delete({ where: { id: order.id } });
    await cleanupMugProduct(mug.id);
  });

  it("PATCH notebook-layout — 200 happy path; 400 wrong orderLineId", async () => {
    const nb = await createActiveNotebookSku(25);
    const phone = `+3740${Date.now().toString().slice(-8)}`;

    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        productType: "notebook",
        notebookProductId: nb.id,
        notebookLayoutData: minimalNotebookLayout,
        files: [
          {
            fileName: "n.png",
            fileUrl: "uploads/it-nb-layout",
            copies: 1,
            color: "color",
          },
        ],
      }),
    });
    expect(createRes.status).toBe(201);
    const order = (await createRes.json()) as { id: string };

    const ok = await fetch(
      `${baseUrl()}/api/admin/orders/${order.id}/notebook-layout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          notebookLayoutData: minimalNotebookLayout,
          fileUrl: "uploads/it-nb-layout-2",
          fileName: "z.png",
          copies: 2,
        }),
      },
    );
    expect(ok.status).toBe(200);

    const badLine = await fetch(
      `${baseUrl()}/api/admin/orders/${order.id}/notebook-layout`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          notebookLayoutData: minimalNotebookLayout,
          fileUrl: "uploads/it-nb-layout-3",
          fileName: "w.png",
          orderLineId: "01234567-89ab-4def-8123-456789abcdef",
        }),
      },
    );
    expect(badLine.status).toBe(400);
    const err = (await badLine.json()) as { error: string };
    expect(err.error).toBe("Notebook line not found");

    await prisma.order.delete({ where: { id: order.id } });
    await cleanupNotebookProduct(nb.id);
  });
});
