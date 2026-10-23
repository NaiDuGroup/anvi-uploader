import { Prisma } from "@prisma/client";
import { invalidateInkInventory } from "@/lib/ink/inkInventory";
import { isPrintProcess } from "@/lib/printProcess";
import { correctedAverageCost } from "@/lib/stock/correctReceiptCost";
import { StockTargetKind, type PostableStockTargetKind } from "./types";

type Tx = Prisma.TransactionClient;

/** A receipt entered by hand (often before the invoice) that no invoice line owns yet. */
export type UnlinkedReceipt = {
  id: string;
  quantity: number;
  totalCostMdl: number;
  purchasedAt: Date;
  isProvisional: boolean;
};

/** Pool state of a stock item: units on hand and their weighted-average cost. */
type StockPool = { stock: number; avgCost: number | null };

type ReceiptRow = {
  id: string;
  totalCostMdl: Prisma.Decimal | number;
  purchasedAt: Date;
  isProvisional: boolean;
};

type ReceiptStore = {
  findUnlinked(from: Date, to: Date): Promise<UnlinkedReceipt[]>;
  findOne(receiptId: string): Promise<UnlinkedReceipt | null>;
  /** Integer-MDL ledgers round the corrected total. */
  wholeMdl: boolean;
  updateReceipt(
    receiptId: string,
    data: { purchaseInvoiceLineId: string; totalCostMdl: number; amountsIncludeVat: boolean },
  ): Promise<void>;
  pool(): Promise<StockPool>;
  setAvg(avgCost: number): Promise<void>;
};

function toUnlinked(row: ReceiptRow, quantity: number): UnlinkedReceipt {
  return {
    id: row.id,
    quantity,
    totalCostMdl: Number(row.totalCostMdl),
    purchasedAt: row.purchasedAt,
    isProvisional: row.isProvisional,
  };
}

const RECEIPT_SELECT = {
  id: true,
  totalCostMdl: true,
  purchasedAt: true,
  isProvisional: true,
} as const;

function receiptStore(tx: Tx, kind: PostableStockTargetKind, targetId: string): ReceiptStore {
  const unlinked = (from: Date, to: Date) => ({
    purchaseInvoiceLineId: null,
    purchasedAt: { gte: from, lte: to },
  });

  switch (kind) {
    case StockTargetKind.Mug:
      return {
        wholeMdl: false,
        findUnlinked: async (from, to) =>
          (
            await tx.mugStockReceipt.findMany({
              where: { mugProductId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantity: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, r.quantity)),
        findOne: async (id) => {
          const r = await tx.mugStockReceipt.findFirst({
            where: { id, mugProductId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantity: true },
          });
          return r ? toUnlinked(r, r.quantity) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.mugStockReceipt.update({
            where: { id },
            data: { ...d, totalCostMdl: new Prisma.Decimal(d.totalCostMdl.toFixed(2)), isProvisional: false },
          });
        },
        pool: async () => {
          const p = await tx.mugProduct.findUniqueOrThrow({
            where: { id: targetId },
            select: { stockQuantity: true, avgPurchaseCost: true },
          });
          return { stock: p.stockQuantity, avgCost: p.avgPurchaseCost == null ? null : Number(p.avgPurchaseCost) };
        },
        setAvg: async (avg) => {
          await tx.mugProduct.update({
            where: { id: targetId },
            data: { avgPurchaseCost: new Prisma.Decimal(avg.toFixed(4)) },
          });
        },
      };
    case StockTargetKind.Notebook:
      return {
        wholeMdl: false,
        findUnlinked: async (from, to) =>
          (
            await tx.notebookStockReceipt.findMany({
              where: { notebookProductId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantity: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, r.quantity)),
        findOne: async (id) => {
          const r = await tx.notebookStockReceipt.findFirst({
            where: { id, notebookProductId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantity: true },
          });
          return r ? toUnlinked(r, r.quantity) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.notebookStockReceipt.update({
            where: { id },
            data: { ...d, totalCostMdl: new Prisma.Decimal(d.totalCostMdl.toFixed(2)), isProvisional: false },
          });
        },
        pool: async () => {
          const p = await tx.notebookProduct.findUniqueOrThrow({
            where: { id: targetId },
            select: { stockQuantity: true, avgPurchaseCost: true },
          });
          return { stock: p.stockQuantity, avgCost: p.avgPurchaseCost == null ? null : Number(p.avgPurchaseCost) };
        },
        setAvg: async (avg) => {
          await tx.notebookProduct.update({
            where: { id: targetId },
            data: { avgPurchaseCost: new Prisma.Decimal(avg.toFixed(4)) },
          });
        },
      };
    case StockTargetKind.Pen:
      return {
        wholeMdl: false,
        findUnlinked: async (from, to) =>
          (
            await tx.penStockReceipt.findMany({
              where: { penProductId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantity: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, r.quantity)),
        findOne: async (id) => {
          const r = await tx.penStockReceipt.findFirst({
            where: { id, penProductId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantity: true },
          });
          return r ? toUnlinked(r, r.quantity) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.penStockReceipt.update({
            where: { id },
            data: { ...d, totalCostMdl: new Prisma.Decimal(d.totalCostMdl.toFixed(2)), isProvisional: false },
          });
        },
        pool: async () => {
          const p = await tx.penProduct.findUniqueOrThrow({
            where: { id: targetId },
            select: { stockQuantity: true, avgPurchaseCost: true },
          });
          return { stock: p.stockQuantity, avgCost: p.avgPurchaseCost == null ? null : Number(p.avgPurchaseCost) };
        },
        setAvg: async (avg) => {
          await tx.penProduct.update({
            where: { id: targetId },
            data: { avgPurchaseCost: new Prisma.Decimal(avg.toFixed(4)) },
          });
        },
      };
    case StockTargetKind.LfMaterial:
      return {
        wholeMdl: true,
        findUnlinked: async (from, to) =>
          (
            await tx.lfRollStockReceipt.findMany({
              where: { materialId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantityLinearMeters: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, Number(r.quantityLinearMeters))),
        findOne: async (id) => {
          const r = await tx.lfRollStockReceipt.findFirst({
            where: { id, materialId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantityLinearMeters: true },
          });
          return r ? toUnlinked(r, Number(r.quantityLinearMeters)) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.lfRollStockReceipt.update({ where: { id }, data: { ...d, isProvisional: false } });
        },
        pool: async () => {
          const m = await tx.largeFormatMaterial.findUniqueOrThrow({
            where: { id: targetId },
            select: { stockLinearMeters: true, avgPurchaseCostPerLinearMeter: true },
          });
          return {
            stock: Number(m.stockLinearMeters),
            avgCost: m.avgPurchaseCostPerLinearMeter == null ? null : Number(m.avgPurchaseCostPerLinearMeter),
          };
        },
        setAvg: async (avg) => {
          await tx.largeFormatMaterial.update({
            where: { id: targetId },
            data: { avgPurchaseCostPerLinearMeter: new Prisma.Decimal(avg.toFixed(4)) },
          });
        },
      };
    case StockTargetKind.SheetPaper:
      return {
        wholeMdl: true,
        findUnlinked: async (from, to) =>
          (
            await tx.sheetPaperStockReceipt.findMany({
              where: { sheetPaperId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantitySheets: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, Number(r.quantitySheets))),
        findOne: async (id) => {
          const r = await tx.sheetPaperStockReceipt.findFirst({
            where: { id, sheetPaperId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantitySheets: true },
          });
          return r ? toUnlinked(r, Number(r.quantitySheets)) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.sheetPaperStockReceipt.update({ where: { id }, data: { ...d, isProvisional: false } });
        },
        pool: async () => {
          const s = await tx.sheetPaper.findUniqueOrThrow({
            where: { id: targetId },
            select: { stockSheets: true, avgPurchaseCostPerSheet: true },
          });
          return {
            stock: Number(s.stockSheets),
            avgCost: s.avgPurchaseCostPerSheet == null ? null : Number(s.avgPurchaseCostPerSheet),
          };
        },
        setAvg: async (avg) => {
          await tx.sheetPaper.update({
            where: { id: targetId },
            data: { avgPurchaseCostPerSheet: new Prisma.Decimal(avg.toFixed(4)) },
          });
        },
      };
    case StockTargetKind.Ink:
      return {
        wholeMdl: true,
        findUnlinked: async (from, to) =>
          (
            await tx.inkStockReceipt.findMany({
              where: { inkInventoryId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantityMl: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, Number(r.quantityMl))),
        findOne: async (id) => {
          const r = await tx.inkStockReceipt.findFirst({
            where: { id, inkInventoryId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantityMl: true },
          });
          return r ? toUnlinked(r, Number(r.quantityMl)) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.inkStockReceipt.update({ where: { id }, data: { ...d, isProvisional: false } });
        },
        pool: async () => {
          const inv = await tx.inkInventory.findUnique({
            where: { id: targetId },
            select: { stockMl: true, avgCostPerMl: true },
          });
          return { stock: Number(inv?.stockMl ?? 0), avgCost: inv ? Number(inv.avgCostPerMl) : null };
        },
        setAvg: async (avg) => {
          await tx.inkInventory.update({
            where: { id: targetId },
            data: { avgCostPerMl: new Prisma.Decimal(avg.toFixed(8)) },
          });
          if (isPrintProcess(targetId)) invalidateInkInventory(targetId);
        },
      };
    case StockTargetKind.Garment:
      return {
        wholeMdl: false,
        findUnlinked: async (from, to) =>
          (
            await tx.garmentStockReceipt.findMany({
              where: { garmentVariantId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantity: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, r.quantity)),
        findOne: async (id) => {
          const r = await tx.garmentStockReceipt.findFirst({
            where: { id, garmentVariantId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantity: true },
          });
          return r ? toUnlinked(r, r.quantity) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.garmentStockReceipt.update({
            where: { id },
            data: { ...d, totalCostMdl: new Prisma.Decimal(d.totalCostMdl.toFixed(2)), isProvisional: false },
          });
        },
        pool: async () => {
          const v = await tx.garmentVariant.findUniqueOrThrow({
            where: { id: targetId },
            select: { stockQuantity: true, avgPurchaseCost: true },
          });
          return { stock: v.stockQuantity, avgCost: v.avgPurchaseCost == null ? null : Number(v.avgPurchaseCost) };
        },
        setAvg: async (avg) => {
          await tx.garmentVariant.update({
            where: { id: targetId },
            data: { avgPurchaseCost: new Prisma.Decimal(avg.toFixed(4)) },
          });
        },
      };
    case StockTargetKind.DtfFilm:
    case StockTargetKind.DtfPowder:
      return {
        wholeMdl: false,
        findUnlinked: async (from, to) =>
          (
            await tx.dtfConsumableReceipt.findMany({
              where: { consumableId: targetId, ...unlinked(from, to) },
              select: { ...RECEIPT_SELECT, quantity: true },
              orderBy: { purchasedAt: "desc" },
            })
          ).map((r) => toUnlinked(r, Number(r.quantity))),
        findOne: async (id) => {
          const r = await tx.dtfConsumableReceipt.findFirst({
            where: { id, consumableId: targetId, purchaseInvoiceLineId: null },
            select: { ...RECEIPT_SELECT, quantity: true },
          });
          return r ? toUnlinked(r, Number(r.quantity)) : null;
        },
        updateReceipt: async (id, d) => {
          await tx.dtfConsumableReceipt.update({
            where: { id },
            data: { ...d, totalCostMdl: new Prisma.Decimal(d.totalCostMdl.toFixed(2)), isProvisional: false },
          });
        },
        pool: async () => {
          const c = await tx.dtfConsumableStock.findUnique({
            where: { id: targetId },
            select: { stockQuantity: true, avgCostPerUnit: true },
          });
          return { stock: Number(c?.stockQuantity ?? 0), avgCost: c ? Number(c.avgCostPerUnit) : null };
        },
        setAvg: async (avg) => {
          await tx.dtfConsumableStock.update({
            where: { id: targetId },
            data: { avgCostPerUnit: new Prisma.Decimal(avg.toFixed(8)) },
          });
        },
      };
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** Goods usually arrive (and get entered) before the invoice; allow a generous window. */
const LINK_WINDOW_BEFORE_DAYS = 45;
const LINK_WINDOW_AFTER_DAYS = 10;

/** Hand-entered receipts near the invoice date that could be the same delivery. */
export function findUnlinkedReceipts(
  tx: Tx,
  kind: PostableStockTargetKind,
  targetId: string,
  invoiceDate: Date,
): Promise<UnlinkedReceipt[]> {
  const from = new Date(invoiceDate.getTime() - LINK_WINDOW_BEFORE_DAYS * DAY_MS);
  const to = new Date(invoiceDate.getTime() + LINK_WINDOW_AFTER_DAYS * DAY_MS);
  return receiptStore(tx, kind, targetId).findUnlinked(from, to);
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
  },
): Promise<{ deltaMdl: number; quantity: number } | null> {
  const store = receiptStore(tx, params.kind, params.targetId);
  const receipt = await store.findOne(params.receiptId);
  if (!receipt) return null;

  const newTotal: number = store.wholeMdl ? Math.round(params.invoiceCostMdl) : params.invoiceCostMdl;
  const deltaMdl: number = newTotal - receipt.totalCostMdl;

  await store.updateReceipt(receipt.id, {
    purchaseInvoiceLineId: params.purchaseInvoiceLineId,
    totalCostMdl: newTotal,
    amountsIncludeVat: params.amountsIncludeVat,
  });

  if (Math.abs(deltaMdl) >= 0.005) {
    const pool = await store.pool();
    if (pool.avgCost != null) {
      await store.setAvg(
        correctedAverageCost({
          currentStock: pool.stock,
          currentAvgCost: pool.avgCost,
          receiptQuantity: receipt.quantity,
          deltaTotalMdl: deltaMdl,
        }),
      );
    }
  }
  return { deltaMdl, quantity: receipt.quantity };
}

/** Unit cost to book a provisional receipt at: current weighted average, else none. */
export async function lastKnownUnitCost(
  tx: Tx,
  kind: PostableStockTargetKind,
  targetId: string,
): Promise<number | null> {
  const pool = await receiptStore(tx, kind, targetId).pool();
  return pool.avgCost != null && pool.avgCost > 0 ? pool.avgCost : null;
}
