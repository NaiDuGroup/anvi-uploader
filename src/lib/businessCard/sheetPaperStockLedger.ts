/**
 * Sheet paper stock ledger — balance in sheets plus an audit movement per
 * change. Mirrors `lfRollStockLedger.ts` for rolls.
 */

import { Prisma as PrismaNs } from "@prisma/client";
import type { Tx } from "@/lib/largeFormat/lfRollStockLedger";
import type { SheetPaperStockKind } from "./sheetPaperStockKinds";

export type SheetPaperMovementAudit = {
  kind: SheetPaperStockKind;
  orderId?: string | null;
  orderNumber?: number | null;
  orderLineId?: string | null;
  paperCostMdl?: number | null;
  paperSellPriceMdl?: number | null;
  createdById?: string | null;
  note?: string | null;
};

function decimalSigned(n: number): PrismaNs.Decimal {
  return new PrismaNs.Decimal(String(n));
}

async function recordSheetPaperMovement(
  tx: Tx,
  sheetPaperId: string,
  quantitySheetsSigned: number,
  audit: SheetPaperMovementAudit,
): Promise<void> {
  await tx.sheetPaperStockMovement.create({
    data: {
      sheetPaperId,
      quantitySheets: decimalSigned(quantitySheetsSigned),
      kind: audit.kind,
      orderId: audit.orderId ?? undefined,
      orderNumber: audit.orderNumber ?? undefined,
      orderLineId: audit.orderLineId ?? undefined,
      paperCostMdl: audit.paperCostMdl ?? undefined,
      paperSellPriceMdl: audit.paperSellPriceMdl ?? undefined,
      note: audit.note ?? undefined,
      createdById: audit.createdById ?? undefined,
    },
  });
}

export async function tryDeductSheetPaperStock(
  tx: Tx,
  sheetPaperId: string,
  sheets: number,
  audit?: SheetPaperMovementAudit,
): Promise<{ ok: true } | { ok: false; available: number; requested: number }> {
  if (!(sheets > 0) || !Number.isFinite(sheets)) {
    return { ok: true };
  }
  const paper = await tx.sheetPaper.findUnique({ where: { id: sheetPaperId } });
  if (!paper) {
    return { ok: false, available: 0, requested: sheets };
  }
  const stock = Number(paper.stockSheets);
  if (stock + 1e-6 < sheets) {
    return { ok: false, available: stock, requested: sheets };
  }
  await tx.sheetPaper.update({
    where: { id: sheetPaperId },
    data: { stockSheets: { decrement: sheets } },
  });
  if (audit) {
    await recordSheetPaperMovement(tx, sheetPaperId, -sheets, audit);
  }
  return { ok: true };
}

export async function restoreSheetPaperStock(
  tx: Tx,
  sheetPaperId: string,
  sheets: number,
  audit?: SheetPaperMovementAudit,
): Promise<void> {
  if (!(sheets > 0) || !Number.isFinite(sheets)) return;
  await tx.sheetPaper.update({
    where: { id: sheetPaperId },
    data: { stockSheets: { increment: sheets } },
  });
  if (audit) {
    await recordSheetPaperMovement(tx, sheetPaperId, sheets, audit);
  }
}
