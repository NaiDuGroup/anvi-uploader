import type { Prisma, PrismaClient } from "@prisma/client";
import { recordMugStockReceipt } from "@/lib/mug/mugStockLedger";
import { recordNotebookStockReceipt } from "@/lib/notebook/notebookStockLedger";
import { recordPenStockReceipt } from "@/lib/pen/penStockLedger";
import { recordLfRollStockReceipt } from "@/lib/largeFormat/lfRollStockReceipt";
import { recordSheetPaperStockReceipt } from "@/lib/businessCard/sheetPaperStockReceipt";
import { recordInkStockReceipt } from "@/lib/ink/inkStockReceipt";
import { DtfConsumable } from "@/lib/dtf/dtfConstants";
import { recordDtfConsumableReceipt } from "@/lib/dtf/dtfConsumableLedger";
import { recordGarmentReceipt } from "@/lib/dtf/garmentStockLedger";
import {
  allocateInkProcurementBacklog,
  allocateLfRollProcurementBacklog,
  allocateMugProcurementBacklog,
  allocateNotebookProcurementBacklog,
  allocatePenProcurementBacklog,
} from "@/lib/allocateProcurementAfterReceipt";
import { isPrintProcess, PRINT_PROCESSES, type PrintProcess } from "@/lib/printProcess";
import type { ReceiptSourceMeta } from "@/lib/stock/receiptSource";
import {
  StockTargetKind,
  type PostableStockTargetKind,
  type StockTargetOption,
} from "./types";

type Tx = Prisma.TransactionClient;
type Db = Tx | PrismaClient;

export type StockReceiptInput = {
  kind: PostableStockTargetKind;
  /** Product / material / paper id; for ink — the print process code. */
  targetId: string;
  /** Quantity in our stock unit (pcs, linear m, sheets, ml). */
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  supplier: string | null;
  note: string | null;
  createdById: string | null;
} & ReceiptSourceMeta;

function requirePrintProcess(targetId: string): PrintProcess {
  if (!isPrintProcess(targetId)) {
    throw new Error(`Unknown print process for ink receipt: ${targetId}`);
  }
  return targetId;
}

/** Film and powder share one ledger; the stock kind fixes which pool. */
export function dtfConsumableForKind(
  kind: StockTargetKind.DtfFilm | StockTargetKind.DtfPowder,
): DtfConsumable {
  return kind === StockTargetKind.DtfFilm ? DtfConsumable.Film : DtfConsumable.Powder;
}

/** Integer-MDL ledgers (roll media, sheet paper, ink) store whole lei. */
function wholeMdl(amount: number): number {
  return Math.round(amount);
}

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
    case StockTargetKind.Mug:
      return recordMugStockReceipt(tx, {
        ...common,
        mugProductId: input.targetId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplier: input.supplier,
      });
    case StockTargetKind.Notebook:
      return recordNotebookStockReceipt(tx, {
        ...common,
        notebookProductId: input.targetId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplier: input.supplier,
      });
    case StockTargetKind.Pen:
      return recordPenStockReceipt(tx, {
        ...common,
        penProductId: input.targetId,
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplier: input.supplier,
      });
    case StockTargetKind.LfMaterial:
      return recordLfRollStockReceipt(tx, {
        ...common,
        materialId: input.targetId,
        quantityLinearMeters: input.quantity,
        totalCostMdl: wholeMdl(input.totalCostMdl),
        supplier: input.supplier,
      });
    case StockTargetKind.SheetPaper:
      return recordSheetPaperStockReceipt(tx, {
        ...common,
        sheetPaperId: input.targetId,
        quantitySheets: Math.round(input.quantity),
        totalCostMdl: wholeMdl(input.totalCostMdl),
        supplier: input.supplier,
      });
    case StockTargetKind.Ink: {
      const note: string | null =
        [input.supplier, input.note].filter((s): s is string => Boolean(s)).join(" · ") || null;
      return recordInkStockReceipt(tx, {
        ...common,
        note,
        printProcess: requirePrintProcess(input.targetId),
        quantityMl: input.quantity,
        totalCostMdl: wholeMdl(input.totalCostMdl),
      });
    }
    case StockTargetKind.Garment:
      return recordGarmentReceipt(tx, {
        ...common,
        garmentVariantId: input.targetId,
        quantity: Math.round(input.quantity),
        totalCostMdl: input.totalCostMdl,
        supplier: input.supplier,
      });
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      return recordDtfConsumableReceipt(tx, {
        ...common,
        consumable: dtfConsumableForKind(input.kind),
        quantity: input.quantity,
        totalCostMdl: input.totalCostMdl,
        supplier: input.supplier,
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
    case StockTargetKind.Mug:
      return allocateMugProcurementBacklog(tx, { mugProductId: targetId, createdById });
    case StockTargetKind.Notebook:
      return allocateNotebookProcurementBacklog(tx, { notebookProductId: targetId, createdById });
    case StockTargetKind.Pen:
      return allocatePenProcurementBacklog(tx, { penProductId: targetId, createdById });
    case StockTargetKind.LfMaterial:
      return allocateLfRollProcurementBacklog(tx, { materialId: targetId });
    case StockTargetKind.Ink:
      return allocateInkProcurementBacklog(tx, requirePrintProcess(targetId));
    case StockTargetKind.SheetPaper:
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
  const where = { where: { id: targetId }, select: { id: true } } as const;
  switch (kind) {
    case StockTargetKind.Mug:
      return (await db.mugProduct.findUnique(where)) !== null;
    case StockTargetKind.Notebook:
      return (await db.notebookProduct.findUnique(where)) !== null;
    case StockTargetKind.Pen:
      return (await db.penProduct.findUnique(where)) !== null;
    case StockTargetKind.LfMaterial:
      return (await db.largeFormatMaterial.findUnique(where)) !== null;
    case StockTargetKind.SheetPaper:
      return (await db.sheetPaper.findUnique(where)) !== null;
    case StockTargetKind.Ink:
      return isPrintProcess(targetId);
    case StockTargetKind.Garment:
      return (await db.garmentVariant.findUnique(where)) !== null;
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      return targetId === dtfConsumableForKind(kind);
  }
}

/** Every active stock item an invoice line can be posted to. */
export async function listStockTargetOptions(db: Db): Promise<StockTargetOption[]> {
  const active = { where: { isActive: true } } as const;
  const [mugs, notebooks, pens, materials, papers, garments] = await Promise.all([
    db.mugProduct.findMany({ ...active, select: { id: true, nameRo: true } }),
    db.notebookProduct.findMany({ ...active, select: { id: true, nameRo: true } }),
    db.penProduct.findMany({ ...active, select: { id: true, nameRo: true } }),
    db.largeFormatMaterial.findMany({
      ...active,
      select: { id: true, name: true, rollWidthMeters: true },
    }),
    db.sheetPaper.findMany({ ...active, select: { id: true, name: true } }),
    db.garmentVariant.findMany({
      where: { garmentProduct: { isActive: true } },
      select: {
        id: true,
        size: true,
        garmentProduct: { select: { name: true, colorName: true } },
      },
    }),
  ]);

  const option = (
    kind: PostableStockTargetKind,
    id: string,
    name: string,
    widthMeters: number | null = null,
  ): StockTargetOption => ({ kind, id, name, widthMeters });

  const options: StockTargetOption[] = [
    ...mugs.map((p) => option(StockTargetKind.Mug, p.id, p.nameRo)),
    ...notebooks.map((p) => option(StockTargetKind.Notebook, p.id, p.nameRo)),
    ...pens.map((p) => option(StockTargetKind.Pen, p.id, p.nameRo)),
    ...materials.map((m) =>
      option(StockTargetKind.LfMaterial, m.id, m.name, Number(m.rollWidthMeters)),
    ),
    ...papers.map((p) => option(StockTargetKind.SheetPaper, p.id, p.name)),
    ...PRINT_PROCESSES.map((process) => option(StockTargetKind.Ink, process, `Ink · ${process}`)),
    ...garments.map((v) =>
      option(
        StockTargetKind.Garment,
        v.id,
        `${v.garmentProduct.name} ${v.garmentProduct.colorName} ${v.size}`,
      ),
    ),
    option(StockTargetKind.DtfFilm, DtfConsumable.Film, "DTF film"),
    option(StockTargetKind.DtfPowder, DtfConsumable.Powder, "DTF powder"),
  ];

  return options.sort((a, b) => a.name.localeCompare(b.name));
}
