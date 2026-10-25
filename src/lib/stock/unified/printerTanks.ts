import type { Prisma, PrismaClient } from "@prisma/client";
import type { PrintProcess } from "@/lib/printProcess";
import { PrinterCode, PrinterSlotRole } from "./printerMath";
import { printerInkCostPerMl } from "./printers";

/**
 * Legacy-shaped ink «tank» summaries for screens and pricing that still speak
 * in print processes. Since stage 2 the numbers come from the printer's ink
 * slots (one stock variant per colour) instead of the old `InkInventory` rows.
 */

type Db = Prisma.TransactionClient | PrismaClient;

const PRINTER_BY_PROCESS: Record<PrintProcess, PrinterCode> = {
  large_format_roll: PrinterCode.LargeFormat,
  uv_rigid: PrinterCode.Uv,
  dtf_textile: PrinterCode.Dtf,
};

export function printerCodeForPrintProcess(process: PrintProcess): PrinterCode {
  return PRINTER_BY_PROCESS[process];
}

export type PrinterInkTank = {
  printProcess: PrintProcess;
  /** Total ink left over all colours (ml); may be negative until the next receipt. */
  stockMl: number;
  /** Share-weighted cost of one ml; 0 while no colour has a cost. */
  avgCostPerMl: number;
  updatedAt: Date;
};

/** Ink stock and blended cost of the printer behind a print process. */
export async function loadPrinterInkTank(db: Db, process: PrintProcess): Promise<PrinterInkTank> {
  const code: PrinterCode = printerCodeForPrintProcess(process);
  const [slots, costPerMl] = await Promise.all([
    db.printerSlot.findMany({
      where: { role: PrinterSlotRole.Ink, printer: { code, isActive: true }, variantId: { not: null } },
      select: { variant: { select: { id: true, stockQuantity: true, updatedAt: true } } },
    }),
    printerInkCostPerMl(db, code),
  ]);
  const variants = new Map<string, { stock: number; updatedAt: Date }>();
  for (const s of slots) {
    if (s.variant) {
      variants.set(s.variant.id, { stock: Number(s.variant.stockQuantity.toString()), updatedAt: s.variant.updatedAt });
    }
  }
  let stockMl = 0;
  let updatedAt = new Date(0);
  for (const v of variants.values()) {
    stockMl += v.stock;
    if (v.updatedAt > updatedAt) updatedAt = v.updatedAt;
  }
  return {
    printProcess: process,
    stockMl: Math.round(stockMl * 1000) / 1000,
    avgCostPerMl: costPerMl ?? 0,
    updatedAt,
  };
}
