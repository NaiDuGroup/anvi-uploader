import type { Prisma } from "@prisma/client";
import { PEN_STOCK_KIND } from "./penStockKinds";

export type PenStockTx = Prisma.TransactionClient;

export class InsufficientPenStockError extends Error {
  readonly code = "insufficient_stock" as const;

  constructor(
    public readonly penProductId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super("insufficient_stock");
    this.name = "InsufficientPenStockError";
  }
}

export type PenStockSaleResult =
  | { deducted: true }
  | {
      deducted: false;
      penProductId: string;
      requested: number;
      available: number;
    };

/**
 * Reserve catalog stock for an order. When insufficient, does not change inventory
 * and returns `deducted: false` (caller sets order backorder flags).
 */
export async function tryRecordPenStockSale(
  tx: PenStockTx,
  params: {
    penProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number;
    createdById: string | null;
  },
): Promise<PenStockSaleResult> {
  const { penProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!penProductId || quantity <= 0) {
    return { deducted: true };
  }

  const updated = await tx.penProduct.updateMany({
    where: { id: penProductId, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });

  if (updated.count === 0) {
    const p = await tx.penProduct.findUnique({
      where: { id: penProductId },
      select: { stockQuantity: true },
    });
    return {
      deducted: false,
      penProductId,
      requested: quantity,
      available: p?.stockQuantity ?? 0,
    };
  }

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta: -quantity,
      kind: PEN_STOCK_KIND.ORDER_SALE,
      orderId,
      orderNumber,
      createdById,
    },
  });

  return { deducted: true };
}

/** Legacy: throws {@link InsufficientPenStockError} when stock is insufficient. */
export async function recordPenStockSale(
  tx: PenStockTx,
  params: {
    penProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number;
    createdById: string | null;
  },
): Promise<void> {
  const r = await tryRecordPenStockSale(tx, params);
  if (!r.deducted) {
    throw new InsufficientPenStockError(
      r.penProductId,
      r.requested,
      r.available,
    );
  }
}

export async function recordPenStockReturnOnOrderDelete(
  tx: PenStockTx,
  params: {
    penProductId: string | null;
    quantity: number;
    orderId: string;
    orderNumber: number | null;
    createdById: string | null;
  },
): Promise<void> {
  const { penProductId, quantity, orderId, orderNumber, createdById } = params;
  if (!penProductId || quantity <= 0) {
    return;
  }

  await tx.penProduct.update({
    where: { id: penProductId },
    data: { stockQuantity: { increment: quantity } },
  });

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta: quantity,
      kind: PEN_STOCK_KIND.ORDER_STOCK_RETURN,
      orderId,
      orderNumber,
      createdById,
    },
  });
}

export async function recordPenStockReceipt(
  tx: PenStockTx,
  params: {
    penProductId: string;
    quantity: number;
    note?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  const { penProductId, quantity, createdById } = params;
  if (quantity <= 0) {
    return;
  }

  await tx.penProduct.update({
    where: { id: penProductId },
    data: { stockQuantity: { increment: quantity } },
  });

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta: quantity,
      kind: PEN_STOCK_KIND.RECEIPT,
      note: params.note ?? null,
      createdById,
    },
  });
}

export async function recordPenStockInventoryAdjustment(
  tx: PenStockTx,
  params: {
    penProductId: string;
    actualStock: number;
    note?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  const { penProductId, actualStock, createdById } = params;

  const product = await tx.penProduct.findUnique({
    where: { id: penProductId },
    select: { stockQuantity: true },
  });

  if (!product) {
    throw new Error(`Pen product not found: ${penProductId}`);
  }

  const delta = actualStock - product.stockQuantity;

  if (delta === 0) {
    return;
  }

  await tx.penProduct.update({
    where: { id: penProductId },
    data: { stockQuantity: actualStock },
  });

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta,
      kind: PEN_STOCK_KIND.INVENTORY_ADJUSTMENT,
      note: params.note ?? null,
      createdById,
    },
  });
}
