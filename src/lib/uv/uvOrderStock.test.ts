import { beforeEach, describe, expect, it, vi } from "vitest";

const ledger = vi.hoisted(() => ({
  consume: vi.fn(),
  returnToStock: vi.fn(),
}));
const printers = vi.hoisted(() => ({
  consumePrinterInkBySlot: vi.fn(),
  returnPrinterConsumablesForOrder: vi.fn(),
}));

vi.mock("@/lib/stock/unified/ledger", () => ledger);
vi.mock("@/lib/stock/unified/printers", () => ({
  ...printers,
  PRINTER_CONSUMABLE_CATEGORY_CODES: ["ink", "toner"],
}));

import type { Prisma } from "@prisma/client";
import { deductUvLineStock, returnUvStockForOrder, uvInkParts } from "./uvOrderStock";
import { buildUvLineData } from "./buildUvLineData";
import { CATALOG, PEN } from "./uvTestFixtures";
import type { UvLineData } from "./types";

type Movement = { variantId: string; orderLineId: string | null; delta: number; kind: string };

type GroupByArgs = {
  by: ("variantId" | "orderLineId")[];
  where: { orderLineId?: { in: string[] }; variantId?: { in: string[] }; kind: { in: string[] } };
};

/** In-memory tx: `groupBy` sums the movements matching the filters the code uses. */
function fakeTx(movements: Movement[], uvLineIds: string[], knownVariants: string[] = [PEN.id]) {
  return {
    stockVariant: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; sku?: string } }) =>
        where.sku === "INK-UV-PRIMER"
          ? knownVariants.includes("primer")
            ? { id: "primer" }
            : null
          : knownVariants.includes(where.id ?? "")
            ? { id: where.id }
            : null,
      ),
    },
    orderLine: { findMany: vi.fn(async () => uvLineIds.map((id) => ({ id }))) },
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

function line(source: "stock" | "client", quantity = 5): UvLineData {
  return buildUvLineData(
    source === "stock"
      ? { source, variantId: PEN.id, quantity, zones: [{ id: "z", placement: "front", widthCm: 5, heightCm: 5, whiteLayers: 1, varnish: true, primer: false }] }
      : { source, clientItem: { description: "бутылка" }, quantity, zones: [{ id: "z", placement: "front", widthCm: 5, heightCm: 5, whiteLayers: 0, varnish: false, primer: false }] },
    "retail",
    { item: PEN, settings: CATALOG.settings, inkCosts: CATALOG.inkCosts },
  );
}

const params = { orderId: "o1", orderNumber: 7, createdById: "u1", orderLineId: "l1" };

beforeEach(() => {
  vi.clearAllMocks();
  ledger.consume.mockResolvedValue({ consumed: true, costMdl: 20.2 });
  printers.consumePrinterInkBySlot.mockResolvedValue({ lines: [], costMdl: null });
});

describe("deductUvLineStock", () => {
  it("takes the stock item and the ink split by head", async () => {
    const data = line("stock");
    const issues = await deductUvLineStock(fakeTx([], []), data, params);
    expect(issues).toEqual([]);
    expect(ledger.consume).toHaveBeenCalledWith(expect.anything(), {
      variantId: PEN.id,
      quantity: 5,
      orderId: "o1",
      orderNumber: 7,
      orderLineId: "l1",
      createdById: "u1",
    });
    expect(printers.consumePrinterInkBySlot).toHaveBeenCalledWith(expect.anything(), {
      printerCode: "uv",
      parts: uvInkParts(data.consumption),
      orderId: "o1",
      orderNumber: 7,
      orderLineId: "l1",
      createdById: "u1",
    });
    expect(uvInkParts(data.consumption).map((p) => p.labels)).toEqual([
      ["Cyan", "Magenta", "Yellow", "Black"],
      ["White"],
      ["Varnish"],
    ]);
  });

  it("reports a short item for procurement (nothing taken) and still takes ink", async () => {
    ledger.consume.mockResolvedValue({ consumed: false, variantId: PEN.id, requested: 5, available: 2 });
    const issues = await deductUvLineStock(fakeTx([], []), line("stock"), params);
    expect(issues).toEqual([
      { kind: "stock_variant", variantId: PEN.id, label: "Pix alb", requestedQty: 5, stockAtOrder: 2 },
    ]);
    expect(printers.consumePrinterInkBySlot).toHaveBeenCalledTimes(1);
  });

  it("a deleted variant goes to procurement without a ledger call", async () => {
    const issues = await deductUvLineStock(fakeTx([], [], []), line("stock"), params);
    expect(ledger.consume).not.toHaveBeenCalled();
    expect(issues[0]).toMatchObject({ kind: "stock_variant", requestedQty: 5, stockAtOrder: 0 });
  });

  it("primer is taken from its stock variant (may go below zero), only when the line uses it", async () => {
    const primed = buildUvLineData(
      { source: "client", clientItem: { description: "металл" }, quantity: 10, zones: [{ id: "z", placement: "front", widthCm: 10, heightCm: 10, whiteLayers: 1, varnish: false, primer: true }] },
      "retail",
      { item: null, settings: CATALOG.settings, inkCosts: CATALOG.inkCosts },
    );
    await deductUvLineStock(fakeTx([], [], ["primer"]), primed, params);
    // 0.01 m² × 10 ml × 10 pcs = 1 ml.
    expect(ledger.consume).toHaveBeenCalledWith(expect.anything(), {
      variantId: "primer",
      quantity: 1,
      allowNegative: true,
      orderId: "o1",
      orderNumber: 7,
      orderLineId: "l1",
      createdById: "u1",
    });
    vi.clearAllMocks();
    await deductUvLineStock(fakeTx([], [], ["primer"]), line("client"), params);
    expect(ledger.consume).not.toHaveBeenCalled();
  });

  it("client items take ink only", async () => {
    expect(await deductUvLineStock(fakeTx([], []), line("client"), params)).toEqual([]);
    expect(ledger.consume).not.toHaveBeenCalled();
    expect(printers.consumePrinterInkBySlot).toHaveBeenCalledTimes(1);
  });
});

describe("returnUvStockForOrder", () => {
  it("returns only what the UV lines still hold, netted by movements", async () => {
    const tx = fakeTx(
      [
        { variantId: PEN.id, orderLineId: "l1", delta: -5, kind: "ORDER_SALE" },
        { variantId: "nb", orderLineId: "l2", delta: -3, kind: "ORDER_SALE" },
        { variantId: "nb", orderLineId: "l2", delta: 3, kind: "ORDER_RETURN" },
        // A pen of another variant on a pen line of the same order is not ours.
        { variantId: "other-pen", orderLineId: "pen-line", delta: -4, kind: "ORDER_SALE" },
      ],
      ["l1", "l2"],
    );
    await returnUvStockForOrder(tx, params);
    expect(ledger.returnToStock).toHaveBeenCalledTimes(1);
    expect(ledger.returnToStock).toHaveBeenCalledWith(tx, {
      variantId: PEN.id,
      quantity: 5,
      orderId: "o1",
      orderNumber: 7,
      orderLineId: "l1",
      createdById: "u1",
    });
    expect(printers.returnPrinterConsumablesForOrder).toHaveBeenCalledWith(tx, params);
  });

  it("nets by order + variant: what the pen return path already gave back (no line) is not returned again", async () => {
    const tx = fakeTx(
      [
        { variantId: PEN.id, orderLineId: "l1", delta: -10, kind: "ORDER_SALE" },
        { variantId: PEN.id, orderLineId: null, delta: 10, kind: "ORDER_RETURN" },
      ],
      ["l1"],
    );
    await returnUvStockForOrder(tx, params);
    expect(ledger.returnToStock).not.toHaveBeenCalled();
  });

  it("a pen line and a UV line on the same variant come back together, once", async () => {
    const tx = fakeTx(
      [
        { variantId: PEN.id, orderLineId: "l1", delta: -10, kind: "ORDER_SALE" },
        { variantId: PEN.id, orderLineId: "pen-line", delta: -4, kind: "ORDER_SALE" },
      ],
      ["l1"],
    );
    await returnUvStockForOrder(tx, params);
    expect(ledger.returnToStock).toHaveBeenCalledTimes(1);
    expect(ledger.returnToStock.mock.calls[0]![1]).toMatchObject({ variantId: PEN.id, quantity: 14, orderLineId: "l1" });
  });

  it("returns nothing a second time (already netted to zero) and skips orders without UV lines", async () => {
    const tx = fakeTx(
      [
        { variantId: PEN.id, orderLineId: "l1", delta: -5, kind: "ORDER_SALE" },
        { variantId: PEN.id, orderLineId: "l1", delta: 5, kind: "ORDER_RETURN" },
      ],
      ["l1"],
    );
    await returnUvStockForOrder(tx, params);
    expect(ledger.returnToStock).not.toHaveBeenCalled();
    await returnUvStockForOrder(fakeTx([], []), params);
    expect(ledger.returnToStock).not.toHaveBeenCalled();
    expect(printers.returnPrinterConsumablesForOrder).toHaveBeenCalledTimes(2);
  });
});
