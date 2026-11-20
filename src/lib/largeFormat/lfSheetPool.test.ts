/**
 * Pooled sheet write-off (VATMAN A1): «Подтвердить печать» gives the sheets
 * saved by pooling back to stock and re-bases line costs by area.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";

type Movement = { variantId: string; orderId: string | null; orderLineId: string | null; delta: number; kind: string; note?: string | null };
const movements: Movement[] = [];

vi.mock("@/lib/stock/unified/ledger", () => ({
  consume: vi.fn(),
  returnToStock: vi.fn(async (_tx: unknown, p: { variantId: string; quantity: number; kind?: string; orderId?: string | null; orderLineId?: string | null; note?: string | null }) => {
    movements.push({
      variantId: p.variantId,
      orderId: p.orderId ?? null,
      orderLineId: p.orderLineId ?? null,
      delta: p.quantity,
      kind: p.kind ?? "ORDER_RETURN",
      note: p.note ?? null,
    });
  }),
}));
vi.mock("@/lib/stock/unified/materials", async (orig) => ({
  ...(await orig<typeof import("@/lib/stock/unified/materials")>()),
  requireLfMaterialVariantId: vi.fn(async () => "v-vatman"),
}));
vi.mock("@/lib/largeFormat/lfStandStock", () => ({ returnLfStandStockForOrder: vi.fn() }));
vi.mock("@/lib/giftSet/giftSetStock", () => ({ returnGiftSetBoxStockForOrder: vi.fn() }));

import { planLfSheetPool, type LfSheetPoolRecord } from "./lfSheetPool";
import { confirmSheetPoolInTx, SheetPoolError } from "./lfSheetPoolLedger";
import { packTilesOnSheets } from "./lfSheetLayoutPack";
import { lfLineStockQuantityForMaterial, packLfSheets, type LfSheetSpec } from "./lfSheet";
import { returnMaterialStockForOrder } from "@/lib/stock/unified/materialOrderStock";
import type { LargeFormatLineData } from "./types";

const A1: LfSheetSpec = { sheetWidthCm: 61, sheetHeightCm: 86, marginMm: 5 };
const COST_PER_SHEET = 30;

function lineData(w: number, h: number, qty: number): LargeFormatLineData {
  const pack = packLfSheets({ itemWidthCm: w, itemHeightCm: h, quantity: qty, sheet: A1 });
  if (!pack.ok) throw new Error("pack");
  const sheets = pack.layout.sheetsCount;
  return {
    materialSnapshot: { name: "VATMAN A1" },
    printWidthCm: w,
    printHeightCm: h,
    quantity: qty,
    customerType: "retail",
    calculatedLinearMeters: 0,
    materialCost: sheets * COST_PER_SHEET,
    materialSellPrice: sheets * 100,
    printSellPrice: 0,
    totalSellPrice: sheets * 100,
    estimatedProfit: sheets * 100 - sheets * COST_PER_SHEET - 2,
    totalDirectCostMdl: sheets * COST_PER_SHEET + 2,
    inkCostMdl: 2,
    marginPercent: 0,
    sheetLayout: pack.layout,
  } as unknown as LargeFormatLineData;
}

type Line = { id: string; orderId: string; orderNumber: number; data: LargeFormatLineData; productionStatus: string };
let lines: Line[] = [];

/** In-memory transaction: order lines, sheet material, ledger movements. */
function fakeTx(): Prisma.TransactionClient {
  const groupBy = async (args: { by: string[]; where: Record<string, unknown> }) => {
    const w = args.where as { orderId?: string; variantId?: string; orderLineId?: { in: string[] }; kind?: { in: string[] } };
    const rows = movements.filter(
      (m) =>
        (w.orderId === undefined || m.orderId === w.orderId) &&
        (w.variantId === undefined || m.variantId === w.variantId) &&
        (w.orderLineId === undefined || (m.orderLineId !== null && w.orderLineId.in.includes(m.orderLineId))) &&
        (w.kind === undefined || w.kind.in.includes(m.kind)),
    );
    const out = new Map<string, { variantId: string; orderLineId: string | null; sum: number }>();
    for (const m of rows) {
      const key = args.by.map((k) => String((m as Record<string, unknown>)[k])).join("|");
      const cur = out.get(key) ?? { variantId: m.variantId, orderLineId: m.orderLineId, sum: 0 };
      cur.sum += m.delta;
      out.set(key, cur);
    }
    return [...out.values()].map((r) => ({ variantId: r.variantId, orderLineId: r.orderLineId, _sum: { delta: { toString: () => String(r.sum) } } }));
  };
  return {
    $queryRaw: async () => [],
    orderLine: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        lines
          .filter((l) => where.id.in.includes(l.id))
          .map((l) => ({
            id: l.id,
            largeFormatMaterialId: "m-vatman",
            largeFormatLineData: l.data,
            productionStatus: l.productionStatus,
            order: { id: l.orderId, orderNumber: l.orderNumber },
          })),
      update: async ({ where, data }: { where: { id: string }; data: { largeFormatLineData: LargeFormatLineData } }) => {
        const l = lines.find((x) => x.id === where.id)!;
        l.data = data.largeFormatLineData;
        return {};
      },
    },
    largeFormatMaterial: {
      findMany: async () => [{ id: "m-vatman", materialForm: "sheet", sheetWidthCm: 61, sheetHeightCm: 86, sheetMarginMm: 5 }],
    },
    stockMovement: { groupBy },
    stockVariant: {
      findUniqueOrThrow: async () => ({
        stockQuantity: { toString: () => String(10 + movements.reduce((s, m) => s + m.delta, 0)) },
      }),
    },
  } as unknown as Prisma.TransactionClient;
}

function sale(l: Line, sheets: number) {
  movements.push({ variantId: "v-vatman", orderId: l.orderId, orderLineId: l.id, delta: -sheets, kind: "ORDER_SALE" });
}

/** Order #101: 55×70 + 1 × A3 (2 lines); order #102: 2 × A3. Per line 1 + 1 + 1 = 3 sheets. */
function seed() {
  movements.length = 0;
  lines = [
    { id: "l-big", orderId: "o1", orderNumber: 101, data: lineData(55, 70, 1), productionStatus: "PENDING" },
    { id: "l-a3x1", orderId: "o1", orderNumber: 101, data: lineData(29.7, 42, 1), productionStatus: "PENDING" },
    { id: "l-a3x2", orderId: "o2", orderNumber: 102, data: lineData(29.7, 42, 2), productionStatus: "PENDING" },
  ];
  for (const l of lines) sale(l, 1);
}

const ALL = ["l-big", "l-a3x1", "l-a3x2"];
const pool = (id: string): LfSheetPoolRecord => lines.find((l) => l.id === id)!.data.sheetPool!;

describe("planLfSheetPool", () => {
  it("splits by area, never above a line's own sheets; whole sheets sum to N", () => {
    const plan = planLfSheetPool(
      [
        { id: "big", ownSheets: 1, area: 55 * 70 },
        { id: "a", ownSheets: 1, area: 29.7 * 42 },
        { id: "b", ownSheets: 1, area: 2 * 29.7 * 42 },
      ],
      2,
    );
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.savedSheets).toBe(1);
    const by = new Map(plan.lines.map((l) => [l.id, l]));
    expect(by.get("big")!.shareSheets).toBe(1); // capped: alone it takes one sheet too
    expect(by.get("a")!.shareSheets).toBeCloseTo(1 / 3, 3);
    expect(by.get("b")!.shareSheets).toBeCloseTo(2 / 3, 3);
    expect(plan.lines.reduce((s, l) => s + l.stockSheets, 0)).toBe(2);
    expect(by.get("a")!.stockSheets).toBe(0);
    expect(by.get("b")!.stockSheets).toBe(1);
  });

  it("no saving → nothing to confirm", () => {
    expect(planLfSheetPool([{ id: "a", ownSheets: 1, area: 1 }, { id: "b", ownSheets: 1, area: 1 }], 2)).toEqual({
      ok: false,
      code: "no_saving",
    });
  });
});

describe("confirmSheetPoolInTx", () => {
  beforeEach(seed);

  it("55×70 + 3 × A3 pooled on 2 sheets: 1 sheet back to stock, cost split by area", async () => {
    const tiles = [
      { id: "l-big::1", label: "", widthCm: 55, heightCm: 70, allowRotate: true },
      { id: "l-a3x1::1", label: "", widthCm: 29.7, heightCm: 42, allowRotate: true },
      { id: "l-a3x2::1", label: "", widthCm: 29.7, heightCm: 42, allowRotate: true },
      { id: "l-a3x2::2", label: "", widthCm: 29.7, heightCm: 42, allowRotate: true },
    ];
    expect(packTilesOnSheets(tiles, A1).sheets).toHaveLength(2);

    const res = await confirmSheetPoolInTx(fakeTx(), { orderLineIds: ALL, poolSheets: 2, createdById: "u1" });
    expect(res).toMatchObject({ alreadyConfirmed: false, noSaving: false, naiveSheets: 3, returnedSheets: 1, orderNumbers: [101, 102] });
    expect(res.stockAfter).toBe(10 - 3 + 1);

    const back = movements.filter((m) => m.kind === "LAYOUT_POOL_RETURN");
    expect(back).toEqual([
      expect.objectContaining({ orderLineId: "l-a3x1", orderId: "o1", delta: 1, note: "Экономия раскладки: 2 листа вместо 3, заказы #101, #102" }),
    ]);

    // Material cost by area share: 1, 1/3, 2/3 of a sheet; sell price untouched.
    const big = lines.find((l) => l.id === "l-big")!.data;
    const a3x1 = lines.find((l) => l.id === "l-a3x1")!.data;
    const a3x2 = lines.find((l) => l.id === "l-a3x2")!.data;
    expect(big.materialCost).toBe(30);
    expect(a3x1.materialCost).toBe(10);
    expect(a3x2.materialCost).toBe(20);
    expect(a3x1.totalDirectCostMdl).toBe(12);
    expect(a3x1.estimatedProfit).toBe(100 - 12);
    expect(a3x1.totalSellPrice).toBe(100);
    expect(big.materialCost + a3x1.materialCost + a3x2.materialCost).toBe(2 * COST_PER_SHEET);
    expect(pool("l-a3x1")).toMatchObject({ poolSheets: 2, naiveSheets: 3, ownSheets: 1, stockSheets: 0, ownMaterialCostMdl: 30 });
    expect(pool("l-big").poolId).toBe(pool("l-a3x2").poolId);
    // Backlog / restore read the pooled share.
    expect(lfLineStockQuantityForMaterial(a3x2, A1)).toEqual({ quantity: 1, unit: "sheets" });
    expect(lfLineStockQuantityForMaterial(a3x1, A1)).toEqual({ quantity: 0, unit: "sheets" });
  });

  it("is idempotent: confirming the same lines again changes nothing; a mix is refused", async () => {
    await confirmSheetPoolInTx(fakeTx(), { orderLineIds: ALL, poolSheets: 2, createdById: null });
    const count = movements.length;
    const again = await confirmSheetPoolInTx(fakeTx(), { orderLineIds: ALL, poolSheets: 2, createdById: null });
    expect(again.alreadyConfirmed).toBe(true);
    expect(movements.length).toBe(count);

    lines.push({ id: "l-new", orderId: "o3", orderNumber: 103, data: lineData(29.7, 42, 1), productionStatus: "PENDING" });
    sale(lines.at(-1)!, 1);
    await expect(
      confirmSheetPoolInTx(fakeTx(), { orderLineIds: ["l-a3x2", "l-new"], poolSheets: 1, createdById: null }),
    ).rejects.toEqual(new SheetPoolError("line_already_confirmed"));
  });

  it("cancel / delete of an order after confirm returns only its share", async () => {
    await confirmSheetPoolInTx(fakeTx(), { orderLineIds: ALL, poolSheets: 2, createdById: null });
    await returnMaterialStockForOrder(fakeTx(), { orderId: "o1", orderNumber: 101, createdById: null });
    const returned = movements.filter((m) => m.kind === "ORDER_RETURN" && m.orderId === "o1");
    // Order #101 took 2 sheets, 1 came back on confirm: only the remaining 1 (the 55×70 line).
    expect(returned).toEqual([expect.objectContaining({ orderLineId: "l-big", delta: 1 })]);
    const net = movements.reduce((s, m) => s + m.delta, 0);
    expect(net).toBe(-1); // only order #102's share (1 sheet) stays written off
  });

  it("refuses fewer sheets than the pieces' area needs and lines waiting for a layout", async () => {
    lines.push({ id: "l-huge", orderId: "o3", orderNumber: 103, data: lineData(55, 80, 2), productionStatus: "PENDING" });
    await expect(
      confirmSheetPoolInTx(fakeTx(), { orderLineIds: ["l-huge", "l-big"], poolSheets: 1, createdById: null }),
    ).rejects.toEqual(new SheetPoolError("sheets_too_few"));
    lines[0]!.productionStatus = "NEEDS_LAYOUT";
    await expect(confirmSheetPoolInTx(fakeTx(), { orderLineIds: ALL, poolSheets: 2, createdById: null })).rejects.toEqual(
      new SheetPoolError("line_needs_layout"),
    );
  });

  it("a line waiting for procurement (holds nothing) gives nothing back", async () => {
    movements.splice(movements.findIndex((m) => m.orderLineId === "l-a3x1"), 1);
    const res = await confirmSheetPoolInTx(fakeTx(), { orderLineIds: ALL, poolSheets: 2, createdById: null });
    expect(res.returnedSheets).toBe(0);
    expect(movements.some((m) => m.kind === "LAYOUT_POOL_RETURN")).toBe(false);
  });
});
