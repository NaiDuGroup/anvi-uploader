import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveMugVariantId } from "@/lib/mug/mugVariant";
import { resolveNotebookVariantId } from "@/lib/notebook/notebookVariant";
import { resolvePenVariantId } from "@/lib/pen/penVariant";
import { allocateVariantProcurementBacklog } from "@/lib/stock/unified/variantProcurementBacklog";
import { resolveMaterialVariantId } from "@/lib/stock/unified/materials";
import type { ReceiptSourceMeta } from "@/lib/stock/receiptSource";
import { StockTargetKind, type PostableStockTargetKind, type StockTargetOption } from "./types";
import { listUnifiedTargetOptions, recordUnifiedReceipt, unifiedVariantUnit } from "./unifiedStockTarget";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

export type StockReceiptInput = {
  kind: PostableStockTargetKind;
  /** Unified variant id; for retired mug / pen / notebook / roll / paper kinds — the legacy id. */
  targetId: string;
  /** Quantity in our stock unit (pcs, linear m, sheets, ml). */
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  supplier: string | null;
  /** Supplier IDNO from the invoice (kept on unified receipts). */
  supplierIdno?: string | null;
  note: string | null;
  createdById: string | null;
} & ReceiptSourceMeta;

/** Single entry point for posting a receipt into any stock ledger. */
export async function recordStockReceipt(tx: Tx, input: StockReceiptInput): Promise<void> {
  const source: ReceiptSourceMeta = {
    purchaseInvoiceLineId: input.purchaseInvoiceLineId,
    isProvisional: input.isProvisional,
    amountsIncludeVat: input.amountsIncludeVat,
  };
  const common = {
    purchasedAt: input.purchasedAt,
    note: input.note,
    createdById: input.createdById,
    ...source,
  };

  switch (input.kind) {
    case StockTargetKind.Mug: {
      // Retired: mugs are unified «Кружки» variants. An old `mug` target (legacy id) posts to its variant.
      const variantId: string | null = await resolveMugVariantId(tx, input.targetId);
      if (!variantId) throw new Error(`Unknown mug for receipt: ${input.targetId}`);
      return recordUnifiedReceipt(tx, {
        ...common,
        variantId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplierIdno: input.supplierIdno ?? null,
        supplierName: input.supplier,
      });
    }
    case StockTargetKind.Notebook: {
      // Retired: notebooks are unified «Блокноты» variants. An old `notebook` target (legacy id) posts to its variant.
      const variantId: string | null = await resolveNotebookVariantId(tx, input.targetId);
      if (!variantId) throw new Error(`Unknown notebook for receipt: ${input.targetId}`);
      return recordUnifiedReceipt(tx, {
        ...common,
        variantId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplierIdno: input.supplierIdno ?? null,
        supplierName: input.supplier,
      });
    }
    case StockTargetKind.Pen: {
      // Retired: pens are unified «Ручки» variants. An old `pen` target (legacy id) posts to its variant.
      const variantId: string | null = await resolvePenVariantId(tx, input.targetId);
      if (!variantId) throw new Error(`Unknown pen for receipt: ${input.targetId}`);
      return recordUnifiedReceipt(tx, {
        ...common,
        variantId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplierIdno: input.supplierIdno ?? null,
        supplierName: input.supplier,
      });
    }
    case StockTargetKind.LfMaterial:
    case StockTargetKind.SheetPaper: {
      // Retired: rolls / papers are unified «Широкоформатные материалы» / «Листовая бумага»
      // variants. An old target (pricing row id) posts to the row's variant.
      const variantId: string | null = await resolveMaterialVariantId(
        tx,
        input.kind === StockTargetKind.LfMaterial ? "roll" : "sheet",
        input.targetId,
      );
      if (!variantId) throw new Error(`Unknown ${input.kind} for receipt: ${input.targetId}`);
      return recordUnifiedReceipt(tx, {
        ...common,
        variantId,
        quantity: input.kind === StockTargetKind.SheetPaper ? Math.round(input.quantity) : input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplierIdno: input.supplierIdno ?? null,
        supplierName: input.supplier,
      });
    }
    // Retired without a legacy-id lookup (ink tanks, DTF garments, film / powder): nothing was
    // ever posted to them; their stock is a unified variant («Чернила», «Плёнка DTF»…).
    case StockTargetKind.Ink:
    case StockTargetKind.Garment:
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      throw new Error(`Retired stock kind ${input.kind}: post to a unified stock variant`);
    case StockTargetKind.StockVariant:
      return recordUnifiedReceipt(tx, {
        ...common,
        variantId: input.targetId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplierIdno: input.supplierIdno ?? null,
        supplierName: input.supplier,
      });
  }
}

/**
 * Clears `needsProcurement` on orders that the new stock now covers.
 * Run in its own transaction after the receipt so a failure here never
 * rolls back the receipt itself.
 */
export async function allocateStockBacklog(
  tx: Tx,
  kind: PostableStockTargetKind,
  targetId: string,
  createdById: string | null,
): Promise<void> {
  switch (kind) {
    case StockTargetKind.Mug: {
      const variantId: string | null = await resolveMugVariantId(tx, targetId);
      return variantId ? allocateVariantProcurementBacklog(tx, { variantId, createdById }) : undefined;
    }
    case StockTargetKind.Notebook: {
      const variantId: string | null = await resolveNotebookVariantId(tx, targetId);
      return variantId ? allocateVariantProcurementBacklog(tx, { variantId, createdById }) : undefined;
    }
    case StockTargetKind.Pen: {
      const variantId: string | null = await resolvePenVariantId(tx, targetId);
      return variantId ? allocateVariantProcurementBacklog(tx, { variantId, createdById }) : undefined;
    }
    case StockTargetKind.LfMaterial:
    case StockTargetKind.SheetPaper: {
      const variantId: string | null = await resolveMaterialVariantId(
        tx,
        kind === StockTargetKind.LfMaterial ? "roll" : "sheet",
        targetId,
      );
      return variantId ? allocateVariantProcurementBacklog(tx, { variantId, createdById }) : undefined;
    }
    // Mug / pen / notebook / roll / paper orders that waited for this variant (no-op for other variants).
    case StockTargetKind.StockVariant:
      return allocateVariantProcurementBacklog(tx, { variantId: targetId, createdById });
    case StockTargetKind.Ink:
    case StockTargetKind.Garment:
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      return;
  }
}

export async function stockTargetExists(
  db: Db,
  kind: PostableStockTargetKind,
  targetId: string,
): Promise<boolean> {
  switch (kind) {
    case StockTargetKind.Mug:
      return (await resolveMugVariantId(db, targetId)) !== null;
    case StockTargetKind.Notebook:
      return (await resolveNotebookVariantId(db, targetId)) !== null;
    case StockTargetKind.Pen:
      return (await resolvePenVariantId(db, targetId)) !== null;
    case StockTargetKind.LfMaterial:
      return (await resolveMaterialVariantId(db, "roll", targetId)) !== null;
    case StockTargetKind.SheetPaper:
      return (await resolveMaterialVariantId(db, "sheet", targetId)) !== null;
    case StockTargetKind.Ink:
    case StockTargetKind.Garment:
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      return false;
    case StockTargetKind.StockVariant:
      return (await unifiedVariantUnit(db, targetId)) !== null;
  }
}

/** Every active stock item an invoice line can be posted to. */
export async function listStockTargetOptions(db: Db): Promise<StockTargetOption[]> {
  // Retired legacy kinds (mugs, pens, notebooks, DTF garments, ink tanks, DTF film / powder,
  // roll media, sheet paper) are not offered: they are posted to unified stock categories
  // («Кружки», «Ручки», «Блокноты», «Широкоформатные материалы», «Листовая бумага»…).
  // Unified variants keep catalogue order (category → item → variant).
  return listUnifiedTargetOptions(db);
}
