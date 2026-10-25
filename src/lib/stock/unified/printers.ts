import type { Prisma, PrismaClient } from "@prisma/client";
import { consume, returnToStock, type StockTx } from "./ledger";
import { StockMovementKind } from "./kinds";
import { roundMdl, roundQty } from "./ledgerMath";
import {
  blendedInkCost,
  PrinterCode,
  PrinterSlotRole,
  splitByShares,
  tonerCostPerSheet,
  tonerForSheets,
  type SlotQuantity,
} from "./printerMath";

/**
 * Printer consumption on top of the unified ledger. Order code says how much a
 * printer used in total (ml of ink, metres of film, grams of powder, printed
 * sheets); the printer's slots decide which stock variants that comes from.
 */

type Db = Prisma.TransactionClient | PrismaClient;

type LoadedSlot = {
  id: string;
  label: string;
  role: string;
  variantId: string | null;
  share: number | null;
  sheetsPerUnit: number | null;
  unitCost: number | null;
};

function num(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value.toString());
}

/** Active printer's slots of one role, with each loaded variant's effective unit cost. */
export async function loadPrinterSlots(db: Db, code: PrinterCode, role: PrinterSlotRole): Promise<LoadedSlot[]> {
  const printer = await db.printer.findUnique({
    where: { code },
    select: {
      isActive: true,
      slots: {
        where: { role },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          label: true,
          role: true,
          variantId: true,
          share: true,
          sheetsPerUnit: true,
          variant: { select: { avgCost: true, purchaseCost: true } },
        },
      },
    },
  });
  if (!printer || !printer.isActive) return [];
  return printer.slots.map((s) => ({
    id: s.id,
    label: s.label,
    role: s.role,
    variantId: s.variantId,
    share: num(s.share),
    sheetsPerUnit: s.sheetsPerUnit,
    unitCost: s.variant ? (num(s.variant.avgCost) ?? num(s.variant.purchaseCost)) : null,
  }));
}

/** Blended cost of one ml of the printer's ink; null when no colour has a cost yet. */
export async function printerInkCostPerMl(db: Db, code: PrinterCode): Promise<number | null> {
  return blendedInkCost(await loadPrinterSlots(db, code, PrinterSlotRole.Ink));
}

/** Unit cost of the variant in a single-slot role (film per m, powder per g). */
export async function printerSlotUnitCost(
  db: Db,
  code: PrinterCode,
  role: PrinterSlotRole.Film | PrinterSlotRole.Powder,
): Promise<number | null> {
  const [slot] = await loadPrinterSlots(db, code, role);
  return slot?.unitCost ?? null;
}

/** Toner cost of one printed sheet (all colours); null until yields and costs are set. */
export async function printerTonerCostPerSheet(db: Db, code: PrinterCode = PrinterCode.Ricoh): Promise<number | null> {
  return tonerCostPerSheet(await loadPrinterSlots(db, code, PrinterSlotRole.Toner));
}

export type PrinterUse = {
  printerCode: PrinterCode;
  role: PrinterSlotRole;
  /** Ink: ml · film: linear m · powder: g · toner: printed sheets. */
  amount: number;
  orderId?: string | null;
  orderNumber?: number | null;
  orderLineId?: string | null;
  createdById: string | null;
};

export type PrinterUseResult = {
  /** What was taken from each slot variant. */
  lines: SlotQuantity[];
  /** Cost of what was taken; null when no taken variant has a cost. */
  costMdl: number | null;
};

function quantitiesForUse(use: PrinterUse, slots: LoadedSlot[]): SlotQuantity[] {
  switch (use.role) {
    case PrinterSlotRole.Ink:
      return splitByShares(use.amount, slots);
    case PrinterSlotRole.Toner:
      return tonerForSheets(use.amount, slots);
    case PrinterSlotRole.Film:
    case PrinterSlotRole.Powder: {
      const slot = slots.find((s) => s.variantId != null);
      return slot && use.amount > 0 ? [{ variantId: slot.variantId!, quantity: roundQty(use.amount) }] : [];
    }
  }
}

/**
 * Take a printer's use for an order from its slots. Consumables never block the
 * order: balances may go below zero. A printer with no loaded slots (or toner
 * without yields) takes nothing.
 */
export async function consumePrinterUse(tx: StockTx, use: PrinterUse): Promise<PrinterUseResult> {
  if (!(use.amount > 0)) return { lines: [], costMdl: null };
  const slots: LoadedSlot[] = await loadPrinterSlots(tx, use.printerCode, use.role);
  const lines: SlotQuantity[] = quantitiesForUse(use, slots);
  let cost = 0;
  let anyCost = false;
  for (const line of lines) {
    const r = await consume(tx, {
      variantId: line.variantId,
      quantity: line.quantity,
      allowNegative: true,
      orderId: use.orderId,
      orderNumber: use.orderNumber,
      orderLineId: use.orderLineId,
      createdById: use.createdById,
    });
    if (r.consumed && r.costMdl != null) {
      cost += r.costMdl;
      anyCost = true;
    }
  }
  return { lines, costMdl: anyCost ? roundMdl(cost) : null };
}

/**
 * SKU of the inactive item holding the old wide-format ink tank's history
 * (seeded by the printers migration). Orders placed before the switch hold
 * their ink there, so returns for the `lf` printer include it.
 */
export const LF_INK_ARCHIVE_SKU = "INK-LF-ARCHIVE";

/** Stock categories whose variants printers consume (see the printers migration). */
export const PRINTER_CONSUMABLE_CATEGORY_CODES: readonly string[] = ["ink", "toner", "dtf_film", "dtf_powder"];

type OrderReturnParams = {
  orderId: string;
  orderNumber?: number | null;
  orderLineIds?: readonly string[];
  createdById: string | null;
};

/** Return what the order still holds (sales minus returns) of the matched variants. */
async function returnOrderHoldings(
  tx: StockTx,
  variantWhere: Prisma.StockMovementWhereInput,
  params: OrderReturnParams,
): Promise<SlotQuantity[]> {
  const held = await tx.stockMovement.groupBy({
    by: ["variantId", "orderLineId"],
    where: {
      ...variantWhere,
      orderId: params.orderId,
      kind: { in: [StockMovementKind.OrderSale, StockMovementKind.OrderReturn, StockMovementKind.ProcurementBacklog] },
      ...(params.orderLineIds ? { orderLineId: { in: [...params.orderLineIds] } } : {}),
    },
    _sum: { delta: true },
  });

  const returned: SlotQuantity[] = [];
  for (const row of held) {
    const outstanding: number = roundQty(-Number(row._sum.delta?.toString() ?? "0"));
    if (outstanding <= 0) continue;
    await returnToStock(tx, {
      variantId: row.variantId,
      quantity: outstanding,
      orderId: params.orderId,
      orderNumber: params.orderNumber ?? null,
      orderLineId: row.orderLineId,
      createdById: params.createdById,
    });
    returned.push({ variantId: row.variantId, quantity: outstanding });
  }
  return returned;
}

/**
 * Put back everything an order still holds from the given printers' slots
 * (sales minus earlier returns), e.g. when the order is deleted. Safe to call twice.
 * Pass `orderLineIds` to limit it to some lines. For `lf` this includes the
 * wide-format ink archive, where orders from before the switch hold their ink.
 */
export async function returnPrinterUseForOrder(
  tx: StockTx,
  params: OrderReturnParams & { printerCodes: readonly PrinterCode[] },
): Promise<SlotQuantity[]> {
  const slotVariants = await tx.printerSlot.findMany({
    where: { printer: { code: { in: [...params.printerCodes] } }, variantId: { not: null } },
    select: { variantId: true },
  });
  const variantIds = new Set<string>(slotVariants.map((s) => s.variantId!));
  if (params.printerCodes.includes(PrinterCode.LargeFormat)) {
    const archive = await tx.stockVariant.findUnique({ where: { sku: LF_INK_ARCHIVE_SKU }, select: { id: true } });
    if (archive) variantIds.add(archive.id);
  }
  if (variantIds.size === 0) return [];
  return returnOrderHoldings(tx, { variantId: { in: [...variantIds] } }, params);
}

/**
 * Put back every printer consumable (ink, toner, DTF film / powder) the order
 * still holds, whichever variant it was taken from: current slot variants,
 * variants swapped out of a slot since, and the wide-format ink archive.
 * Idempotent, so every delete / edit / restore path may call it.
 */
export async function returnPrinterConsumablesForOrder(
  tx: StockTx,
  params: OrderReturnParams,
): Promise<SlotQuantity[]> {
  return returnOrderHoldings(
    tx,
    { variant: { item: { category: { code: { in: [...PRINTER_CONSUMABLE_CATEGORY_CODES] } } } } },
    params,
  );
}

export { PrinterCode, PrinterSlotRole } from "./printerMath";
