import { Prisma } from "@prisma/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  type MugStockTx,
  InsufficientMugStockError,
  recordMugStockReceipt,
  recordMugStockReturnOnOrderDelete,
  recordMugStockSale,
} from "./mugStockLedger";
import { MUG_STOCK_KIND } from "./mugStockKinds";

function mockTx(): {
  tx: MugStockTx;
  updates: { updateMany: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  creates: ReturnType<typeof vi.fn>;
  finds: ReturnType<typeof vi.fn>;
  findsOrThrow: ReturnType<typeof vi.fn>;
  receiptCreates: ReturnType<typeof vi.fn>;
} {
  const updateMany = vi.fn();
  const update = vi.fn();
  const findUnique = vi.fn();
  const findUniqueOrThrow = vi.fn();
  const create = vi.fn();
  const receiptCreate = vi.fn();

  const tx = {
    mugProduct: { updateMany, update, findUnique, findUniqueOrThrow },
    mugStockMovement: { create },
    mugStockReceipt: { create: receiptCreate },
  } as unknown as MugStockTx;

  return {
    tx,
    updates: { updateMany, update },
    creates: create,
    finds: findUnique,
    findsOrThrow: findUniqueOrThrow,
    receiptCreates: receiptCreate,
  };
}

describe("recordMugStockSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when mugProductId is null", async () => {
    const { tx, updates, creates } = mockTx();
    await recordMugStockSale(tx, {
      mugProductId: null,
      quantity: 5,
      orderId: "o1",
      orderNumber: 1,
      createdById: "u1",
    });
    expect(updates.updateMany).not.toHaveBeenCalled();
    expect(creates).not.toHaveBeenCalled();
  });

  it("no-ops when quantity is 0", async () => {
    const { tx, updates, creates } = mockTx();
    await recordMugStockSale(tx, {
      mugProductId: "mp1",
      quantity: 0,
      orderId: "o1",
      orderNumber: 1,
      createdById: null,
    });
    expect(updates.updateMany).not.toHaveBeenCalled();
    expect(creates).not.toHaveBeenCalled();
  });

  it("decrements stock and writes ORDER_SALE movement", async () => {
    const { tx, updates, creates, finds } = mockTx();
    updates.updateMany.mockResolvedValue({ count: 1 });
    finds.mockResolvedValue({
      avgPurchaseCost: new Prisma.Decimal("12.5"),
      purchaseCost: new Prisma.Decimal("10"),
    });

    await recordMugStockSale(tx, {
      mugProductId: "mp-a",
      quantity: 4,
      orderId: "ord-1",
      orderNumber: 38,
      createdById: "user-1",
    });

    expect(updates.updateMany).toHaveBeenCalledWith({
      where: { id: "mp-a", stockQuantity: { gte: 4 } },
      data: { stockQuantity: { decrement: 4 } },
    });
    expect(creates).toHaveBeenCalledWith({
      data: {
        mugProductId: "mp-a",
        delta: -4,
        kind: MUG_STOCK_KIND.ORDER_SALE,
        costMdl: new Prisma.Decimal("50.00"),
        orderId: "ord-1",
        orderNumber: 38,
        createdById: "user-1",
      },
    });
  });

  it("throws InsufficientMugStockError when updateMany affects 0 rows", async () => {
    const { tx, updates, creates, finds } = mockTx();
    updates.updateMany.mockResolvedValue({ count: 0 });
    finds.mockResolvedValue({ stockQuantity: 2 });

    await expect(
      recordMugStockSale(tx, {
        mugProductId: "mp-x",
        quantity: 10,
        orderId: "ord-x",
        orderNumber: 99,
        createdById: null,
      }),
    ).rejects.toMatchObject({
      name: "InsufficientMugStockError",
      mugProductId: "mp-x",
      requested: 10,
      available: 2,
    });
    expect(creates).not.toHaveBeenCalled();
  });

  it("exposes instanceof InsufficientMugStockError", async () => {
    const { tx, updates, finds } = mockTx();
    updates.updateMany.mockResolvedValue({ count: 0 });
    finds.mockResolvedValue({ stockQuantity: 0 });

    try {
      await recordMugStockSale(tx, {
        mugProductId: "m",
        quantity: 1,
        orderId: "o",
        orderNumber: 1,
        createdById: null,
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientMugStockError);
    }
  });
});

describe("recordMugStockReturnOnOrderDelete", () => {
  it("no-ops when mugProductId is null", async () => {
    const { tx, updates, creates } = mockTx();
    await recordMugStockReturnOnOrderDelete(tx, {
      mugProductId: null,
      quantity: 1,
      orderId: "o",
      orderNumber: 1,
      createdById: "u",
    });
    expect(updates.update).not.toHaveBeenCalled();
    expect(creates).not.toHaveBeenCalled();
  });

  it("increments stock and writes ORDER_STOCK_RETURN", async () => {
    const { tx, updates, creates } = mockTx();
    updates.update.mockResolvedValue({ avgPurchaseCost: null, purchaseCost: null });

    await recordMugStockReturnOnOrderDelete(tx, {
      mugProductId: "sku-1",
      quantity: 2,
      orderId: "del-1",
      orderNumber: 40,
      createdById: "adm",
    });

    expect(updates.update).toHaveBeenCalledWith({
      where: { id: "sku-1" },
      data: { stockQuantity: { increment: 2 } },
      select: { avgPurchaseCost: true, purchaseCost: true },
    });
    expect(creates).toHaveBeenCalledWith({
      data: {
        mugProductId: "sku-1",
        delta: 2,
        kind: MUG_STOCK_KIND.ORDER_STOCK_RETURN,
        costMdl: null,
        orderId: "del-1",
        orderNumber: 40,
        createdById: "adm",
      },
    });
  });
});

describe("recordMugStockReceipt", () => {
  it("no-ops when quantity <= 0", async () => {
    const { tx, updates, creates, receiptCreates } = mockTx();
    await recordMugStockReceipt(tx, {
      mugProductId: "n",
      quantity: 0,
      totalCostMdl: 0,
      purchasedAt: new Date(),
      createdById: "u",
    });
    expect(updates.update).not.toHaveBeenCalled();
    expect(creates).not.toHaveBeenCalled();
    expect(receiptCreates).not.toHaveBeenCalled();
  });

  it("stores the receipt, blends the weighted average and writes RECEIPT", async () => {
    const { tx, updates, creates, findsOrThrow, receiptCreates } = mockTx();
    findsOrThrow.mockResolvedValue({
      stockQuantity: 50,
      avgPurchaseCost: new Prisma.Decimal("20"),
      purchaseCost: new Prisma.Decimal("15"),
    });

    await recordMugStockReceipt(tx, {
      mugProductId: "p1",
      quantity: 50,
      totalCostMdl: 1500,
      purchasedAt: new Date("2026-10-20T08:00:00Z"),
      supplier: " Supplier SRL ",
      note: "invoice 42",
      createdById: "w1",
    });

    expect(receiptCreates).toHaveBeenCalledWith({
      data: {
        purchaseInvoiceLineId: null,
        isProvisional: false,
        mugProductId: "p1",
        quantity: 50,
        totalCostMdl: new Prisma.Decimal("1500.00"),
        purchasedAt: new Date("2026-10-20T12:00:00Z"),
        supplier: "Supplier SRL",
        note: "invoice 42",
        createdById: "w1",
      },
    });
    // (50 × 20 + 1500) / 100 = 25
    expect(updates.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: {
        stockQuantity: { increment: 50 },
        avgPurchaseCost: new Prisma.Decimal("25.0000"),
      },
    });
    expect(creates).toHaveBeenCalledWith({
      data: {
        mugProductId: "p1",
        delta: 50,
        kind: MUG_STOCK_KIND.RECEIPT,
        costMdl: new Prisma.Decimal("1500.00"),
        note: "invoice 42",
        createdById: "w1",
      },
    });
  });
});
