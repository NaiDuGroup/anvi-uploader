import type { Prisma, PrismaClient } from "@prisma/client";
import { correctReceiptCost, receive, reverseReceipt } from "@/lib/stock/unified/ledger";
import {
  purchaseUnitFromStockUnit,
  StockTargetKind,
  unifiedVariantLabel,
  type PurchaseStockUnit,
  type StockTargetOption,
  type UnifiedTargetInfo,
} from "./types";

/**
 * Unified stock (`StockVariant`) as an e-Factura posting target: options for
 * the picker, receipts through the unified ledger, and linking / un-posting by
 * `StockReceipt.purchaseInvoiceLineId`.
 */

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

const VARIANT_INFO_SELECT = {
  id: true,
  sku: true,
  label: true,
  sortOrder: true,
  /** Roll width of roll media, used to rank invoice-line suggestions. */
  lfMaterial: { select: { rollWidthMeters: true } },
  item: {
    select: {
      nameRo: true,
      nameRu: true,
      nameEn: true,
      sortOrder: true,
      category: {
        select: { id: true, nameRo: true, nameRu: true, nameEn: true, unit: true, sortOrder: true },
      },
    },
  },
} as const;

type VariantInfoRow = Prisma.StockVariantGetPayload<{ select: typeof VARIANT_INFO_SELECT }>;

export function unifiedOptionFromRow(v: VariantInfoRow): StockTargetOption {
  const { item } = v;
  const unified: UnifiedTargetInfo = {
    group: {
      id: item.category.id,
      names: { ro: item.category.nameRo, ru: item.category.nameRu, en: item.category.nameEn },
      sortOrder: item.category.sortOrder,
    },
    itemNames: { ro: item.nameRo, ru: item.nameRu, en: item.nameEn },
    variantLabel: v.label,
    sku: v.sku,
  };
  return {
    kind: StockTargetKind.StockVariant,
    id: v.id,
    name: unifiedVariantLabel(item.nameRo, v.label, v.sku),
    widthMeters: v.lfMaterial ? Number(v.lfMaterial.rollWidthMeters.toString()) : null,
    unit: purchaseUnitFromStockUnit(item.category.unit),
    unified,
  };
}

/** Active variants of active items in active categories, in catalogue order. */
export async function listUnifiedTargetOptions(db: Db): Promise<StockTargetOption[]> {
  const rows = await db.stockVariant.findMany({
    where: { isActive: true, item: { isActive: true, category: { isActive: true } } },
    select: VARIANT_INFO_SELECT,
    orderBy: [
      { item: { category: { sortOrder: "asc" } } },
      { item: { sortOrder: "asc" } },
      { item: { nameRo: "asc" } },
      { sortOrder: "asc" },
      { sku: "asc" },
    ],
  });
  return rows.map(unifiedOptionFromRow);
}

/** Options for specific variants, inactive ones included (names of posted lines / rules). */
export async function unifiedTargetOptionsByIds(
  db: Db,
  ids: readonly string[],
): Promise<StockTargetOption[]> {
  if (ids.length === 0) return [];
  const rows = await db.stockVariant.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: VARIANT_INFO_SELECT,
  });
  return rows.map(unifiedOptionFromRow);
}

/** Category unit of a variant, or null when the variant does not exist. */
export async function unifiedVariantUnit(db: Db, variantId: string): Promise<PurchaseStockUnit | null> {
  const v = await db.stockVariant.findUnique({
    where: { id: variantId },
    select: { item: { select: { category: { select: { unit: true } } } } },
  });
  return v ? purchaseUnitFromStockUnit(v.item.category.unit) : null;
}

export type UnifiedReceiptInput = {
  variantId: string;
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  supplierIdno: string | null;
  supplierName: string | null;
  note: string | null;
  createdById: string | null;
  purchaseInvoiceLineId?: string | null;
  isProvisional?: boolean;
  amountsIncludeVat?: boolean;
};

export async function recordUnifiedReceipt(tx: Tx, input: UnifiedReceiptInput): Promise<void> {
  await receive(tx, input);
}

// ─── Hand-entered receipts ───────────────────────────────────────────────────

export type UnifiedUnlinkedReceipt = {
  id: string;
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  isProvisional: boolean;
};

const RECEIPT_SELECT = {
  id: true,
  quantity: true,
  totalCostMdl: true,
  purchasedAt: true,
  isProvisional: true,
} as const;

type ReceiptRow = Prisma.StockReceiptGetPayload<{ select: typeof RECEIPT_SELECT }>;

function toUnlinked(r: ReceiptRow): UnifiedUnlinkedReceipt {
  return {
    id: r.id,
    quantity: Number(r.quantity.toString()),
    totalCostMdl: Number(r.totalCostMdl.toString()),
    purchasedAt: r.purchasedAt,
    isProvisional: r.isProvisional,
  };
}

export async function findUnlinkedUnifiedReceipts(
  db: Db,
  variantId: string,
  from: Date,
  to: Date,
): Promise<UnifiedUnlinkedReceipt[]> {
  const rows = await db.stockReceipt.findMany({
    where: { variantId, purchaseInvoiceLineId: null, purchasedAt: { gte: from, lte: to } },
    select: RECEIPT_SELECT,
    orderBy: { purchasedAt: "desc" },
  });
  return rows.map(toUnlinked);
}

/**
 * Attach a hand-entered receipt to an invoice line and re-price it at the
 * invoice amount (the ledger rolls the weighted average and logs a correction).
 */
export async function linkUnifiedReceipt(
  tx: Tx,
  params: {
    variantId: string;
    receiptId: string;
    purchaseInvoiceLineId: string;
    invoiceCostMdl: number;
    amountsIncludeVat: boolean;
    createdById: string | null;
    /** Filled in when the hand-entered receipt has no supplier yet. */
    supplierIdno?: string | null;
    supplierName?: string | null;
  },
): Promise<{ deltaMdl: number; quantity: number } | null> {
  const row = await tx.stockReceipt.findFirst({
    where: { id: params.receiptId, variantId: params.variantId, purchaseInvoiceLineId: null },
    select: { ...RECEIPT_SELECT, supplierIdno: true, supplierName: true },
  });
  if (!row) return null;
  const receipt = toUnlinked(row);
  await tx.stockReceipt.update({
    where: { id: receipt.id },
    data: {
      purchaseInvoiceLineId: params.purchaseInvoiceLineId,
      amountsIncludeVat: params.amountsIncludeVat,
      ...(row.supplierIdno == null && row.supplierName == null
        ? { supplierIdno: params.supplierIdno ?? null, supplierName: params.supplierName ?? null }
        : {}),
    },
  });
  await correctReceiptCost(tx, {
    receiptId: receipt.id,
    newTotalCostMdl: params.invoiceCostMdl,
    isProvisional: false,
    createdById: params.createdById,
  });
  return { deltaMdl: params.invoiceCostMdl - receipt.totalCostMdl, quantity: receipt.quantity };
}

// ─── Un-posting ──────────────────────────────────────────────────────────────

/** A receipt created more than this long before the line was posted was linked, not posted. */
const LINKED_RECEIPT_MIN_AGE_MS = 60_000;

export enum UnifiedUnpostAction {
  /** The posting created the receipt: take it back out of stock. */
  Reversed = "reversed",
  /** The posting linked a hand-entered receipt: detach it, stock stays. */
  Unlinked = "unlinked",
  /** Nothing was found (receipt already deleted by hand). */
  None = "none",
}

/** Decide whether the receipt of a posted line was created by the posting or linked to it. */
export function unpostActionFor(
  receipt: { createdAt: Date } | null,
  postedAt: Date | null,
): UnifiedUnpostAction {
  if (!receipt) return UnifiedUnpostAction.None;
  if (postedAt && postedAt.getTime() - receipt.createdAt.getTime() > LINKED_RECEIPT_MIN_AGE_MS) {
    return UnifiedUnpostAction.Unlinked;
  }
  return UnifiedUnpostAction.Reversed;
}

/**
 * Undo the stock side of a posted line. Throws `InsufficientStockError` when
 * part of the received quantity has already been used.
 */
export async function unpostUnifiedLine(
  tx: Tx,
  params: { purchaseInvoiceLineId: string; postedAt: Date | null; createdById: string | null },
): Promise<UnifiedUnpostAction> {
  const receipt = await tx.stockReceipt.findUnique({
    where: { purchaseInvoiceLineId: params.purchaseInvoiceLineId },
    select: { id: true, createdAt: true },
  });
  const action: UnifiedUnpostAction = unpostActionFor(receipt, params.postedAt);
  if (!receipt) return action;
  if (action === UnifiedUnpostAction.Unlinked) {
    await tx.stockReceipt.update({
      where: { id: receipt.id },
      data: { purchaseInvoiceLineId: null },
    });
  } else {
    await reverseReceipt(tx, { receiptId: receipt.id, createdById: params.createdById });
  }
  return action;
}
