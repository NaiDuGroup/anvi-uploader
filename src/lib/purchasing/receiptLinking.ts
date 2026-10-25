import type { Prisma } from "@prisma/client";
import { StockTargetKind, type PostableStockTargetKind } from "./types";
import { findUnlinkedUnifiedReceipts, linkUnifiedReceipt } from "./unifiedStockTarget";
import { resolveMugVariantId } from "@/lib/mug/mugVariant";
import { resolvePenVariantId } from "@/lib/pen/penVariant";
import { resolveNotebookVariantId } from "@/lib/notebook/notebookVariant";
import { resolveMaterialVariantId } from "@/lib/stock/unified/materials";

type Tx = Prisma.TransactionClient;

/** A receipt entered by hand (often before the invoice) that no invoice line owns yet. */
export type UnlinkedReceipt = {
  id: string;
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  isProvisional: boolean;
};

/**
 * Unified variant behind a target: `stock_variant` as is; retired `mug` / `pen` /
 * `notebook` (legacy id) and `lf_material` / `sheet_paper` (pricing row id) resolve
 * through `StockItem.legacyId` / the pricing row. Other retired kinds (ink tanks,
 * DTF garments, film / powder) never had postings and have no receipts to link: null.
 */
async function unifiedTargetVariantId(
  tx: Tx,
  kind: PostableStockTargetKind,
  targetId: string,
): Promise<string | null> {
  switch (kind) {
    case StockTargetKind.StockVariant:
      return targetId;
    case StockTargetKind.Mug:
      return resolveMugVariantId(tx, targetId);
    case StockTargetKind.Pen:
      return resolvePenVariantId(tx, targetId);
    case StockTargetKind.Notebook:
      return resolveNotebookVariantId(tx, targetId);
    case StockTargetKind.LfMaterial:
      return resolveMaterialVariantId(tx, "roll", targetId);
    case StockTargetKind.SheetPaper:
      return resolveMaterialVariantId(tx, "sheet", targetId);
    case StockTargetKind.Ink:
    case StockTargetKind.Garment:
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      return null;
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Goods usually arrive (and get entered) before the invoice; allow a generous window. */
const LINK_WINDOW_BEFORE_DAYS = 45;
const LINK_WINDOW_AFTER_DAYS = 10;

/** Hand-entered receipts near the invoice date that could be the same delivery. */
export async function findUnlinkedReceipts(
  tx: Tx,
  kind: PostableStockTargetKind,
  targetId: string,
  invoiceDate: Date,
): Promise<UnlinkedReceipt[]> {
  const variantId: string | null = await unifiedTargetVariantId(tx, kind, targetId);
  if (!variantId) return [];
  const from = new Date(invoiceDate.getTime() - LINK_WINDOW_BEFORE_DAYS * DAY_MS);
  const to = new Date(invoiceDate.getTime() + LINK_WINDOW_AFTER_DAYS * DAY_MS);
  return findUnlinkedUnifiedReceipts(tx, variantId, from, to);
}

/**
 * Attaches an existing receipt to an invoice line instead of posting a second
 * receipt, and moves the weighted average by the price difference.
 * Returns the cost difference applied (invoice − previously booked), or null
 * when the receipt is not available for linking.
 */
export async function linkReceiptToInvoiceLine(
  tx: Tx,
  params: {
    kind: PostableStockTargetKind;
    targetId: string;
    receiptId: string;
    purchaseInvoiceLineId: string;
    invoiceCostMdl: number;
    amountsIncludeVat: boolean;
    /** Unified stock only: author of the cost correction, supplier for an anonymous receipt. */
    createdById?: string | null;
    supplierIdno?: string | null;
    supplierName?: string | null;
  },
): Promise<{ deltaMdl: number; quantity: number } | null> {
  const variantId: string | null = await unifiedTargetVariantId(tx, params.kind, params.targetId);
  if (!variantId) return null;
  return linkUnifiedReceipt(tx, {
    variantId,
    receiptId: params.receiptId,
    purchaseInvoiceLineId: params.purchaseInvoiceLineId,
    invoiceCostMdl: params.invoiceCostMdl,
    amountsIncludeVat: params.amountsIncludeVat,
    createdById: params.createdById ?? null,
    supplierIdno: params.supplierIdno,
    supplierName: params.supplierName,
  });
}
