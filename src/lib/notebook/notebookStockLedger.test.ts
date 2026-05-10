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
} {
  const updateMany = vi.fn();
  const update = vi.fn();
  const findUnique = vi.fn();
  const create = vi.fn();

  const tx = {
    notebookProduct: { updateMany, update, findUnique },
    notebookStockMovement: { create },
  } as unknown as NotebookStockTx;

  return { tx, updates: { updateMany, update }, creates: create, finds: findUnique };
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
    expect(finds).not.toHaveBeenCalled();
    expect(creates).toHaveBeenCalledWith({
      data: {
        notebookProductId: "np-a",
        delta: -4,
        kind: NOTEBOOK_STOCK_KIND.ORDER_SALE,
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
    updates.update.mockResolvedValue({ id: "sku-1" });

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
    });
    expect(creates).toHaveBeenCalledWith({
      data: {
        notebookProductId: "sku-1",
        delta: 2,
        kind: NOTEBOOK_STOCK_KIND.ORDER_STOCK_RETURN,
        orderId: "del-1",
        orderNumber: 40,
        createdById: "adm",
      },
    });
  });
});

describe("recordNotebookStockReceipt", () => {
  it("no-ops when quantity <= 0", async () => {
    const { tx, updates, creates } = mockTx();
    await recordNotebookStockReceipt(tx, {
      notebookProductId: "n",
      quantity: 0,
      createdById: "u",
    });
    expect(updates.update).not.toHaveBeenCalled();
    expect(creates).not.toHaveBeenCalled();
  });

  it("increments stock and writes RECEIPT with note", async () => {
    const { tx, updates, creates } = mockTx();
    updates.update.mockResolvedValue({ id: "sku-1" });

    await recordNotebookStockReceipt(tx, {
      notebookProductId: "p1",
      quantity: 50,
      note: "supplier batch",
      createdById: "w1",
    });

    expect(updates.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { stockQuantity: { increment: 50 } },
    });
    expect(creates).toHaveBeenCalledWith({
      data: {
        notebookProductId: "p1",
        delta: 50,
        kind: NOTEBOOK_STOCK_KIND.RECEIPT,
        note: "supplier batch",
        createdById: "w1",
      },
    });
  });
});
