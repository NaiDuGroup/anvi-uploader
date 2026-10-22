import { Prisma } from "@prisma/client";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";
import { stockValueDecimal } from "@/lib/stock/effectiveUnitCost";
import { trimmedOrNull } from "@/lib/stock/catalogStockReceiptSchema";
import { weightedAverageUnitCost } from "@/lib/stock/unitWeightedAverage";
import { PEN_STOCK_KIND } from "./penStockKinds";

export type PenStockTx = Prisma.TransactionClient;

const PEN_COST_SELECT = { avgPurchaseCost: true, purchaseCost: true } as const;


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

  const costSource = await tx.penProduct.findUnique({
    where: { id: penProductId },
    select: PEN_COST_SELECT,
  });

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta: -quantity,
      kind: PEN_STOCK_KIND.ORDER_SALE,
      costMdl: stockValueDecimal(quantity, costSource),
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

  const returned = await tx.penProduct.update({
    where: { id: penProductId },
    data: { stockQuantity: { increment: quantity } },
    select: PEN_COST_SELECT,
  });

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta: quantity,
      kind: PEN_STOCK_KIND.ORDER_STOCK_RETURN,
      costMdl: stockValueDecimal(quantity, returned),
      orderId,
      orderNumber,
      createdById,
    },
  });
}

/**
 * Record a purchase receipt: append the receipt row, roll the weighted-average
 * unit cost forward and raise the stock balance, with a matching ledger movement.
 */
export async function recordPenStockReceipt(
  tx: PenStockTx,
  params: {
    penProductId: string;
    quantity: number;
    totalCostMdl: number;
    purchasedAt: Date;
    supplier?: string | null;
    note?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  const { penProductId, quantity, totalCostMdl, createdById } = params;
  if (quantity <= 0) {
    return;
  }

  const product = await tx.penProduct.findUniqueOrThrow({
    where: { id: penProductId },
    select: { stockQuantity: true, ...PEN_COST_SELECT },
  });

  const wa = weightedAverageUnitCost({
    currentStock: product.stockQuantity,
    currentAvgCost:
      product.avgPurchaseCost == null ? null : Number(product.avgPurchaseCost),
    catalogCost: product.purchaseCost == null ? null : Number(product.purchaseCost),
    purchasedQty: quantity,
    purchaseTotalMdl: totalCostMdl,
  });

  const totalCost = new Prisma.Decimal(totalCostMdl.toFixed(2));
  const supplier: string | null = trimmedOrNull(params.supplier);
  const note: string | null = trimmedOrNull(params.note);

  await tx.penStockReceipt.create({
    data: {
      penProductId,
      quantity,
      totalCostMdl: totalCost,
      purchasedAt: toDatabaseDateOnly(params.purchasedAt),
      supplier,
      note,
      createdById,
    },
  });

  await tx.penProduct.update({
    where: { id: penProductId },
    data: {
      stockQuantity: { increment: quantity },
      avgPurchaseCost: new Prisma.Decimal(wa.newAvgCost.toFixed(4)),
    },
  });

  await tx.penStockMovement.create({
    data: {
      penProductId,
      delta: quantity,
      kind: PEN_STOCK_KIND.RECEIPT,
      costMdl: totalCost,
      note,
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
