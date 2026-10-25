/**
 * POST /api/admin/orders with large_format_print line + LargeFormatMaterial
 * (pricing row linked to its unified «Широкоформатные материалы» variant).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";
import { cleanupTestLfMaterial, createTestLfMaterial } from "./lfMaterialSeed";

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
    const material = await createTestLfMaterial("IT LF banner", {
      rollWidthMeters: "1.520",
      printableWidthMeters: null,
      rollLengthMeters: "30.000",
      costPerLm: 40,
      finalRetailPricePerLinearMeter: 165,
      finalDealerPricePerLinearMeter: 105,
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

    } finally {
      await cleanupTestLfMaterial(material);
    }
  });

  it("POST with lfSizePresetId locks totalSellPrice to preset × quantity (no ink markup)", async () => {
    const material = await createTestLfMaterial("IT LF canvas preset", {
      rollWidthMeters: "1.270",
      printableWidthMeters: null,
      rollLengthMeters: "50.000",
      costPerLm: 42,
      finalRetailPricePerLinearMeter: 165,
      finalDealerPricePerLinearMeter: 105,
    });
    const preset = await prisma.lfMaterialSizePreset.create({
      data: {
        materialId: material.id,
        widthCm: 30,
        heightCm: 42,
        retailPriceMdl: 390,
        dealerPriceMdl: 290,
        sortOrder: 0,
        isActive: true,
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
            lfSizePresetId: preset.id,
            printWidthCm: 30,
            printHeightCm: 42,
            quantity: 2,
            customerType: "retail",
            files: [
              {
                fileName: "canvas.pdf",
                fileUrl: "uploads/it-lf-preset",
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
        orderLines: Array<{ largeFormatLineData: unknown }>;
      };
      const line = body.orderLines[0]!;
      const snap = line.largeFormatLineData as {
        totalSellPrice: number;
        materialSellPrice: number;
        printSellPrice: number;
        sizePresetSnapshot?: {
          presetId: string;
          widthCm: number;
          heightCm: number;
          unitPriceMdl: number;
        };
      };
      /** 390 retail × 2 copies = 780 — no ink markup, no min uplift. */
      expect(snap.totalSellPrice).toBe(780);
      expect(snap.materialSellPrice).toBe(780);
      expect(snap.printSellPrice).toBe(0);
      expect(snap.sizePresetSnapshot).toBeTruthy();
      expect(snap.sizePresetSnapshot?.presetId).toBe(preset.id);
      expect(snap.sizePresetSnapshot?.unitPriceMdl).toBe(390);
      expect(snap.sizePresetSnapshot?.widthCm).toBe(30);

    } finally {
      await prisma.lfMaterialSizePreset.deleteMany({ where: { materialId: material.id } });
      await cleanupTestLfMaterial(material);
    }
  });
});
