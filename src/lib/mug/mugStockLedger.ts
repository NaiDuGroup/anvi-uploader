import { Prisma } from "@prisma/client";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";
import { stockValueDecimal } from "@/lib/stock/effectiveUnitCost";
import { trimmedOrNull } from "@/lib/stock/catalogStockReceiptSchema";
import { weightedAverageUnitCost } from "@/lib/stock/unitWeightedAverage";
import { MUG_STOCK_KIND } from "./mugStockKinds";

export type MugStockTx = Prisma.TransactionClient;

const MUG_COST_SELECT = { avgPurchaseCost: true, purchaseCost: true } as const;


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

  const costSource = await tx.mugProduct.findUnique({
    where: { id: mugProductId },
    select: MUG_COST_SELECT,
  });

  await tx.mugStockMovement.create({
    data: {
      mugProductId,
      delta: -quantity,
      kind: MUG_STOCK_KIND.ORDER_SALE,
      costMdl: stockValueDecimal(quantity, costSource),
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

  const returned = await tx.mugProduct.update({
    where: { id: mugProductId },
    data: { stockQuantity: { increment: quantity } },
    select: MUG_COST_SELECT,
  });

  await tx.mugStockMovement.create({
    data: {
      mugProductId,
      delta: quantity,
      kind: MUG_STOCK_KIND.ORDER_STOCK_RETURN,
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
export async function recordMugStockReceipt(
  tx: MugStockTx,
  params: {
    mugProductId: string;
    quantity: number;
    totalCostMdl: number;
    purchasedAt: Date;
    supplier?: string | null;
    note?: string | null;
    createdById: string | null;
  },
): Promise<void> {
  const { mugProductId, quantity, totalCostMdl, createdById } = params;
  if (quantity <= 0) {
    return;
  }

  const product = await tx.mugProduct.findUniqueOrThrow({
    where: { id: mugProductId },
    select: { stockQuantity: true, ...MUG_COST_SELECT },
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

  await tx.mugStockReceipt.create({
    data: {
      mugProductId,
      quantity,
      totalCostMdl: totalCost,
      purchasedAt: toDatabaseDateOnly(params.purchasedAt),
      supplier,
      note,
      createdById,
    },
  });

  await tx.mugProduct.update({
    where: { id: mugProductId },
    data: {
      stockQuantity: { increment: quantity },
      avgPurchaseCost: new Prisma.Decimal(wa.newAvgCost.toFixed(4)),
    },
  });

  await tx.mugStockMovement.create({
    data: {
      mugProductId,
      delta: quantity,
      kind: MUG_STOCK_KIND.RECEIPT,
      costMdl: totalCost,
      note,
      createdById,
    },
  });
}
