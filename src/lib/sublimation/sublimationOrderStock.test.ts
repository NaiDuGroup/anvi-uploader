import { beforeEach, describe, expect, it, vi } from "vitest";

const ledger = vi.hoisted(() => ({ consume: vi.fn(), returnToStock: vi.fn() }));
const printers = vi.hoisted(() => ({
  consumePrinterUse: vi.fn(),
  consumePrinterInkBySlot: vi.fn(),
  returnPrinterConsumablesForOrder: vi.fn(),
}));
const settings = vi.hoisted(() => ({ current: { wastePct: 0, norms: {} } as unknown }));

vi.mock("@/lib/stock/unified/ledger", () => ledger);
vi.mock("@/lib/stock/unified/printers", () => ({
  ...printers,
  PRINTER_CONSUMABLE_CATEGORY_CODES: ["ink", "sublimation_paper", "thermal_tape"],
}));
vi.mock("@/lib/sublimation/resolveSublimationLine", () => ({
  loadSublimationSettings: vi.fn(async () => settings.current),
}));

import type { Prisma } from "@prisma/client";
import { buildSublimationLineData } from "./buildSublimationLineData";
import {
  consumeMugPrintStock,
  deductSublimationLineStock,
  returnSublimationStockForOrder,
  sublimationPrinterUses,
} from "./sublimationOrderStock";
import { COSTS, KEYCHAIN, PILLOW, SETTINGS } from "./sublimationTestFixtures";

type Movement = { variantId: string; orderLineId: string | null; delta: number; kind: string };
type GroupByArgs = {
  by: ("variantId" | "orderLineId")[];
  where: { orderLineId?: { in: string[] }; variantId?: { in: string[] }; kind: { in: string[] } };
};

/** In-memory tx: `groupBy` sums the movements matching the filters the code uses. */
function fakeTx(movements: Movement[], lineIds: string[], knownVariants: string[] = [PILLOW.id, KEYCHAIN.id]) {
  return {
    stockVariant: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        knownVariants.includes(where.id) ? { id: where.id } : null,
      ),
    },
    orderLine: { findMany: vi.fn(async () => lineIds.map((id) => ({ id }))) },
    stockMovement: {
      groupBy: vi.fn(async ({ by, where }: GroupByArgs) => {
        const sums = new Map<string, Record<string, unknown> & { delta: number }>();
        for (const m of movements) {
          if (where.orderLineId && !where.orderLineId.in.includes(m.orderLineId ?? "")) continue;
          if (where.variantId && !where.variantId.in.includes(m.variantId)) continue;
          if (!where.kind.in.includes(m.kind)) continue;
          const key = by.map((k) => String(m[k])).join("|");
          const row = sums.get(key) ?? { ...Object.fromEntries(by.map((k) => [k, m[k]])), delta: 0 };
          row.delta += m.delta;
          sums.set(key, row);
        }
        return [...sums.values()].map((r) => ({ ...r, _sum: { delta: { toString: () => String(r.delta) } } }));
      }),
    },
  } as unknown as Prisma.TransactionClient;
}

const pillowLine = (quantity = 2, s = SETTINGS) =>
  buildSublimationLineData({ variantId: PILLOW.id, quantity }, "retail", { item: PILLOW, settings: s, consumableCosts: COSTS });

const params = { orderId: "o1", orderNumber: 7, createdById: "u1", orderLineId: "l1" };

beforeEach(() => {
  vi.clearAllMocks();
  ledger.consume.mockResolvedValue({ consumed: true, costMdl: 180 });
  printers.consumePrinterUse.mockResolvedValue({ lines: [], costMdl: null });
  settings.current = { wastePct: 0, norms: {} };
});

describe("deductSublimationLineStock", () => {
  it("takes the blank and the Epson paper, tape and ink (ink split by share over the ink slots)", async () => {
    const issues = await deductSublimationLineStock(fakeTx([], []), pillowLine(), params);
    expect(issues).toEqual([]);
    expect(ledger.consume).toHaveBeenCalledWith(expect.anything(), {
      variantId: PILLOW.id,
      quantity: 2,
      orderId: "o1",
      orderNumber: 7,
      orderLineId: "l1",
      createdById: "u1",
    });
    expect(printers.consumePrinterUse.mock.calls.map((c) => c[1])).toEqual([
      { printerCode: "subl", role: "paper", amount: 3, ...params },
      { printerCode: "subl", role: "tape", amount: 1.76, ...params },
      { printerCode: "subl", role: "ink", amount: 4.4, ...params },
    ]);
  });

  it("a short blank is listed for procurement; consumables are still taken", async () => {
    ledger.consume.mockResolvedValue({ consumed: false, variantId: PILLOW.id, requested: 2, available: 1 });
    const issues = await deductSublimationLineStock(fakeTx([], []), pillowLine(), params);
    expect(issues).toEqual([
      { kind: "stock_variant", variantId: PILLOW.id, label: "Pernă / Сатин", requestedQty: 2, stockAtOrder: 1 },
    ]);
    expect(printers.consumePrinterUse).toHaveBeenCalledTimes(3);
  });

  it("a client's item takes no blank, only the Epson paper, tape and ink", async () => {
    const line = buildSublimationLineData(
      { source: "client", clientItem: { description: "футболка", widthCm: 20, heightCm: 30 }, quantity: 3 },
      "retail",
      { item: null, settings: SETTINGS, consumableCosts: COSTS },
    );
    const tx = fakeTx([], []);
    const issues = await deductSublimationLineStock(tx, line, params);
    expect(issues).toEqual([]);
    expect(ledger.consume).not.toHaveBeenCalled();
    expect(tx.stockVariant.findUnique).not.toHaveBeenCalled();
    expect(printers.consumePrinterUse.mock.calls.map((c) => [c[1].role, c[1].amount])).toEqual([
      ["paper", 4],
      ["tape", 1.32],
      ["ink", 3.96],
    ]);
  });

  it("zero norms → no printer write-off", async () => {
    await deductSublimationLineStock(fakeTx([], []), pillowLine(2, { ...SETTINGS, wastePct: 10, norms: {} }), params);
    expect(printers.consumePrinterUse).not.toHaveBeenCalled();
    expect(sublimationPrinterUses({ paperSheets: 0, tapeM: 0, inkMl: 0 })).toEqual([]);
  });
});

describe("consumeMugPrintStock (the «Кружка» product)", () => {
  it("writes off Epson consumables by the mugs norm × quantity × (1 + waste)", async () => {
    settings.current = SETTINGS;
    const c = await consumeMugPrintStock(fakeTx([], []), { ...params, quantity: 5 });
    expect(c).toEqual({ paperSheets: 6, tapeM: 1.65, inkMl: 5.5 });
    expect(printers.consumePrinterUse.mock.calls.map((x) => [x[1].role, x[1].amount, x[1].orderLineId])).toEqual([
      ["paper", 6, "l1"],
      ["tape", 1.65, "l1"],
      ["ink", 5.5, "l1"],
    ]);
  });

  it("nothing while the mugs norm is not set", async () => {
    await consumeMugPrintStock(fakeTx([], []), { ...params, quantity: 5 });
    expect(printers.consumePrinterUse).not.toHaveBeenCalled();
  });
});

describe("returnSublimationStockForOrder", () => {
  it("returns what the order still holds of its blanks once, and settles printer consumables", async () => {
    const tx = fakeTx(
      [
        { variantId: PILLOW.id, orderLineId: "l1", delta: -2, kind: "ORDER_SALE" },
        { variantId: KEYCHAIN.id, orderLineId: "l2", delta: -12, kind: "ORDER_SALE" },
        { variantId: KEYCHAIN.id, orderLineId: "l2", delta: 12, kind: "ORDER_RETURN" },
      ],
      ["l1", "l2"],
    );
    await returnSublimationStockForOrder(tx, params);
    expect(ledger.returnToStock).toHaveBeenCalledTimes(1);
    expect(ledger.returnToStock).toHaveBeenCalledWith(expect.anything(), {
      variantId: PILLOW.id,
      quantity: 2,
      orderId: "o1",
      orderNumber: 7,
      orderLineId: "l1",
      createdById: "u1",
    });
    expect(printers.returnPrinterConsumablesForOrder).toHaveBeenCalledWith(expect.anything(), params);
  });

  it("nothing to return for an order without sublimation lines", async () => {
    await returnSublimationStockForOrder(fakeTx([], []), params);
    expect(ledger.returnToStock).not.toHaveBeenCalled();
  });
});
