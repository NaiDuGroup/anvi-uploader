import { Prisma } from "@prisma/client";
import { toDatabaseDateOnly } from "@/lib/toDatabaseDateOnly";
import { receiptSourceData, type ReceiptSourceMeta } from "@/lib/stock/receiptSource";
import {
  DEFAULT_STOCK_LOCATION_ID,
  StockMovementKind,
  type OrderGiveBackKind,
  type OrderTakeKind,
} from "./kinds";
import {
  assertPositiveQty,
  movementCostMdl,
  planReceipt,
  planReceiptCostCorrection,
  planReceiptReversal,
  roundMdl,
  roundQty,
} from "./ledgerMath";

/**
 * Unified stock ledger: the only place that changes `StockVariant.stockQuantity`
 * and `avgCost`. Every change writes a `StockMovement`, so the balance can always
 * be rebuilt from movements. Callers pass a transaction client.
 */

export type StockTx = Prisma.TransactionClient;

const VARIANT_BALANCE_SELECT = {
  stockQuantity: true,
  avgCost: true,
  purchaseCost: true,
} as const;

type VariantBalance = {
  stock: number;
  avgCost: number | null;
  purchaseCost: number | null;
};

function num(value: Prisma.Decimal | null): number | null {
  return value == null ? null : Number(value.toString());
}

function qtyDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(roundQty(value).toFixed(6));
}

function mdlDecimal(value: number | null): Prisma.Decimal | null {
  return value == null ? null : new Prisma.Decimal(roundMdl(value).toFixed(2));
}

function unitCostDecimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(4));
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const t: string = value?.trim() ?? "";
  return t === "" ? null : t;
}

async function readBalance(tx: StockTx, variantId: string): Promise<VariantBalance> {
  const v = await tx.stockVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: VARIANT_BALANCE_SELECT,
  });
  return {
    stock: Number(v.stockQuantity.toString()),
    avgCost: num(v.avgCost),
    purchaseCost: num(v.purchaseCost),
  };
}

type Actor = { createdById: string | null };
type OrderRef = { orderId?: string | null; orderNumber?: number | null; orderLineId?: string | null };

export class InsufficientStockError extends Error {
  readonly code = "insufficient_stock" as const;

  constructor(
    public readonly variantId: string,
    public readonly requested: number,
    public readonly available: number,
  ) {
    super("insufficient_stock");
    this.name = "InsufficientStockError";
  }
}

// ─── Receipts ────────────────────────────────────────────────────────────────

export type ReceiveInput = {
  variantId: string;
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  locationId?: string;
  supplierIdno?: string | null;
  supplierName?: string | null;
  note?: string | null;
} & Actor &
  ReceiptSourceMeta;

/** Record a purchase: receipt row, weighted-average cost, balance and a RECEIPT movement. */
export async function receive(tx: StockTx, input: ReceiveInput): Promise<{ receiptId: string }> {
  assertPositiveQty(input.quantity);
  if (!Number.isFinite(input.totalCostMdl) || input.totalCostMdl < 0) {
    throw new Error("totalCostMdl must be a non-negative number");
  }
  const balance: VariantBalance = await readBalance(tx, input.variantId);
  const plan = planReceipt({
    currentStock: balance.stock,
    avgCost: balance.avgCost,
    purchaseCost: balance.purchaseCost,
    quantity: input.quantity,
    totalCostMdl: input.totalCostMdl,
  });
  const locationId: string = input.locationId ?? DEFAULT_STOCK_LOCATION_ID;
  const note: string | null = trimmedOrNull(input.note);

  const receipt = await tx.stockReceipt.create({
    data: {
      ...receiptSourceData(input),
      variantId: input.variantId,
      locationId,
      quantity: qtyDecimal(input.quantity),
      totalCostMdl: mdlDecimal(input.totalCostMdl)!,
      purchasedAt: toDatabaseDateOnly(input.purchasedAt),
      supplierIdno: trimmedOrNull(input.supplierIdno),
      supplierName: trimmedOrNull(input.supplierName),
      note,
      createdById: input.createdById,
    },
    select: { id: true },
  });

  await tx.stockVariant.update({
    where: { id: input.variantId },
    data: {
      stockQuantity: { increment: qtyDecimal(input.quantity) },
      avgCost: unitCostDecimal(plan.newAvgCost),
    },
  });

  await tx.stockMovement.create({
    data: {
      variantId: input.variantId,
      locationId,
      delta: qtyDecimal(input.quantity),
      kind: StockMovementKind.Receipt,
      costMdl: mdlDecimal(input.totalCostMdl),
      receiptId: receipt.id,
      note,
      createdById: input.createdById,
    },
  });

  return { receiptId: receipt.id };
}

/**
 * Cancel a receipt entered by mistake: take its units and value back out and
 * delete the row. Refused when fewer units are left than the receipt brought in
 * (some were already used) — correct with an inventory adjustment instead.
 */
export async function reverseReceipt(
  tx: StockTx,
  params: { receiptId: string } & Actor,
): Promise<void> {
  const receipt = await tx.stockReceipt.findUniqueOrThrow({
    where: { id: params.receiptId },
    select: { variantId: true, locationId: true, quantity: true, totalCostMdl: true },
  });
  const quantity: number = Number(receipt.quantity.toString());
  const total: number = Number(receipt.totalCostMdl.toString());
  const balance: VariantBalance = await readBalance(tx, receipt.variantId);
  if (balance.stock < quantity) {
    throw new InsufficientStockError(receipt.variantId, quantity, balance.stock);
  }
  const plan = planReceiptReversal({
    currentStock: balance.stock,
    avgCost: balance.avgCost ?? (quantity > 0 ? total / quantity : 0),
    receiptQuantity: quantity,
    receiptTotalMdl: total,
  });

  await tx.stockVariant.update({
    where: { id: receipt.variantId },
    data: {
      stockQuantity: { decrement: qtyDecimal(quantity) },
      avgCost: plan.newStock > 0 ? unitCostDecimal(plan.newAvgCost) : undefined,
    },
  });
  await tx.stockMovement.create({
    data: {
      variantId: receipt.variantId,
      locationId: receipt.locationId,
      delta: qtyDecimal(-quantity),
      kind: StockMovementKind.ReceiptReversal,
      costMdl: mdlDecimal(total),
      createdById: params.createdById,
    },
  });
  await tx.stockReceipt.delete({ where: { id: params.receiptId } });
}

/** Re-price a past receipt (e.g. provisional cost → supplier invoice) and roll the average. */
export async function correctReceiptCost(
  tx: StockTx,
  params: { receiptId: string; newTotalCostMdl: number; isProvisional?: boolean } & Actor,
): Promise<void> {
  const receipt = await tx.stockReceipt.findUniqueOrThrow({
    where: { id: params.receiptId },
    select: { variantId: true, locationId: true, quantity: true, totalCostMdl: true },
  });
  const oldTotal: number = Number(receipt.totalCostMdl.toString());
  const quantity: number = Number(receipt.quantity.toString());
  if (roundMdl(oldTotal) === roundMdl(params.newTotalCostMdl)) {
    if (params.isProvisional !== undefined) {
      await tx.stockReceipt.update({
        where: { id: params.receiptId },
        data: { isProvisional: params.isProvisional },
      });
    }
    return;
  }
  const balance: VariantBalance = await readBalance(tx, receipt.variantId);
  const newAvg: number = planReceiptCostCorrection({
    currentStock: balance.stock,
    avgCost: balance.avgCost ?? oldTotal / quantity,
    receiptQuantity: quantity,
    oldTotalMdl: oldTotal,
    newTotalMdl: params.newTotalCostMdl,
  });

  await tx.stockReceipt.update({
    where: { id: params.receiptId },
    data: {
      totalCostMdl: mdlDecimal(params.newTotalCostMdl)!,
      ...(params.isProvisional !== undefined ? { isProvisional: params.isProvisional } : {}),
    },
  });
  await tx.stockVariant.update({
    where: { id: receipt.variantId },
    data: { avgCost: unitCostDecimal(newAvg) },
  });
  await tx.stockMovement.create({
    data: {
      variantId: receipt.variantId,
      locationId: receipt.locationId,
      delta: new Prisma.Decimal(0),
      kind: StockMovementKind.ReceiptCostCorrection,
      costMdl: mdlDecimal(params.newTotalCostMdl - oldTotal),
      receiptId: params.receiptId,
      createdById: params.createdById,
    },
  });
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type ConsumeResult =
  | { consumed: true; costMdl: number | null }
  | { consumed: false; variantId: string; requested: number; available: number };

/**
 * Take stock for an order. By default never goes below zero: when stock is short
 * nothing changes and the caller decides (backorder / procurement list).
 */
export async function consume(
  tx: StockTx,
  params: {
    variantId: string;
    quantity: number;
    locationId?: string;
    /**
     * Consumables (ink, toner, film, powder) must not block an order: the
     * balance may go below zero and shows up as «докупить». Also used for
     * prints that already happened (a layout confirmed on another roll).
     */
    allowNegative?: boolean;
    /** Movement kind; `ORDER_SALE` by default. */
    kind?: OrderTakeKind;
    note?: string | null;
  } & OrderRef &
    Actor,
): Promise<ConsumeResult> {
  assertPositiveQty(params.quantity);
  const qty: Prisma.Decimal = qtyDecimal(params.quantity);
  const updated = await tx.stockVariant.updateMany({
    where: params.allowNegative
      ? { id: params.variantId }
      : { id: params.variantId, stockQuantity: { gte: qty } },
    data: { stockQuantity: { decrement: qty } },
  });
  if (updated.count === 0) {
    const balance: VariantBalance = await readBalance(tx, params.variantId);
    return {
      consumed: false,
      variantId: params.variantId,
      requested: params.quantity,
      available: balance.stock,
    };
  }
  const balance: VariantBalance = await readBalance(tx, params.variantId);
  const costMdl: number | null = movementCostMdl(params.quantity, balance.avgCost, balance.purchaseCost);
  await tx.stockMovement.create({
    data: {
      variantId: params.variantId,
      locationId: params.locationId ?? DEFAULT_STOCK_LOCATION_ID,
      delta: qtyDecimal(-params.quantity),
      kind: params.kind ?? StockMovementKind.OrderSale,
      costMdl: mdlDecimal(costMdl),
      orderId: params.orderId ?? null,
      orderNumber: params.orderNumber ?? null,
      orderLineId: params.orderLineId ?? null,
      note: trimmedOrNull(params.note),
      createdById: params.createdById,
    },
  });
  return { consumed: true, costMdl };
}

/** Put stock back when an order is deleted or a line is removed. */
export async function returnToStock(
  tx: StockTx,
  params: {
    variantId: string;
    quantity: number;
    locationId?: string;
    /** Movement kind; `ORDER_RETURN` by default. */
    kind?: OrderGiveBackKind;
    note?: string | null;
  } & OrderRef &
    Actor,
): Promise<void> {
  assertPositiveQty(params.quantity);
  await tx.stockVariant.update({
    where: { id: params.variantId },
    data: { stockQuantity: { increment: qtyDecimal(params.quantity) } },
  });
  const balance: VariantBalance = await readBalance(tx, params.variantId);
  await tx.stockMovement.create({
    data: {
      variantId: params.variantId,
      locationId: params.locationId ?? DEFAULT_STOCK_LOCATION_ID,
      delta: qtyDecimal(params.quantity),
      kind: params.kind ?? StockMovementKind.OrderReturn,
      costMdl: mdlDecimal(movementCostMdl(params.quantity, balance.avgCost, balance.purchaseCost)),
      orderId: params.orderId ?? null,
      orderNumber: params.orderNumber ?? null,
      orderLineId: params.orderLineId ?? null,
      note: trimmedOrNull(params.note),
      createdById: params.createdById,
    },
  });
}

// ─── Manual corrections ──────────────────────────────────────────────────────

/** Set the balance to a counted value (stocktake). No-op when it already matches. */
export async function adjustToActual(
  tx: StockTx,
  params: { variantId: string; actualQuantity: number; note?: string | null; locationId?: string } & Actor,
): Promise<{ delta: number }> {
  if (!Number.isFinite(params.actualQuantity) || params.actualQuantity < 0) {
    throw new Error("actualQuantity must be a non-negative number");
  }
  const balance: VariantBalance = await readBalance(tx, params.variantId);
  const delta: number = roundQty(params.actualQuantity - balance.stock);
  if (delta === 0) return { delta };
  await tx.stockVariant.update({
    where: { id: params.variantId },
    data: { stockQuantity: qtyDecimal(params.actualQuantity) },
  });
  await tx.stockMovement.create({
    data: {
      variantId: params.variantId,
      locationId: params.locationId ?? DEFAULT_STOCK_LOCATION_ID,
      delta: qtyDecimal(delta),
      kind: StockMovementKind.InventoryAdjustment,
      costMdl: mdlDecimal(movementCostMdl(delta, balance.avgCost, balance.purchaseCost)),
      note: trimmedOrNull(params.note),
      createdById: params.createdById,
    },
  });
  return { delta };
}

/** Write off damaged / lost units. Refused when there is not enough stock. */
export async function writeOff(
  tx: StockTx,
  params: { variantId: string; quantity: number; note?: string | null; locationId?: string } & Actor,
): Promise<void> {
  assertPositiveQty(params.quantity);
  const qty: Prisma.Decimal = qtyDecimal(params.quantity);
  const updated = await tx.stockVariant.updateMany({
    where: { id: params.variantId, stockQuantity: { gte: qty } },
    data: { stockQuantity: { decrement: qty } },
  });
  const balance: VariantBalance = await readBalance(tx, params.variantId);
  if (updated.count === 0) {
    throw new InsufficientStockError(params.variantId, params.quantity, balance.stock);
  }
  await tx.stockMovement.create({
    data: {
      variantId: params.variantId,
      locationId: params.locationId ?? DEFAULT_STOCK_LOCATION_ID,
      delta: qtyDecimal(-params.quantity),
      kind: StockMovementKind.WriteOff,
      costMdl: mdlDecimal(movementCostMdl(params.quantity, balance.avgCost, balance.purchaseCost)),
      note: trimmedOrNull(params.note),
      createdById: params.createdById,
    },
  });
}

/** Sum of movements for a variant — the source of truth the cached balance must match. */
export async function balanceFromMovements(tx: StockTx, variantId: string): Promise<number> {
  const agg = await tx.stockMovement.aggregate({
    where: { variantId },
    _sum: { delta: true },
  });
  return roundQty(Number(agg._sum.delta?.toString() ?? "0"));
}
