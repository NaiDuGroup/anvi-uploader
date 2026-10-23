import { Prisma } from "@prisma/client";
import { DtfStockKind } from "@/lib/dtf/dtfConstants";
import { trimmedOrNull } from "@/lib/stock/catalogStockReceiptSchema";
import { stockValueDecimal, type UnitCostSource } from "@/lib/stock/effectiveUnitCost";
import { receiptSourceData, type ReceiptSourceMeta } from "@/lib/stock/receiptSource";
import { weightedAverageUnitCost } from "@/lib/stock/unitWeightedAverage";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";

type Tx = Prisma.TransactionClient;

export interface GarmentOrderAudit {
  orderId: string;
  orderNumber: number | null;
  orderLineId: string | null;
  createdById: string | null;
}

export type GarmentStockSaleResult =
  | { deducted: true }
  | { deducted: false; requested: number; available: number };

async function variantCostSource(tx: Tx, garmentVariantId: string): Promise<UnitCostSource | null> {
  const v = await tx.garmentVariant.findUnique({
    where: { id: garmentVariantId },
    select: { avgPurchaseCost: true, garmentProduct: { select: { purchaseCost: true } } },
  });
  return v
    ? { avgPurchaseCost: v.avgPurchaseCost, purchaseCost: v.garmentProduct.purchaseCost }
    : null;
}

/** Take `quantity` pieces of one size; leaves stock unchanged when short. */
export async function tryRecordGarmentSale(
  tx: Tx,
  garmentVariantId: string,
  quantity: number,
  audit: GarmentOrderAudit,
): Promise<GarmentStockSaleResult> {
  if (quantity <= 0) return { deducted: true };
  const updated = await tx.garmentVariant.updateMany({
    where: { id: garmentVariantId, stockQuantity: { gte: quantity } },
    data: { stockQuantity: { decrement: quantity } },
  });
  if (updated.count === 0) {
    const v = await tx.garmentVariant.findUnique({
      where: { id: garmentVariantId },
      select: { stockQuantity: true },
    });
    return { deducted: false, requested: quantity, available: v?.stockQuantity ?? 0 };
  }
  await tx.garmentStockMovement.create({
    data: {
      garmentVariantId,
      delta: -quantity,
      kind: DtfStockKind.OrderSale,
      costMdl: stockValueDecimal(quantity, await variantCostSource(tx, garmentVariantId)),
      ...audit,
    },
  });
  return { deducted: true };
}

export async function recordGarmentReturn(
  tx: Tx,
  garmentVariantId: string,
  quantity: number,
  audit: GarmentOrderAudit,
): Promise<void> {
  if (quantity <= 0) return;
  await tx.garmentVariant.update({
    where: { id: garmentVariantId },
    data: { stockQuantity: { increment: quantity } },
  });
  await tx.garmentStockMovement.create({
    data: {
      garmentVariantId,
      delta: quantity,
      kind: DtfStockKind.OrderReturn,
      costMdl: stockValueDecimal(quantity, await variantCostSource(tx, garmentVariantId)),
      ...audit,
    },
  });
}

/** Append a receipt, roll the size's weighted-average cost forward and raise its balance. */
export async function recordGarmentReceipt(
  tx: Tx,
  params: {
    garmentVariantId: string;
    quantity: number;
    totalCostMdl: number;
    purchasedAt: Date;
    supplier?: string | null;
    note?: string | null;
    createdById: string | null;
  } & ReceiptSourceMeta,
): Promise<void> {
  const { garmentVariantId, quantity, totalCostMdl, createdById } = params;
  if (quantity <= 0) return;

  const variant = await tx.garmentVariant.findUniqueOrThrow({
    where: { id: garmentVariantId },
    select: {
      stockQuantity: true,
      avgPurchaseCost: true,
      garmentProduct: { select: { purchaseCost: true } },
    },
  });
  const wa = weightedAverageUnitCost({
    currentStock: variant.stockQuantity,
    currentAvgCost: variant.avgPurchaseCost == null ? null : Number(variant.avgPurchaseCost),
    catalogCost:
      variant.garmentProduct.purchaseCost == null
        ? null
        : Number(variant.garmentProduct.purchaseCost),
    purchasedQty: quantity,
    purchaseTotalMdl: totalCostMdl,
  });

  const totalCost = new Prisma.Decimal(totalCostMdl.toFixed(2));
  const note: string | null = trimmedOrNull(params.note);

  await tx.garmentStockReceipt.create({
    data: {
      ...receiptSourceData(params),
      garmentVariantId,
      quantity,
      totalCostMdl: totalCost,
      purchasedAt: toDatabaseDateOnly(params.purchasedAt),
      supplier: trimmedOrNull(params.supplier),
      note,
      createdById,
    },
  });
  await tx.garmentVariant.update({
    where: { id: garmentVariantId },
    data: {
      stockQuantity: { increment: quantity },
      avgPurchaseCost: new Prisma.Decimal(wa.newAvgCost.toFixed(4)),
    },
  });
  await tx.garmentStockMovement.create({
    data: {
      garmentVariantId,
      delta: quantity,
      kind: DtfStockKind.Receipt,
      costMdl: totalCost,
      note,
      createdById,
    },
  });
}
