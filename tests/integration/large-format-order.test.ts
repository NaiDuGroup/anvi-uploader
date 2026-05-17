/**
 * POST /api/admin/orders with large_format_print line + LargeFormatMaterial.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

describe.skipIf(!shouldRun)("integration: admin LFP order create", () => {
  let adminCookie: string;

  beforeAll(async () => {
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("POST creates order with large_format_print line and snapshot JSON", async () => {
    const material = await prisma.largeFormatMaterial.create({
      data: {
        name: "IT LF banner",
        rollWidthMeters: new Prisma.Decimal("1.520"),
        rollLengthMeters: new Prisma.Decimal("30.000"),
        costPerLinearMeter: 40,
        dealerPricePerLinearMeter: 80,
        retailPricePerLinearMeter: 120,
        dealerPrintPricePerLinearMeter: 25,
        retailPrintPricePerLinearMeter: 45,
        finalRetailPricePerLinearMeter: 165,
        finalDealerPricePerLinearMeter: 105,
        isActive: true,
        sortOrder: 0,
      },
    });

    const phone = `+3740${Date.now().toString().slice(-8)}`;
    const createRes = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: adminCookie,
      },
      body: JSON.stringify({
        phone,
        lines: [
          {
            productType: "large_format_print",
            largeFormatMaterialId: material.id,
            printWidthCm: 100,
            printHeightCm: 50,
            quantity: 2,
            customerType: "retail",
            files: [
              {
                fileName: "wide.pdf",
                fileUrl: "uploads/it-lf-order",
                copies: 1,
                color: "color",
              },
            ],
          },
        ],
      }),
    });

    try {
      expect(createRes.status).toBe(201);
      const body = (await createRes.json()) as {
        id: string;
        productType: string;
        orderLines: Array<{
          productType: string;
          largeFormatMaterialId: string | null;
          largeFormatLineData: unknown;
        }>;
      };
      expect(body.productType).toBe("large_format_print");
      expect(body.orderLines).toHaveLength(1);
      const line = body.orderLines[0]!;
      expect(line.productType).toBe("large_format_print");
      expect(line.largeFormatMaterialId).toBe(material.id);
      expect(line.largeFormatLineData).toBeTruthy();
      const snap = line.largeFormatLineData as { totalSellPrice?: unknown };
      expect(typeof snap.totalSellPrice).toBe("number");

      await prisma.order.delete({ where: { id: body.id } });
    } finally {
      await prisma.largeFormatMaterial.delete({ where: { id: material.id } });
    }
  });
});
