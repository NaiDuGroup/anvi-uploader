import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import {
  allocateMugVariantProcurementBacklog,
  consumeMugLineStock,
  mugStockHeldByOrder,
  returnMugStockForOrder,
} from "./mugOrderStock";

type Movement = {
  variantId: string;
  delta: number;
  kind: string;
  orderId: string | null;
  orderLineId: string | null;
};

/**
 * In-memory stand-in for the parts of the Prisma client the unified ledger and
 * the mug helpers touch. Every variant here is a mug.
 */
function fakeTx(stock: Record<string, number>, movements: Movement[] = []) {
  const variants = new Map<string, number>(Object.entries(stock));
  const lines = [{ id: "line-1", orderId: "order-1", productType: "mug", stockVariantId: "v1", sortOrder: 0 }];
  const dec = (n: number) => new Prisma.Decimal(n);
  const qty = (d: Prisma.Decimal | number) => Number(d.toString());

  const tx = {
    stockVariant: {
      updateMany: async ({
        where,
        data,
      }: {
        where: { id: string; stockQuantity?: { gte: Prisma.Decimal } };
        data: { stockQuantity: { decrement: Prisma.Decimal } };
      }) => {
        const cur: number | undefined = variants.get(where.id);
        if (cur == null) return { count: 0 };
        if (where.stockQuantity && cur < qty(where.stockQuantity.gte)) return { count: 0 };
        variants.set(where.id, cur - qty(data.stockQuantity.decrement));
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: { stockQuantity: { increment: Prisma.Decimal } } }) => {
        variants.set(where.id, (variants.get(where.id) ?? 0) + qty(data.stockQuantity.increment));
        return {};
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => ({
        stockQuantity: dec(variants.get(where.id) ?? 0),
        avgCost: dec(4),
        purchaseCost: null,
      }),
    },
    stockMovement: {
      create: async ({ data }: { data: Movement & { delta: Prisma.Decimal } }) => {
        movements.push({
          variantId: data.variantId,
          delta: qty(data.delta),
          kind: data.kind,
          orderId: data.orderId ?? null,
          orderLineId: data.orderLineId ?? null,
        });
        return {};
      },
      groupBy: async ({ where }: { where: { orderId: string; kind: { in: string[] } } }) => {
        const sums = new Map<string, number>();
        for (const m of movements) {
          if (m.orderId !== where.orderId || !where.kind.in.includes(m.kind)) continue;
          sums.set(m.variantId, (sums.get(m.variantId) ?? 0) + m.delta);
        }
        return [...sums].map(([variantId, sum]) => ({ variantId, _sum: { delta: dec(sum) } }));
      },
    },
    orderLine: {
      findMany: async ({ where }: { where: { orderId: string } }) =>
        lines.filter((l) => l.orderId === where.orderId).map((l) => ({ id: l.id, stockVariantId: l.stockVariantId })),
    },
  } as unknown as Prisma.TransactionClient;

  return { tx, variants, movements };
}

const ORDER = { orderId: "order-1", orderNumber: 101, createdById: null };
const SNAPSHOT = {
  id: "1b492f4c-1cf9-4c6a-b8ad-7b56f6b10c74",
  sku: "MUG-WHITE-330",
  nameRo: "Cană albă",
  nameRu: "Кружка белая",
  nameEn: "White mug",
  imageUrl: null,
  bodyColorHex: "#ffffff",
  handleColorHex: "#ffffff",
  innerColorHex: null,
  rimColorHex: null,
};

describe("consumeMugLineStock", () => {
  it("takes the mugs with an ORDER_SALE movement tied to the line", async () => {
    const { tx, variants, movements } = fakeTx({ v1: 10 });
    const issue = await consumeMugLineStock(tx, {
      ...ORDER,
      variantId: "v1",
      quantity: 4,
      orderLineId: "line-1",
      snapshot: SNAPSHOT,
    });
    expect(issue).toBeNull();
    expect(variants.get("v1")).toBe(6);
    expect(movements).toEqual([
      { variantId: "v1", delta: -4, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: "line-1" },
    ]);
  });

  it("never goes negative: a short line becomes a stock_variant procurement entry", async () => {
    const { tx, variants, movements } = fakeTx({ v1: 3 });
    const issue = await consumeMugLineStock(tx, {
      ...ORDER,
      variantId: "v1",
      quantity: 5,
      orderLineId: "line-1",
      snapshot: SNAPSHOT,
    });
    expect(issue).toEqual({
      kind: "stock_variant",
      variantId: "v1",
      label: "Кружка белая (MUG-WHITE-330)",
      requestedQty: 5,
      stockAtOrder: 3,
    });
    expect(variants.get("v1")).toBe(3);
    expect(movements).toEqual([]);
  });
});

describe("returnMugStockForOrder", () => {
  it("returns what the order holds once, netting legacy sales without a line id", async () => {
    // A sale copied from the legacy mug ledger (no orderLineId) plus a new one.
    const { tx, variants, movements } = fakeTx({ v1: 20 }, [
      { variantId: "v1", delta: -5, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: null },
      { variantId: "v1", delta: -2, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: "line-1" },
      { variantId: "v1", delta: 50, kind: StockMovementKind.Receipt, orderId: null, orderLineId: null },
    ]);
    await returnMugStockForOrder(tx, ORDER);
    expect(variants.get("v1")).toBe(27);
    expect(movements.at(-1)).toEqual({
      variantId: "v1",
      delta: 7,
      kind: StockMovementKind.OrderReturn,
      orderId: "order-1",
      orderLineId: "line-1",
    });

    // Second delete / edit pass: nothing left to return.
    await returnMugStockForOrder(tx, ORDER);
    expect(variants.get("v1")).toBe(27);
    expect((await mugStockHeldByOrder(tx, "order-1")).size).toBe(0);
  });

  it("returns nothing for an order that was already returned in the legacy ledger", async () => {
    const { tx, variants } = fakeTx({ v1: 10 }, [
      { variantId: "v1", delta: -3, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: null },
      { variantId: "v1", delta: 3, kind: StockMovementKind.OrderReturn, orderId: "order-1", orderLineId: null },
    ]);
    await returnMugStockForOrder(tx, ORDER);
    expect(variants.get("v1")).toBe(10);
  });

  it("delete → restore → delete keeps the balance consistent", async () => {
    const { tx, variants } = fakeTx({ v1: 10 });
    await consumeMugLineStock(tx, { ...ORDER, variantId: "v1", quantity: 4, orderLineId: "line-1", snapshot: SNAPSHOT });
    await returnMugStockForOrder(tx, ORDER); // delete
    expect(variants.get("v1")).toBe(10);
    await returnMugStockForOrder(tx, ORDER); // restore pre-settle: nothing held
    await consumeMugLineStock(tx, { ...ORDER, variantId: "v1", quantity: 4, orderLineId: "line-1", snapshot: SNAPSHOT });
    expect(variants.get("v1")).toBe(6);
    await returnMugStockForOrder(tx, ORDER); // delete again
    expect(variants.get("v1")).toBe(10);
  });
});

type FakeOrder = {
  id: string;
  orderNumber: number;
  createdAt: Date;
  needsProcurement: boolean;
  procurementMeta: unknown;
  /** Defaults to an order still in production. */
  status?: string;
  lines: { id: string; stockVariantId: string; copies: number[] }[];
};

/** Orders waiting for mugs + the legacy-id map, on top of the in-memory ledger. */
function fakeBacklogTx(stock: Record<string, number>, orders: FakeOrder[], legacy: Record<string, string>) {
  const base = fakeTx(stock);
  const tx = base.tx as unknown as Record<string, unknown>;
  tx.order = {
    findMany: async ({
      where,
    }: {
      where: { status?: { notIn: string[] }; orderLines: { some: { stockVariantId: string } } };
    }) =>
      orders
        .filter(
          (o) =>
            o.needsProcurement &&
            !(where.status?.notIn ?? []).includes(o.status ?? "SENT_TO_WORKSHOP") &&
            o.lines.some((l) => l.stockVariantId === where.orderLines.some.stockVariantId),
        )
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((o) => ({
          ...o,
          orderLines: o.lines
            .filter((l) => l.stockVariantId === where.orderLines.some.stockVariantId)
            .map((l) => ({ id: l.id, files: l.copies.map((copies) => ({ copies })) })),
        })),
    update: async ({ where, data }: { where: { id: string }; data: { needsProcurement: boolean; procurementMeta: unknown } }) => {
      const o = orders.find((x) => x.id === where.id)!;
      o.needsProcurement = data.needsProcurement;
      o.procurementMeta = data.needsProcurement ? data.procurementMeta : null;
      return {};
    },
  };
  tx.stockItem = {
    findMany: async ({ where }: { where: { legacyKind: string; legacyId: { in: string[] } } }) =>
      where.legacyKind !== "mug"
        ? []
        : where.legacyId.in
            .filter((id) => legacy[id])
            .map((id) => ({ legacyId: id, variants: [{ id: legacy[id]! }] })),
  };
  return { ...base, orders };
}

describe("allocateMugVariantProcurementBacklog", () => {
  it("fills an order that waited with a legacy `mug` entry once mugs are received", async () => {
    const waiting: FakeOrder = {
      id: "order-1",
      orderNumber: 101,
      createdAt: new Date("2026-10-01"),
      needsProcurement: true,
      procurementMeta: [
        { kind: "mug", productId: "old-mug", sku: "MUG-WHITE-330", requestedQty: 3, stockAtOrder: 0 },
        { kind: "lf_roll", materialId: "m1", requestedLinearMeters: 2, stockAtOrder: 0 },
      ],
      lines: [{ id: "line-1", stockVariantId: "v1", copies: [2, 1] }],
    };
    const { tx, variants, movements, orders } = fakeBacklogTx({ v1: 5 }, [waiting], { "old-mug": "v1" });

    await allocateMugVariantProcurementBacklog(tx, { variantId: "v1", createdById: null });

    expect(variants.get("v1")).toBe(2);
    expect(movements).toEqual([
      { variantId: "v1", delta: -3, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: "line-1" },
    ]);
    // The mug entry is gone; the order still waits for the roll.
    expect(orders[0]!.needsProcurement).toBe(true);
    expect(orders[0]!.procurementMeta).toEqual({
      kind: "lf_roll",
      materialId: "m1",
      requestedLinearMeters: 2,
      stockAtOrder: 0,
    });
  });

  it("clears the flag, and stops at the first order it still cannot cover (FIFO)", async () => {
    const mk = (id: string, day: string, copies: number[]): FakeOrder => ({
      id,
      orderNumber: 1,
      createdAt: new Date(day),
      needsProcurement: true,
      procurementMeta: { kind: "stock_variant", variantId: "v1", label: "Кружка", requestedQty: 1, stockAtOrder: 0 },
      lines: [{ id: `${id}-line`, stockVariantId: "v1", copies }],
    });
    const { tx, variants, orders } = fakeBacklogTx(
      { v1: 4 },
      [mk("a", "2026-10-01", [2]), mk("b", "2026-10-02", [5]), mk("c", "2026-10-03", [1])],
      {},
    );

    await allocateMugVariantProcurementBacklog(tx, { variantId: "v1", createdById: null });

    expect(variants.get("v1")).toBe(2);
    expect(orders.map((o) => o.needsProcurement)).toEqual([false, true, true]);
    expect(orders[0]!.procurementMeta).toBeNull();
  });

  it("never fills orders already delivered or back in the studio", async () => {
    const mk = (id: string, status: string): FakeOrder => ({
      id,
      orderNumber: 1,
      createdAt: new Date("2026-10-01"),
      needsProcurement: true,
      status,
      procurementMeta: { kind: "stock_variant", variantId: "v1", label: "Кружка", requestedQty: 1, stockAtOrder: 0 },
      lines: [{ id: `${id}-line`, stockVariantId: "v1", copies: [1] }],
    });
    const { tx, variants, movements, orders } = fakeBacklogTx(
      { v1: 10 },
      [mk("delivered", "DELIVERED"), mk("returned", "RETURNED_TO_STUDIO"), mk("workshop", "SENT_TO_WORKSHOP")],
      {},
    );

    await allocateMugVariantProcurementBacklog(tx, { variantId: "v1", createdById: null });

    expect(variants.get("v1")).toBe(9);
    expect(movements.map((m) => m.orderId)).toEqual(["workshop"]);
    expect(orders.map((o) => o.needsProcurement)).toEqual([true, true, false]);
  });
});
