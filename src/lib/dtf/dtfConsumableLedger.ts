import { Prisma } from "@prisma/client";
import type { DtfConsumableStock, PrismaClient } from "@prisma/client";
import { DtfConsumable, DtfStockKind } from "@/lib/dtf/dtfConstants";
import { trimmedOrNull } from "@/lib/stock/catalogStockReceiptSchema";
import { receiptSourceData, type ReceiptSourceMeta } from "@/lib/stock/receiptSource";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";

type Tx = Prisma.TransactionClient;

export interface DtfConsumableAudit {
  orderId: string;
  orderNumber: number | null;
  orderLineId: string | null;
  createdById: string | null;
}

export async function getOrCreateDtfConsumable(
  tx: Tx | PrismaClient,
  consumable: DtfConsumable,
): Promise<DtfConsumableStock> {
  return tx.dtfConsumableStock.upsert({
    where: { id: consumable },
    create: { id: consumable },
    update: {},
  });
}

function costOf(quantity: number, avgCostPerUnit: Prisma.Decimal): Prisma.Decimal {
  return new Prisma.Decimal((quantity * Number(avgCostPerUnit)).toFixed(2));
}

/**
 * Consume film or powder for an order. Bulk consumables never block an order:
 * the balance may go negative until the next receipt is entered.
 */
export async function consumeDtfConsumable(
  tx: Tx,
  consumable: DtfConsumable,
  quantity: number,
  audit: DtfConsumableAudit,
): Promise<void> {
  if (!(quantity > 0)) return;
  const row = await getOrCreateDtfConsumable(tx, consumable);
  await tx.dtfConsumableStock.update({
    where: { id: consumable },
    data: { stockQuantity: { decrement: quantity } },
  });
  await tx.dtfConsumableMovement.create({
    data: {
      consumableId: consumable,
      quantity: new Prisma.Decimal((-quantity).toFixed(3)),
      kind: DtfStockKind.OrderSale,
      costMdl: costOf(quantity, row.avgCostPerUnit),
      ...audit,
    },
  });
}

export async function returnDtfConsumable(
  tx: Tx,
  consumable: DtfConsumable,
  quantity: number,
  audit: DtfConsumableAudit,
): Promise<void> {
  if (!(quantity > 0)) return;
  const row = await getOrCreateDtfConsumable(tx, consumable);
  await tx.dtfConsumableStock.update({
    where: { id: consumable },
    data: { stockQuantity: { increment: quantity } },
  });
  await tx.dtfConsumableMovement.create({
    data: {
      consumableId: consumable,
      quantity: new Prisma.Decimal(quantity.toFixed(3)),
      kind: DtfStockKind.OrderReturn,
      costMdl: costOf(quantity, row.avgCostPerUnit),
      ...audit,
    },
  });
}

/** Weighted average over the positive part of the balance (a negative balance carries no value). */
export function blendDtfConsumableCost(input: {
  currentStock: number;
  currentAvgCost: number;
  purchasedQty: number;
  purchaseTotalMdl: number;
}): number {
  const before: number = Math.max(0, input.currentStock);
  const purchaseUnit: number = input.purchaseTotalMdl / input.purchasedQty;
  if (before === 0 || !(input.currentAvgCost > 0)) return purchaseUnit;
  return (before * input.currentAvgCost + input.purchaseTotalMdl) / (before + input.purchasedQty);
}

export async function recordDtfConsumableReceipt(
  tx: Tx,
  params: {
    consumable: DtfConsumable;
    quantity: number;
    totalCostMdl: number;
    purchasedAt: Date;
    supplier?: string | null;
    note?: string | null;
    createdById: string | null;
  } & ReceiptSourceMeta,
): Promise<void> {
  const { consumable, quantity, totalCostMdl, createdById } = params;
  if (!(quantity > 0)) return;
  const row = await getOrCreateDtfConsumable(tx, consumable);
  const avg: number = blendDtfConsumableCost({
    currentStock: Number(row.stockQuantity),
    currentAvgCost: Number(row.avgCostPerUnit),
    purchasedQty: quantity,
    purchaseTotalMdl: totalCostMdl,
  });
  const totalCost = new Prisma.Decimal(totalCostMdl.toFixed(2));
  const note: string | null = trimmedOrNull(params.note);

  await tx.dtfConsumableReceipt.create({
    data: {
      ...receiptSourceData(params),
      consumableId: consumable,
      quantity: new Prisma.Decimal(quantity.toFixed(3)),
      totalCostMdl: totalCost,
      purchasedAt: toDatabaseDateOnly(params.purchasedAt),
      supplier: trimmedOrNull(params.supplier),
      note,
      createdById,
    },
  });
  await tx.dtfConsumableStock.update({
    where: { id: consumable },
    data: {
      stockQuantity: { increment: quantity },
      avgCostPerUnit: new Prisma.Decimal(avg.toFixed(8)),
    },
  });
  await tx.dtfConsumableMovement.create({
    data: {
      consumableId: consumable,
      quantity: new Prisma.Decimal(quantity.toFixed(3)),
      kind: DtfStockKind.Receipt,
      costMdl: totalCost,
      note,
      createdById,
    },
  });
}
