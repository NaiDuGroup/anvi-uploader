/**
 * Admin LF orders: roll metres on the unified stock (needs running app + DB).
 * Rolls are `LargeFormatMaterial` pricing rows linked to a «Широкоформатные
 * материалы» variant; ink comes from the printer slots (stage 2) and is not
 * asserted here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { baseUrl, login, TEST_ADMIN, TEST_SUPERADMIN } from "./helpers";
import { parseProductionCostsJson, type ProductionCostsConfig } from "@/lib/accounting/types";
import { procurementMetaToList } from "@/lib/orderProcurement";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import {
  cleanupTestLfMaterial,
  createTestLfMaterial,
  rollStock,
  type TestLfMaterial,
} from "./lfMaterialSeed";

const shouldRun = Boolean(
  process.env.TEST_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL,
);

const ACCOUNTING_ID = "default";

/** Goes through the API (not Prisma) so the server drops its cached accounting settings. */
async function patchProductionCosts(cookie: string, costs: ProductionCostsConfig): Promise<void> {
  const res = await fetch(`${baseUrl()}/api/admin/accounting/settings`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify(costs),
  });
  if (!res.ok) throw new Error(`PATCH accounting settings failed: ${res.status}`);
}

type LfLineData = {
  calculatedLinearMeters?: number;
  totalSellPrice?: number;
  usefulAreaSqm?: number;
};

type CreatedOrder = {
  id: string;
  needsProcurement?: boolean;
  procurementMeta?: unknown;
  orderLines: Array<{
    id: string;
    stockVariantId?: string | null;
    largeFormatLineData: unknown;
    files: Array<{ id: string }>;
  }>;
};

function lfLine(materialId: string, quantity: number, fileUrl: string) {
  return {
    productType: "large_format_print",
    largeFormatMaterialId: materialId,
    printWidthCm: 50,
    printHeightCm: 70,
    quantity,
    customerType: "retail",
    files: [{ fileName: "wide.pdf", fileUrl, copies: 1, color: "color" }],
  };
}

async function netHeld(orderId: string, variantId: string): Promise<number> {
  const agg = await prisma.stockMovement.aggregate({
    where: {
      orderId,
      variantId,
      kind: {
        in: [
          StockMovementKind.OrderSale,
          StockMovementKind.OrderReturn,
          StockMovementKind.ProcurementBacklog,
          StockMovementKind.LayoutTransferOut,
          StockMovementKind.LayoutTransferBack,
        ],
      },
    },
    _sum: { delta: true },
  });
  return -Number(agg._sum.delta ?? 0);
}

describe.skipIf(!shouldRun)("integration: LF order stock (roll on the unified stock)", () => {
  let adminCookie: string;
  let superadminCookie: string;
  let savedProductionCosts: Prisma.JsonValue | null = null;
  const created: TestLfMaterial[] = [];

  async function material(suffix: string, stockLm: number): Promise<TestLfMaterial> {
    const m = await createTestLfMaterial(`IT LF stock ${Date.now()}-${suffix}`, { stockLm });
    created.push(m);
    return m;
  }

  async function createOrder(lines: unknown[]): Promise<CreatedOrder> {
    const res = await fetch(`${baseUrl()}/api/admin/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ phone: `+3741${Date.now().toString().slice(-8)}`, lines }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as CreatedOrder;
  }

  beforeAll(async () => {
    adminCookie = (await login(TEST_ADMIN.name, TEST_ADMIN.password)).cookie;
    superadminCookie = (await login(TEST_SUPERADMIN.name, TEST_SUPERADMIN.password)).cookie;

    const acct = await prisma.accountingSettings.findUnique({ where: { id: ACCOUNTING_ID } });
    savedProductionCosts = acct?.productionCosts ?? null;
    const mergedCosts =
      acct?.productionCosts != null &&
      typeof acct.productionCosts === "object" &&
      !Array.isArray(acct.productionCosts)
        ? { ...(acct.productionCosts as Record<string, unknown>) }
        : {};
    await patchProductionCosts(superadminCookie, {
      ...parseProductionCostsJson(mergedCosts),
      inkMlPerSqmLargeFormatRoll: 20,
      lfInkRetailMarkupMultiplier: 1.5,
      lfMinimumLineTotalMdl: 0,
    });
  });

  afterAll(async () => {
    await patchProductionCosts(superadminCookie, parseProductionCostsJson(savedProductionCosts ?? {}));
    for (const m of created) await cleanupTestLfMaterial(m);
    await prisma.$disconnect();
  });

  it("POST takes roll metres from the variant and links the line", async () => {
    const m = await material("ok", 50);
    const body = await createOrder([lfLine(m.id, 2, "uploads/it-lf-stock")]);
    expect(body.needsProcurement).not.toBe(true);

    const line = body.orderLines[0]!;
    const snap = line.largeFormatLineData as LfLineData;
    expect(snap.calculatedLinearMeters).toBeCloseTo(0.7, 6);
    expect(snap.usefulAreaSqm).toBeCloseTo(0.7, 6);
    expect(typeof snap.totalSellPrice).toBe("number");

    expect(await rollStock(m.variantId)).toBeCloseTo(50 - 0.7, 5);
    const dbLine = await prisma.orderLine.findUniqueOrThrow({ where: { id: line.id } });
    expect(dbLine.stockVariantId).toBe(m.variantId);
    expect(dbLine.largeFormatMaterialId).toBe(m.id);

    const sale = await prisma.stockMovement.findFirst({
      where: { orderId: body.id, variantId: m.variantId, kind: StockMovementKind.OrderSale },
    });
    expect(sale).toBeTruthy();
    expect(sale!.orderLineId).toBe(line.id);
    expect(Number(sale!.delta)).toBeCloseTo(-0.7, 5);
  });

  it("POST with too few metres waits (lf_roll entry), takes nothing; a receipt fills it", async () => {
    const m = await material("short", 0.05);
    const body = await createOrder([lfLine(m.id, 2, "uploads/it-lf-short")]);
    expect(body.needsProcurement).toBe(true);
    const meta = procurementMetaToList(body.procurementMeta);
    expect(meta).toEqual([
      expect.objectContaining({ kind: "lf_roll", materialId: m.id, stockAtOrder: 0.05 }),
    ]);
    expect(await rollStock(m.variantId)).toBeCloseTo(0.05, 6);
    expect(
      await prisma.stockMovement.count({ where: { orderId: body.id, kind: StockMovementKind.OrderSale } }),
    ).toBe(0);

    const rec = await fetch(`${baseUrl()}/api/admin/large-format-materials/${m.id}/receipt`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({ quantityLinearMeters: 30, totalCostMdl: 1200, purchasedAt: "2026-10-25" }),
    });
    expect(rec.status).toBe(200);

    const order = await prisma.order.findUniqueOrThrow({ where: { id: body.id } });
    expect(order.needsProcurement).toBe(false);
    const backlog = await prisma.stockMovement.findFirst({
      where: { orderId: body.id, kind: StockMovementKind.ProcurementBacklog },
    });
    expect(Number(backlog?.delta)).toBeCloseTo(-0.7, 5);
    expect(await rollStock(m.variantId)).toBeCloseTo(0.05 + 30 - 0.7, 5);
  });

  it("PATCH returns the roll and re-takes for the new geometry", async () => {
    const m = await material("patch", 50);
    const createdOrder = await createOrder([lfLine(m.id, 2, "uploads/it-lf-patch")]);
    const lineId = createdOrder.orderLines[0]!.id;
    const fileId = createdOrder.orderLines[0]!.files[0]!.id;

    const patchRes = await fetch(`${baseUrl()}/api/admin/orders/${createdOrder.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Cookie: adminCookie },
      body: JSON.stringify({
        phone: `+3744${Date.now().toString().slice(-8)}`,
        lines: [
          {
            ...lfLine(m.id, 1, ""),
            orderLineId: lineId,
            files: [{ fileId, copies: 1, color: "color" }],
          },
        ],
      }),
    });
    expect(patchRes.status).toBe(200);
    const updated = (await patchRes.json()) as { orderLines: Array<{ largeFormatLineData: unknown }> };
    expect((updated.orderLines[0]!.largeFormatLineData as LfLineData).calculatedLinearMeters).toBeCloseTo(0.5, 6);

    expect(await rollStock(m.variantId)).toBeCloseTo(50 - 0.5, 5);
    expect(await netHeld(createdOrder.id, m.variantId)).toBeCloseTo(0.5, 5);
    const returns = await prisma.stockMovement.count({
      where: { orderId: createdOrder.id, kind: StockMovementKind.OrderReturn },
    });
    expect(returns).toBeGreaterThanOrEqual(1);
  });

  it("DELETE returns the roll once; restore takes it again", async () => {
    const m = await material("del", 50);
    const o = await createOrder([lfLine(m.id, 2, "uploads/it-lf-del")]);

    const del = await fetch(`${baseUrl()}/api/orders/${o.id}`, { method: "DELETE", headers: { Cookie: adminCookie } });
    expect(del.status).toBe(200);
    expect(await rollStock(m.variantId)).toBeCloseTo(50, 5);
    expect(await netHeld(o.id, m.variantId)).toBeCloseTo(0, 6);

    const restore = await fetch(`${baseUrl()}/api/orders/${o.id}/restore`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    expect(restore.status).toBe(200);
    expect(await rollStock(m.variantId)).toBeCloseTo(50 - 0.7, 5);
    expect(await netHeld(o.id, m.variantId)).toBeCloseTo(0.7, 5);
  });
});
