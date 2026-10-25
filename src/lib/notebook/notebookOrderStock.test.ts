import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import {
  consumeNotebookLineStock,
  notebookStockHeldByOrder,
  returnNotebookStockForOrder,
} from "./notebookOrderStock";

type Movement = {
  variantId: string;
  delta: number;
  kind: string;
  orderId: string | null;
  orderLineId: string | null;
};

/**
 * In-memory stand-in for the parts of the Prisma client the unified ledger and
 * the notebook helpers touch. Every variant here is a notebook.
 */
function fakeTx(stock: Record<string, number>, movements: Movement[] = []) {
  const variants = new Map<string, number>(Object.entries(stock));
  const lines = [{ id: "line-1", orderId: "order-1", productType: "notebook", stockVariantId: "v1", sortOrder: 0 }];
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
  sku: "S3-KBL-A5",
  nameRo: "Caiet roșu",
  nameRu: "Блокнот красный",
  nameEn: "Red notebook",
  imageUrl: null,
  coverColorHex: "#b63935",
  strapColorHex: "#9e211b",
  bookmarkColorHex: "#b63a35",
};

describe("consumeNotebookLineStock", () => {
  it("takes the notebooks with an ORDER_SALE movement tied to the line", async () => {
    const { tx, variants, movements } = fakeTx({ v1: 10 });
    const issue = await consumeNotebookLineStock(tx, {
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
    const issue = await consumeNotebookLineStock(tx, {
      ...ORDER,
      variantId: "v1",
      quantity: 5,
      orderLineId: "line-1",
      snapshot: SNAPSHOT,
    });
    expect(issue).toEqual({
      kind: "stock_variant",
      variantId: "v1",
      label: "Блокнот красный (S3-KBL-A5)",
      requestedQty: 5,
      stockAtOrder: 3,
    });
    expect(variants.get("v1")).toBe(3);
    expect(movements).toEqual([]);
  });
});

describe("returnNotebookStockForOrder", () => {
  it("returns what the order holds once, netting legacy sales without a line id", async () => {
    // A sale copied from the legacy notebook ledger (no orderLineId) plus a new one.
    const { tx, variants, movements } = fakeTx({ v1: 20 }, [
      { variantId: "v1", delta: -5, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: null },
      { variantId: "v1", delta: -2, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: "line-1" },
      { variantId: "v1", delta: 50, kind: StockMovementKind.Receipt, orderId: null, orderLineId: null },
    ]);
    await returnNotebookStockForOrder(tx, ORDER);
    expect(variants.get("v1")).toBe(27);
    expect(movements.at(-1)).toEqual({
      variantId: "v1",
      delta: 7,
      kind: StockMovementKind.OrderReturn,
      orderId: "order-1",
      orderLineId: "line-1",
    });

    // Second delete / edit pass: nothing left to return.
    await returnNotebookStockForOrder(tx, ORDER);
    expect(variants.get("v1")).toBe(27);
    expect((await notebookStockHeldByOrder(tx, "order-1")).size).toBe(0);
  });

  it("returns nothing for an order that was already returned in the legacy ledger", async () => {
    const { tx, variants } = fakeTx({ v1: 10 }, [
      { variantId: "v1", delta: -3, kind: StockMovementKind.OrderSale, orderId: "order-1", orderLineId: null },
      { variantId: "v1", delta: 3, kind: StockMovementKind.OrderReturn, orderId: "order-1", orderLineId: null },
    ]);
    await returnNotebookStockForOrder(tx, ORDER);
    expect(variants.get("v1")).toBe(10);
  });

  it("delete → restore → delete keeps the balance consistent", async () => {
    const { tx, variants } = fakeTx({ v1: 10 });
    await consumeNotebookLineStock(tx, { ...ORDER, variantId: "v1", quantity: 4, orderLineId: "line-1", snapshot: SNAPSHOT });
    await returnNotebookStockForOrder(tx, ORDER); // delete
    expect(variants.get("v1")).toBe(10);
    await returnNotebookStockForOrder(tx, ORDER); // restore pre-settle: nothing held
    await consumeNotebookLineStock(tx, { ...ORDER, variantId: "v1", quantity: 4, orderLineId: "line-1", snapshot: SNAPSHOT });
    expect(variants.get("v1")).toBe(6);
    await returnNotebookStockForOrder(tx, ORDER); // delete again
    expect(variants.get("v1")).toBe(10);
  });
});
