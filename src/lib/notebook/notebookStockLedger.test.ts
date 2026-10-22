import { Prisma } from "@prisma/client";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  type NotebookStockTx,
  InsufficientNotebookStockError,
  recordNotebookStockReceipt,
  recordNotebookStockReturnOnOrderDelete,
  recordNotebookStockSale,
} from "./notebookStockLedger";
import { NOTEBOOK_STOCK_KIND } from "./notebookStockKinds";

function mockTx(): {
  tx: NotebookStockTx;
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
    notebookProduct: { updateMany, update, findUnique, findUniqueOrThrow },
    notebookStockMovement: { create },
    notebookStockReceipt: { create: receiptCreate },
  } as unknown as NotebookStockTx;

  return {
    tx,
    updates: { updateMany, update },
    creates: create,
    finds: findUnique,
    findsOrThrow: findUniqueOrThrow,
    receiptCreates: receiptCreate,
  };
}

describe("recordNotebookStockSale", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no-ops when notebookProductId is null", async () => {
    const { tx, updates, creates } = mockTx();
    await recordNotebookStockSale(tx, {
      notebookProductId: null,
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
    await recordNotebookStockSale(tx, {
      notebookProductId: "np1",
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

    await recordNotebookStockSale(tx, {
      notebookProductId: "np-a",
      quantity: 4,
      orderId: "ord-1",
      orderNumber: 38,
      createdById: "user-1",
    });

    expect(updates.updateMany).toHaveBeenCalledWith({
      where: { id: "np-a", stockQuantity: { gte: 4 } },
      data: { stockQuantity: { decrement: 4 } },
    });
    expect(creates).toHaveBeenCalledWith({
      data: {
        notebookProductId: "np-a",
        delta: -4,
        kind: NOTEBOOK_STOCK_KIND.ORDER_SALE,
        costMdl: new Prisma.Decimal("50.00"),
        orderId: "ord-1",
        orderNumber: 38,
        createdById: "user-1",
      },
    });
  });

  it("throws InsufficientNotebookStockError when updateMany affects 0 rows", async () => {
    const { tx, updates, creates, finds } = mockTx();
    updates.updateMany.mockResolvedValue({ count: 0 });
    finds.mockResolvedValue({ stockQuantity: 2 });

    await expect(
      recordNotebookStockSale(tx, {
        notebookProductId: "np-x",
        quantity: 10,
        orderId: "ord-x",
        orderNumber: 99,
        createdById: null,
      }),
    ).rejects.toMatchObject({
      name: "InsufficientNotebookStockError",
      notebookProductId: "np-x",
      requested: 10,
      available: 2,
    });
    expect(creates).not.toHaveBeenCalled();
  });

  it("exposes instanceof InsufficientNotebookStockError", async () => {
    const { tx, updates, finds } = mockTx();
    updates.updateMany.mockResolvedValue({ count: 0 });
    finds.mockResolvedValue({ stockQuantity: 0 });

    try {
      await recordNotebookStockSale(tx, {
        notebookProductId: "n",
        quantity: 1,
        orderId: "o",
        orderNumber: 1,
        createdById: null,
      });
      expect.fail("expected throw");
    } catch (e) {
      expect(e).toBeInstanceOf(InsufficientNotebookStockError);
    }
  });
});

describe("recordNotebookStockReturnOnOrderDelete", () => {
  it("no-ops when notebookProductId is null", async () => {
    const { tx, updates, creates } = mockTx();
    await recordNotebookStockReturnOnOrderDelete(tx, {
      notebookProductId: null,
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

    await recordNotebookStockReturnOnOrderDelete(tx, {
      notebookProductId: "sku-1",
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
        notebookProductId: "sku-1",
        delta: 2,
        kind: NOTEBOOK_STOCK_KIND.ORDER_STOCK_RETURN,
        costMdl: null,
        orderId: "del-1",
        orderNumber: 40,
        createdById: "adm",
      },
    });
  });
});

describe("recordNotebookStockReceipt", () => {
  it("no-ops when quantity <= 0", async () => {
    const { tx, updates, creates, receiptCreates } = mockTx();
    await recordNotebookStockReceipt(tx, {
      notebookProductId: "n",
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

    await recordNotebookStockReceipt(tx, {
      notebookProductId: "p1",
      quantity: 50,
      totalCostMdl: 1500,
      purchasedAt: new Date("2026-10-20T08:00:00Z"),
      supplier: " Supplier SRL ",
      note: "invoice 42",
      createdById: "w1",
    });

    expect(receiptCreates).toHaveBeenCalledWith({
      data: {
        notebookProductId: "p1",
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
        notebookProductId: "p1",
        delta: 50,
        kind: NOTEBOOK_STOCK_KIND.RECEIPT,
        costMdl: new Prisma.Decimal("1500.00"),
        note: "invoice 42",
        createdById: "w1",
      },
    });
  });
});
