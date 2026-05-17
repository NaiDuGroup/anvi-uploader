import type { Prisma } from "@prisma/client";
import { MUG_STOCK_KIND } from "./mugStockKinds";

export type MugStockTx = Prisma.TransactionClient;

export class InsufficientMugStockError extends Error {
  readonly code = "insufficient_stock" as const;

  constructor(
    public readonly mugProductId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super("insufficient_stock");
    this.name = "InsufficientMugStockError";
  }
}

export type MugStockSaleResult =
  | { deducted: true }
  | {
      deducted: false;
      mugProductId: string;
      requested: number;
      available: number;
    };

/**
 * Reserve catalog stock for an order. When insufficient, does not change inventory
 * and returns `deducted: false` (caller sets order backorder flags).
 */
export async function tryRecordMugStockSale(
  tx: MugStockTx,
  params: {
    mugProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number;
    createdById: string | null;
  },
): Promise<MugStockSaleResult> {
  const { mugProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!mugProductId || quantity <= 0) {
    return { deducted: true };
  }

  const updated = await tx.mugProduct.updateMany({
    where: { id: mugProductId, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });

  if (updated.count === 0) {
    const p = await tx.mugProduct.findUnique({
      where: { id: mugProductId },
      select: { stockQuantity: true },
    });
    return {
      deducted: false,
      mugProductId,
      requested: quantity,
      available: p?.stockQuantity ?? 0,
    };
  }

  await tx.mugStockMovement.create({
    data: {
      mugProductId,
      delta: -quantity,
      kind: MUG_STOCK_KIND.ORDER_SALE,
      orderId,
      orderNumber,
      createdById,
    },
  });

  return { deducted: true };
}

/** Legacy: throws {@link InsufficientMugStockError} when stock is insufficient. */
export async function recordMugStockSale(
  tx: MugStockTx,
  params: {
    mugProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number;
    createdById: string | null;
  },
): Promise<void> {
  const r = await tryRecordMugStockSale(tx, params);
  if (!r.deducted) {
    throw new InsufficientMugStockError(
      r.mugProductId,
      r.requested,
      r.available,
    );
  }
}

export async function recordMugStockReturnOnOrderDelete(
  tx: MugStockTx,
  params: {
    mugProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number | null;
    createdById: string | null;
  },
): Promise<void> {
  const { mugProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!mugProductId || quantity <= 0) {
    return;
  }

  await tx.mugProduct.update({
    where: { id: mugProductId },
    data: { stockQuantity: { increment: quantity } },
  });

  await tx.mugStockMovement.create({
    data: {
      mugProductId,
      delta: quantity,
      kind: MUG_STOCK_KIND.ORDER_STOCK_RETURN,
      orderId,
      orderNumber,
      createdById,
    },
  });
}

export async function recordMugStockReceipt(
  tx: MugStockTx,
  params: {
    mugProductId: string;
    quantity: number;
    note?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  const { mugProductId, quantity, createdById } = params;
  if (quantity <= 0) {
    return;
  }

  await tx.mugProduct.update({
    where: { id: mugProductId },
    data: { stockQuantity: { increment: quantity } },
  });

  await tx.mugStockMovement.create({
    data: {
      mugProductId,
      delta: quantity,
      kind: MUG_STOCK_KIND.RECEIPT,
      note: params.note ?? null,
      createdById,
    },
  });
}
