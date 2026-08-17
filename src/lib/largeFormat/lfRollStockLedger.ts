import type { Prisma } from "@prisma/client";
import { Prisma as PrismaNs } from "@prisma/client";
import {
  getOrCreateInkInventory,
  invalidateInkInventory,
} from "@/lib/ink/inkInventory";
import type { InkStockKind } from "@/lib/ink/inkStockKinds";
import type { PrintProcess } from "@/lib/printProcess";
import { DEFAULT_PRINT_PROCESS } from "@/lib/printProcess";
import type { LfRollStockKind } from "@/lib/largeFormat/lfRollStockKinds";
export type Tx = Prisma.TransactionClient;

export type LfRollMovementAudit = {
  kind: LfRollStockKind;
  orderId?: string | null;
  orderNumber?: number | null;
  orderLineId?: string | null;
  materialCostMdl?: number | null;
  materialSellPriceMdl?: number | null;
  createdById?: string | null;
  note?: string | null;
};

export type InkMlMovementAudit = {
  kind: InkStockKind;
  orderId?: string | null;
  orderNumber?: number | null;
  orderLineId?: string | null;
  inkCostMdl?: number | null;
  inkSellPriceMdl?: number | null;
  createdById?: string | null;
  note?: string | null;
};

function decimalSigned(n: number): PrismaNs.Decimal {
  return new PrismaNs.Decimal(String(n));
}

async function recordLfRollMovement(
  tx: Tx,
  materialId: string,
  quantityLinearMetersSigned: number,
  audit: LfRollMovementAudit,
): Promise<void> {
  await tx.lfRollStockMovement.create({
    data: {
      materialId,
      quantityLinearMeters: decimalSigned(quantityLinearMetersSigned),
      kind: audit.kind,
      orderId: audit.orderId ?? undefined,
      orderNumber: audit.orderNumber ?? undefined,
      orderLineId: audit.orderLineId ?? undefined,
      materialCostMdl: audit.materialCostMdl ?? undefined,
      materialSellPriceMdl: audit.materialSellPriceMdl ?? undefined,
      note: audit.note ?? undefined,
      createdById: audit.createdById ?? undefined,
    },
  });
}

async function recordInkMovement(
  tx: Tx,
  inkInventoryId: PrintProcess,
  quantityMlSigned: number,
  audit: InkMlMovementAudit,
): Promise<void> {
  await tx.inkStockMovement.create({
    data: {
      inkInventoryId,
      quantityMl: decimalSigned(quantityMlSigned),
      kind: audit.kind,
      orderId: audit.orderId ?? undefined,
      orderNumber: audit.orderNumber ?? undefined,
      orderLineId: audit.orderLineId ?? undefined,
      inkCostMdl: audit.inkCostMdl ?? undefined,
      inkSellPriceMdl: audit.inkSellPriceMdl ?? undefined,
      note: audit.note ?? undefined,
      createdById: audit.createdById ?? undefined,
    },
  });
}

export async function tryDeductLfRollStock(
  tx: Tx,
  materialId: string,
  linearMeters: number,
  audit?: LfRollMovementAudit,
): Promise<{ ok: true } | { ok: false; available: number; requested: number }> {
  if (!(linearMeters > 0) || !Number.isFinite(linearMeters)) {
    return { ok: true };
  }
  const m = await tx.largeFormatMaterial.findUnique({ where: { id: materialId } });
  if (!m) {
    return { ok: false, available: 0, requested: linearMeters };
  }
  const stock = Number(m.stockLinearMeters);
  if (stock + 1e-6 < linearMeters) {
    return { ok: false, available: stock, requested: linearMeters };
  }
  await tx.largeFormatMaterial.update({
    where: { id: materialId },
    data: {
      stockLinearMeters: {
        decrement: linearMeters,
      },
    },
  });
  if (audit) {
    await recordLfRollMovement(tx, materialId, -linearMeters, audit);
  }
  return { ok: true };
}

/**
 * Deduct roll stock without the availability check — for recording prints
 * that already physically happened (e.g. a layout confirmed on a different
 * roll). The balance may go negative; the caller should surface a warning.
 * Returns the stock level *before* the deduction.
 */
export async function forceDeductLfRollStock(
  tx: Tx,
  materialId: string,
  linearMeters: number,
  audit?: LfRollMovementAudit,
): Promise<{ stockBefore: number }> {
  if (!(linearMeters > 0) || !Number.isFinite(linearMeters)) {
    return { stockBefore: 0 };
  }
  const m = await tx.largeFormatMaterial.findUniqueOrThrow({
    where: { id: materialId },
    select: { stockLinearMeters: true },
  });
  await tx.largeFormatMaterial.update({
    where: { id: materialId },
    data: {
      stockLinearMeters: { decrement: linearMeters },
    },
  });
  if (audit) {
    await recordLfRollMovement(tx, materialId, -linearMeters, audit);
  }
  return { stockBefore: Number(m.stockLinearMeters) };
}

export async function restoreLfRollStock(
  tx: Tx,
  materialId: string,
  linearMeters: number,
  audit?: LfRollMovementAudit,
): Promise<void> {
  if (!(linearMeters > 0) || !Number.isFinite(linearMeters)) return;
  await tx.largeFormatMaterial.update({
    where: { id: materialId },
    data: {
      stockLinearMeters: { increment: linearMeters },
    },
  });
  if (audit) {
    await recordLfRollMovement(tx, materialId, linearMeters, audit);
  }
}

export async function tryDeductInkMl(
  tx: Tx,
  inkMl: number,
  printProcess: PrintProcess = DEFAULT_PRINT_PROCESS,
  audit?: InkMlMovementAudit,
): Promise<{ ok: true } | { ok: false; available: number; requested: number }> {
  if (!(inkMl > 0) || !Number.isFinite(inkMl)) {
    return { ok: true };
  }
  await getOrCreateInkInventory(tx, printProcess);
  const inv = await tx.inkInventory.findUniqueOrThrow({
    where: { id: printProcess },
  });
  const stock = Number(inv.stockMl);
  if (stock + 1e-6 < inkMl) {
    return { ok: false, available: stock, requested: inkMl };
  }
  await tx.inkInventory.update({
    where: { id: printProcess },
    data: { stockMl: { decrement: inkMl } },
  });
  invalidateInkInventory(printProcess);
  if (audit) {
    await recordInkMovement(tx, printProcess, -inkMl, audit);
  }
  return { ok: true };
}

export async function restoreInkMl(
  tx: Tx,
  inkMl: number,
  printProcess: PrintProcess = DEFAULT_PRINT_PROCESS,
  audit?: InkMlMovementAudit,
): Promise<void> {
  if (!(inkMl > 0) || !Number.isFinite(inkMl)) return;
  await getOrCreateInkInventory(tx, printProcess);
  await tx.inkInventory.update({
    where: { id: printProcess },
    data: { stockMl: { increment: inkMl } },
  });
  invalidateInkInventory(printProcess);
  if (audit) {
    await recordInkMovement(tx, printProcess, inkMl, audit);
  }
}
