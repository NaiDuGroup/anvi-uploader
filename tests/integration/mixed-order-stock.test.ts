/**
 * Mixed multi-line admin orders: stock deducted per SKU (requires running app + DB like mug-stock.test.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { cleanupTestMugs, createTestMug, mugStock } from "./mugSeed";

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

  const createActiveMugSku = (stockQuantity: number) => createTestMug(stockQuantity);

  const cleanupMugProducts = (ids: string[]) => cleanupTestMugs(ids);

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

    expect(await mugStock(a.id)).toBe(47);
    expect(await mugStock(b.id)).toBe(35);

    const movA = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, variantId: a.id, kind: StockMovementKind.OrderSale },
    });
    const movB = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, variantId: b.id, kind: StockMovementKind.OrderSale },
    });
    expect(Number(movA?.delta)).toBe(-3);
    expect(Number(movB?.delta)).toBe(-5);

    const lines = await prisma.orderLine.findMany({
      where: { orderId: order.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(lines.length).toBe(2);
    expect(lines[0]?.productType).toBe("mug");
    expect(lines[1]?.productType).toBe("mug");
    expect(lines.map((l) => l.stockVariantId)).toEqual([a.id, b.id]);
    expect(movA?.orderLineId).toBe(lines[0]?.id);

    await prisma.order.deleteMany({ where: { id: order.id } });
    await cleanupMugProducts([a.id, b.id]);
  });
});
