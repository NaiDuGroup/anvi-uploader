import { Prisma } from "@prisma/client";
import { receiptSourceData, type ReceiptSourceMeta } from "@/lib/stock/receiptSource";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";
import { stockValueDecimal } from "@/lib/stock/effectiveUnitCost";
import { trimmedOrNull } from "@/lib/stock/catalogStockReceiptSchema";
import { weightedAverageUnitCost } from "@/lib/stock/unitWeightedAverage";
import { NOTEBOOK_STOCK_KIND } from "./notebookStockKinds";

export type NotebookStockTx = Prisma.TransactionClient;

const NOTEBOOK_COST_SELECT = { avgPurchaseCost: true, purchaseCost: true } as const;


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

  const costSource = await tx.notebookProduct.findUnique({
    where: { id: notebookProductId },
    select: NOTEBOOK_COST_SELECT,
  });

  await tx.notebookStockMovement.create({
    data: {
      notebookProductId,
      delta: -quantity,
      kind: NOTEBOOK_STOCK_KIND.ORDER_SALE,
      costMdl: stockValueDecimal(quantity, costSource),
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

  const returned = await tx.notebookProduct.update({
    where: { id: notebookProductId },
    data: { stockQuantity: { increment: quantity } },
    select: NOTEBOOK_COST_SELECT,
  });

  await tx.notebookStockMovement.create({
    data: {
      notebookProductId,
      delta: quantity,
      kind: NOTEBOOK_STOCK_KIND.ORDER_STOCK_RETURN,
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
export async function recordNotebookStockReceipt(
  tx: NotebookStockTx,
  params: {
    notebookProductId: string;
    quantity: number;
    totalCostMdl: number;
    purchasedAt: Date;
    supplier?: string | null;
    note?: string | null;
    createdById: string | null;
  } & ReceiptSourceMeta,
): Promise<void> {
  const { notebookProductId, quantity, totalCostMdl, createdById } = params;
  if (quantity <= 0) {
    return;
  }

  const product = await tx.notebookProduct.findUniqueOrThrow({
    where: { id: notebookProductId },
    select: { stockQuantity: true, ...NOTEBOOK_COST_SELECT },
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

  await tx.notebookStockReceipt.create({
    data: {
      ...receiptSourceData(params),
      notebookProductId,
      quantity,
      totalCostMdl: totalCost,
      purchasedAt: toDatabaseDateOnly(params.purchasedAt),
      supplier,
      note,
      createdById,
    },
  });

  await tx.notebookProduct.update({
    where: { id: notebookProductId },
    data: {
      stockQuantity: { increment: quantity },
      avgPurchaseCost: new Prisma.Decimal(wa.newAvgCost.toFixed(4)),
    },
  });

  await tx.notebookStockMovement.create({
    data: {
      notebookProductId,
      delta: quantity,
      kind: NOTEBOOK_STOCK_KIND.RECEIPT,
      costMdl: totalCost,
      note,
      createdById,
    },
  });
}
