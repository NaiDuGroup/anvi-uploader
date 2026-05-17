/**
 * Mixed multi-line admin orders: stock deducted per SKU (requires running app + DB like mug-stock.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";
import { MUG_STOCK_KIND } from "@/lib/mug/mugStockKinds";

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

describe.skipIf(!shouldRun)("integration: mixed admin order lines (stock)", () => {
  let adminCookie: string;

  beforeAll(async () => {
    const a = await login(TEST_ADMIN.name, TEST_ADMIN.password);
    adminCookie = a.cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function createActiveMugSku(stockQuantity: number) {
    const sku = `IT-MIX-${Date.now()}-${nanoid(6)}`;
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

  async function cleanupMugProducts(ids: string[]) {
    for (const id of ids) {
      await prisma.mugStockMovement.deleteMany({ where: { mugProductId: id } });
      await prisma.mugProduct.deleteMany({ where: { id } });
    }
  }

  it("POST /api/admin/orders with lines[] deducts stock per mug SKU", async () => {
    const a = await createActiveMugSku(50);
    const b = await createActiveMugSku(40);
    const phone = `+3737${Date.now().toString().slice(-8)}`;

    const res = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        lines: [
          {
            productType: "mug",
            mugProductId: a.id,
            mugLayoutData: minimalMugLayout,
            files: [
              {
                fileName: "a.png",
                fileUrl: "uploads/it-mix-a",
                copies: 3,
                color: "color",
              },
            ],
          },
          {
            productType: "mug",
            mugProductId: b.id,
            mugLayoutData: minimalMugLayout,
            files: [
              {
                fileName: "b.png",
                fileUrl: "uploads/it-mix-b",
                copies: 5,
                color: "color",
              },
            ],
          },
        ],
      }),
    });

    expect(res.status).toBe(201);
    const order = await res.json();
    expect(order.productType).toBe("mug");

    const updatedA = await prisma.mugProduct.findUnique({ where: { id: a.id } });
    const updatedB = await prisma.mugProduct.findUnique({ where: { id: b.id } });
    expect(updatedA?.stockQuantity).toBe(47);
    expect(updatedB?.stockQuantity).toBe(35);

    const movA = await prisma.mugStockMovement.findFirst({
      where: { orderId: order.id, mugProductId: a.id, kind: MUG_STOCK_KIND.ORDER_SALE },
    });
    const movB = await prisma.mugStockMovement.findFirst({
      where: { orderId: order.id, mugProductId: b.id, kind: MUG_STOCK_KIND.ORDER_SALE },
    });
    expect(movA?.delta).toBe(-3);
    expect(movB?.delta).toBe(-5);

    const lines = await prisma.orderLine.findMany({
      where: { orderId: order.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(lines.length).toBe(2);
    expect(lines[0]?.productType).toBe("mug");
    expect(lines[1]?.productType).toBe("mug");

    await prisma.order.deleteMany({ where: { id: order.id } });
    await cleanupMugProducts([a.id, b.id]);
  });
});
