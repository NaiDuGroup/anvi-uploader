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

export type NotebookStockSaleResult =
  | { deducted: true }
  | {
      deducted: false;
      notebookProductId: string;
      requested: number;
      available: number;
    };

export async function tryRecordNotebookStockSale(
  tx: NotebookStockTx,
  params: {
    notebookProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number;
    createdById: string | null;
  },
): Promise<NotebookStockSaleResult> {
  const { notebookProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!notebookProductId || quantity <= 0) {
    return { deducted: true };
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
    return {
      deducted: false,
      notebookProductId,
      requested: quantity,
      available: p?.stockQuantity ?? 0,
    };
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

  return { deducted: true };
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
  const r = await tryRecordNotebookStockSale(tx, params);
  if (!r.deducted) {
    throw new InsufficientNotebookStockError(
      r.notebookProductId,
      r.requested,
      r.available,
    );
  }
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
