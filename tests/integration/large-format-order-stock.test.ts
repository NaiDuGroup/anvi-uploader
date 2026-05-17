/**
 * Admin LF orders: roll meters + ink tank deductions (needs running app + DB).
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN } from "./helpers";
import { procurementMetaToList } from "@/lib/orderProcurement";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const INK_TANK_ID = DEFAULT_PRINT_PROCESS;
const ACCOUNTING_ID = "default";

async function lfMaterialPayload(nameSuffix: string, stockLm: string) {
  return prisma.largeFormatMaterial.create({
    data: {
      name: `IT LF stock ${nameSuffix}`,
      rollWidthMeters: new Prisma.Decimal("1.520"),
      printableWidthMeters: new Prisma.Decimal("1.220"),
      rollLengthMeters: new Prisma.Decimal("30.000"),
      stockLinearMeters: new Prisma.Decimal(stockLm),
      costPerLinearMeter: 40,
      dealerPricePerLinearMeter: 80,
      retailPricePerLinearMeter: 120,
      dealerPrintPricePerLinearMeter: 25,
      retailPrintPricePerLinearMeter: 45,
      finalRetailPricePerLinearMeter: 100,
      finalDealerPricePerLinearMeter: 80,
      isActive: true,
      sortOrder: 0,
    },
  });
}

type LfLineData = {
  calculatedLinearMeters?: number;
  inkMlUsed?: number;
  totalSellPrice?: number;
  usefulAreaSqm?: number;
};

describe.skipIf(!shouldRun)("integration: LF order stock (roll + ink)", () => {
  let adminCookie: string;
  let savedProductionCosts: Prisma.JsonValue | null = null;
  let savedInk: { stockMl: Prisma.Decimal; avgCostPerMl: Prisma.Decimal } | null =
    null;

  beforeAll(async () => {
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;

    const acct = await prisma.accountingSettings.findUnique({
      where: { id: ACCOUNTING_ID },
    });
    savedProductionCosts = acct?.productionCosts ?? null;

    const inkRow = await prisma.inkInventory.findUnique({
      where: { id: INK_TANK_ID },
    });
    savedInk = inkRow
      ? { stockMl: inkRow.stockMl, avgCostPerMl: inkRow.avgCostPerMl }
      : null;

    const mergedCosts =
      acct?.productionCosts != null &&
      typeof acct.productionCosts === "object" &&
      !Array.isArray(acct.productionCosts)
        ? { ...(acct.productionCosts as Record<string, unknown>) }
        : {};

    await prisma.accountingSettings.upsert({
      where: { id: ACCOUNTING_ID },
      create: {
        id: ACCOUNTING_ID,
        productionCosts: {
          ...mergedCosts,
          inkMlPerSqmLargeFormatRoll: 20,
          lfInkRetailMarkupMultiplier: 1.5,
          lfMinimumLineTotalMdl: 0,
        },
      },
      update: {
        productionCosts: {
          ...mergedCosts,
          inkMlPerSqmLargeFormatRoll: 20,
          lfInkRetailMarkupMultiplier: 1.5,
          lfMinimumLineTotalMdl: 0,
        },
      },
    });

    await prisma.inkInventory.upsert({
      where: { id: INK_TANK_ID },
      create: {
        id: INK_TANK_ID,
        stockMl: new Prisma.Decimal("50000"),
        avgCostPerMl: new Prisma.Decimal("0.5"),
      },
      update: {
        stockMl: new Prisma.Decimal("50000"),
        avgCostPerMl: new Prisma.Decimal("0.5"),
      },
    });
  });

  beforeEach(async () => {
    await prisma.inkInventory.update({
      where: { id: INK_TANK_ID },
      data: {
        stockMl: new Prisma.Decimal("50000"),
        avgCostPerMl: new Prisma.Decimal("0.5"),
      },
    });
  });

  afterAll(async () => {
    await prisma.accountingSettings.update({
      where: { id: ACCOUNTING_ID },
      data: {
        productionCosts:
          savedProductionCosts === null || savedProductionCosts === undefined
            ? {}
            : savedProductionCosts,
      },
    });

    if (savedInk) {
      await prisma.inkInventory.update({
        where: { id: INK_TANK_ID },
        data: {
          stockMl: savedInk.stockMl,
          avgCostPerMl: savedInk.avgCostPerMl,
        },
      });
    }

    await prisma.$disconnect();
  });

  it("POST deducts roll meters and ink; movements and JSON match economics", async () => {
    const material = await lfMaterialPayload(`${Date.now()}-ok`, "50");
    const phone = `+3741${Date.now().toString().slice(-8)}`;
    const inkBefore = Number(
      (await prisma.inkInventory.findUniqueOrThrow({ where: { id: INK_TANK_ID } }))
        .stockMl,
    );

    try {
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
              printWidthCm: 50,
              printHeightCm: 70,
              quantity: 2,
              customerType: "retail",
              files: [
                {
                  fileName: "wide.pdf",
                  fileUrl: "uploads/it-lf-stock",
                  copies: 1,
                  color: "color",
                },
              ],
            },
          ],
        }),
      });

      expect(createRes.status).toBe(201);
      const body = (await createRes.json()) as {
        id: string;
        needsProcurement?: boolean;
        orderLines: Array<{
          id: string;
          largeFormatLineData: unknown;
          files: Array<{ id: string }>;
        }>;
      };
      expect(body.needsProcurement).not.toBe(true);

      const line = body.orderLines[0]!;
      const snap = line.largeFormatLineData as LfLineData;
      expect(snap.calculatedLinearMeters).toBeCloseTo(0.7, 6);
      expect(snap.usefulAreaSqm).toBeCloseTo(0.7, 6);
      expect(snap.inkMlUsed).toBeCloseTo(14, 6);
      expect(typeof snap.totalSellPrice).toBe("number");

      const matRow = await prisma.largeFormatMaterial.findUniqueOrThrow({
        where: { id: material.id },
      });
      expect(Number(matRow.stockLinearMeters)).toBeCloseTo(50 - 0.7, 5);

      const inkAfter = Number(
        (await prisma.inkInventory.findUniqueOrThrow({ where: { id: INK_TANK_ID } }))
          .stockMl,
      );
      expect(inkBefore - inkAfter).toBeCloseTo(14, 5);

      const rollMov = await prisma.lfRollStockMovement.findFirst({
        where: {
          orderId: body.id,
          materialId: material.id,
          kind: LF_ROLL_STOCK_KIND.ORDER_SALE,
        },
      });
      expect(rollMov).toBeTruthy();
      expect(Number(rollMov!.quantityLinearMeters)).toBeCloseTo(-0.7, 5);

      const inkMov = await prisma.inkStockMovement.findFirst({
        where: {
          orderId: body.id,
          orderLineId: line.id,
          kind: INK_STOCK_KIND.ORDER_SALE,
        },
      });
      expect(inkMov).toBeTruthy();
      expect(Number(inkMov!.quantityMl)).toBeCloseTo(-14, 5);

      await prisma.order.delete({ where: { id: body.id } });
    } finally {
      await prisma.largeFormatMaterial.delete({ where: { id: material.id } });
    }
  });

  it("POST with insufficient roll sets needsProcurement and does not change stock", async () => {
    const material = await lfMaterialPayload(`${Date.now()}-roll`, "0.05");
    const phone = `+3742${Date.now().toString().slice(-8)}`;

    const matBefore = Number(
      (await prisma.largeFormatMaterial.findUniqueOrThrow({ where: { id: material.id } }))
        .stockLinearMeters,
    );
    const inkBefore = Number(
      (await prisma.inkInventory.findUniqueOrThrow({ where: { id: INK_TANK_ID } }))
        .stockMl,
    );

    try {
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
              printWidthCm: 50,
              printHeightCm: 70,
              quantity: 2,
              customerType: "retail",
              files: [
                {
                  fileName: "wide.pdf",
                  fileUrl: "uploads/it-lf-rollup",
                  copies: 1,
                  color: "color",
                },
              ],
            },
          ],
        }),
      });

      expect(createRes.status).toBe(201);
      const body = (await createRes.json()) as {
        id: string;
        needsProcurement: boolean;
        procurementMeta: unknown;
      };
      expect(body.needsProcurement).toBe(true);
      const meta = procurementMetaToList(body.procurementMeta);
      expect(meta.some((m) => m.kind === "lf_roll")).toBe(true);

      const matAfter = Number(
        (await prisma.largeFormatMaterial.findUniqueOrThrow({ where: { id: material.id } }))
          .stockLinearMeters,
      );
      const inkAfter = Number(
        (await prisma.inkInventory.findUniqueOrThrow({ where: { id: INK_TANK_ID } }))
          .stockMl,
      );
      expect(matAfter).toBeCloseTo(matBefore, 6);
      expect(inkAfter).toBeCloseTo(inkBefore, 6);

      const rollSale = await prisma.lfRollStockMovement.findFirst({
        where: { orderId: body.id, kind: LF_ROLL_STOCK_KIND.ORDER_SALE },
      });
      expect(rollSale).toBeNull();

      await prisma.order.delete({ where: { id: body.id } });
    } finally {
      await prisma.largeFormatMaterial.delete({ where: { id: material.id } });
    }
  });

  it("POST rolls back roll when ink is insufficient after roll deduct", async () => {
    const material = await lfMaterialPayload(`${Date.now()}-ink`, "50");
    const phone = `+3743${Date.now().toString().slice(-8)}`;

    await prisma.inkInventory.update({
      where: { id: INK_TANK_ID },
      data: { stockMl: new Prisma.Decimal("10") },
    });

    const matBefore = Number(
      (await prisma.largeFormatMaterial.findUniqueOrThrow({ where: { id: material.id } }))
        .stockLinearMeters,
    );

    try {
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
              printWidthCm: 50,
              printHeightCm: 70,
              quantity: 2,
              customerType: "retail",
              files: [
                {
                  fileName: "wide.pdf",
                  fileUrl: "uploads/it-lf-inkfail",
                  copies: 1,
                  color: "color",
                },
              ],
            },
          ],
        }),
      });

      expect(createRes.status).toBe(201);
      const body = (await createRes.json()) as {
        id: string;
        needsProcurement: boolean;
        procurementMeta: unknown;
      };
      expect(body.needsProcurement).toBe(true);
      const meta = procurementMetaToList(body.procurementMeta);
      expect(meta.some((m) => m.kind === "ink")).toBe(true);

      const matAfter = Number(
        (await prisma.largeFormatMaterial.findUniqueOrThrow({ where: { id: material.id } }))
          .stockLinearMeters,
      );
      expect(matAfter).toBeCloseTo(matBefore, 6);

      /** Roll was deducted then inventory restored; `restoreLfRollStock` has no audit so ORDER_SALE row stays. */
      const rollSale = await prisma.lfRollStockMovement.findFirst({
        where: { orderId: body.id, kind: LF_ROLL_STOCK_KIND.ORDER_SALE },
      });
      expect(rollSale).toBeTruthy();

      const inkSale = await prisma.inkStockMovement.findFirst({
        where: { orderId: body.id, kind: INK_STOCK_KIND.ORDER_SALE },
      });
      expect(inkSale).toBeNull();

      await prisma.order.delete({ where: { id: body.id } });
    } finally {
      await prisma.largeFormatMaterial.delete({ where: { id: material.id } });
    }
  });

  it("PATCH returns LF stock and re-deducts for new geometry", async () => {
    const material = await lfMaterialPayload(`${Date.now()}-patch`, "50");
    const phone = `+3744${Date.now().toString().slice(-8)}`;

    try {
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
              printWidthCm: 50,
              printHeightCm: 70,
              quantity: 2,
              customerType: "retail",
              files: [
                {
                  fileName: "wide.pdf",
                  fileUrl: "uploads/it-lf-patch",
                  copies: 1,
                  color: "color",
                },
              ],
            },
          ],
        }),
      });

      expect(createRes.status).toBe(201);
      const created = (await createRes.json()) as {
        id: string;
        orderLines: Array<{ id: string; files: Array<{ id: string }> }>;
      };
      const lineId = created.orderLines[0]!.id;
      const fileId = created.orderLines[0]!.files[0]!.id;

      const patchRes = await fetch(`${baseUrl()}/api/admin/orders/${created.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({
          phone,
          lines: [
            {
              orderLineId: lineId,
              productType: "large_format_print",
              largeFormatMaterialId: material.id,
              printWidthCm: 50,
              printHeightCm: 70,
              quantity: 1,
              customerType: "retail",
              files: [
                {
                  fileId,
                  copies: 1,
                  color: "color",
                },
              ],
            },
          ],
        }),
      });

      expect(patchRes.status).toBe(200);
      const updated = (await patchRes.json()) as {
        orderLines: Array<{ largeFormatLineData: unknown }>;
      };
      const snap = updated.orderLines[0]!.largeFormatLineData as LfLineData;
      expect(snap.calculatedLinearMeters).toBeCloseTo(0.5, 6);
      expect(snap.inkMlUsed).toBeCloseTo(7, 6);

      const matRow = await prisma.largeFormatMaterial.findUniqueOrThrow({
        where: { id: material.id },
      });
      expect(Number(matRow.stockLinearMeters)).toBeCloseTo(50 - 0.5, 5);

      const returns = await prisma.lfRollStockMovement.findMany({
        where: { orderId: created.id, kind: LF_ROLL_STOCK_KIND.ORDER_RETURN },
      });
      expect(returns.length).toBeGreaterThanOrEqual(1);

      await prisma.order.delete({ where: { id: created.id } });
    } finally {
      await prisma.largeFormatMaterial.delete({ where: { id: material.id } });
    }
  });
});
