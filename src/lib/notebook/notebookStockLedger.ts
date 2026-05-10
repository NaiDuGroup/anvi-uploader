import type { Prisma } from "@prisma/client";
import { NOTEBOOK_STOCK_KIND } from "./notebookStockKinds";

export type NotebookStockTx = Prisma.TransactionClient;

export class InsufficientNotebookStockError extends Error {
  readonly code = "insufficient_stock" as const;

  constructor(
    public readonly notebookProductId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super("insufficient_stock");
    this.name = "InsufficientNotebookStockError";
  }
}

export async function recordNotebookStockSale(
  tx: NotebookStockTx,
  params: {
    notebookProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number;
    createdById: string | null;
  },
): Promise<void> {
  const { notebookProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!notebookProductId || quantity <= 0) {
    return;
  }

  const updated = await tx.notebookProduct.updateMany({
    where: { id: notebookProductId, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });

  if (updated.count === 0) {
    const p = await tx.notebookProduct.findUnique({
      where: { id: notebookProductId },
      select: { stockQuantity: true },
    });
    throw new InsufficientNotebookStockError(
      notebookProductId,
      quantity,
      p?.stockQuantity ?? 0,
    );
  }

  await tx.notebookStockMovement.create({
    data: {
      notebookProductId,
      delta: -quantity,
      kind: NOTEBOOK_STOCK_KIND.ORDER_SALE,
      orderId,
      orderNumber,
      createdById,
    },
  });
}

export async function recordNotebookStockReturnOnOrderDelete(
  tx: NotebookStockTx,
  params: {
    notebookProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number | null;
    createdById: string | null;
  },
): Promise<void> {
  const { notebookProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!notebookProductId || quantity <= 0) {
    return;
  }

  await tx.notebookProduct.update({
    where: { id: notebookProductId },
    data: { stockQuantity: { increment: quantity } },
  });

  await tx.notebookStockMovement.create({
    data: {
      notebookProductId,
      delta: quantity,
      kind: NOTEBOOK_STOCK_KIND.ORDER_STOCK_RETURN,
      orderId,
      orderNumber,
      createdById,
    },
  });
}

export async function recordNotebookStockReceipt(
  tx: NotebookStockTx,
  params: {
    notebookProductId: string;
    quantity: number;
    note?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  const { notebookProductId, quantity, createdById } = params;
  if (quantity <= 0) {
    return;
  }

  await tx.notebookProduct.update({
    where: { id: notebookProductId },
    data: { stockQuantity: { increment: quantity } },
  });

  await tx.notebookStockMovement.create({
    data: {
      notebookProductId,
      delta: quantity,
      kind: NOTEBOOK_STOCK_KIND.RECEIPT,
      note: params.note ?? null,
      createdById,
    },
  });
}
