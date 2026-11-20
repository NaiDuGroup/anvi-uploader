import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { ORDER_HOLDING_KINDS, StockMovementKind } from "@/lib/stock/unified/kinds";
import { returnToStock } from "@/lib/stock/unified/ledger";
import { roundQty } from "@/lib/stock/unified/ledgerMath";
import { requireLfMaterialVariantId } from "@/lib/stock/unified/materials";
import { lfLineSheetLayout, lfLineStockQuantity, lfSheetPrintableCm } from "./lfSheet";
import { loadLfSheetSpecs } from "./lfSheetSpecs";
import { applyLfSheetPoolToLineData, planLfSheetPool } from "./lfSheetPool";
import type { LargeFormatLineData } from "./types";

const EPS = 1e-6;

export class SheetPoolError extends Error {
  constructor(
    readonly code:
      | "lines_not_found"
      | "mixed_materials"
      | "material_not_sheet"
      | "line_needs_layout"
      | "line_already_confirmed"
      | "sheets_too_few"
      | "invalid_sheets",
  ) {
    super(code);
  }
}

export type ConfirmSheetPoolResult = {
  /** All lines were confirmed before: nothing changed (safe retry). */
  alreadyConfirmed: boolean;
  /** N ≥ per-line sheets: nothing to give back, nothing recorded. */
  noSaving: boolean;
  poolSheets: number;
  naiveSheets: number;
  /** Whole sheets given back to stock by this confirm. */
  returnedSheets: number;
  orderNumbers: number[];
  stockAfter: number | null;
};

function ruSheetsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "лист";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "листа";
  return "листов";
}

/** Movement note: «Экономия раскладки: 2 листа вместо 3, заказы #12, #13». */
export function sheetPoolMovementNote(poolSheets: number, naiveSheets: number, orderNumbers: readonly number[]): string {
  const orders = orderNumbers.map((n) => `#${n}`).join(", ");
  return `Экономия раскладки: ${poolSheets} ${ruSheetsWord(poolSheets)} вместо ${naiveSheets}, заказы ${orders}`;
}

/**
 * Records inside `tx` that the workshop printed `orderLineIds` (one sheet
 * material) together on `poolSheets` whole sheets:
 *
 * - each line's area share of the pool goes to `largeFormatLineData.sheetPool`
 *   and its material cost / profit is re-based on it (sell prices untouched);
 * - whatever a line holds above its whole-sheet share goes back to stock as a
 *   `LAYOUT_POOL_RETURN` movement (per line, so a later cancel / delete of an
 *   order returns only what its lines still hold).
 *
 * Idempotent: lines confirmed once are never confirmed again (all confirmed →
 * no-op; a mix → `line_already_confirmed`). An order edit re-resolves its lines
 * and takes their own sheets again, which drops the pool for those lines.
 */
export async function confirmSheetPoolInTx(
  tx: Prisma.TransactionClient,
  params: { orderLineIds: readonly string[]; poolSheets: number; createdById: string | null },
): Promise<ConfirmSheetPoolResult> {
  const ids = [...new Set(params.orderLineIds)];
  if (!Number.isInteger(params.poolSheets) || params.poolSheets < 1) throw new SheetPoolError("invalid_sheets");

  await tx.$queryRaw`SELECT id FROM "order_lines" WHERE id = ANY(${ids}) FOR UPDATE`;

  const rows = await tx.orderLine.findMany({
    where: { id: { in: ids }, productType: "large_format_print", order: { deletedAt: null } },
    select: {
      id: true,
      largeFormatMaterialId: true,
      largeFormatLineData: true,
      productionStatus: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });
  if (rows.length !== ids.length) throw new SheetPoolError("lines_not_found");
  const materialIds = new Set(rows.map((r) => r.largeFormatMaterialId));
  if (materialIds.size !== 1) throw new SheetPoolError("mixed_materials");
  const materialId = rows[0]!.largeFormatMaterialId;
  if (!materialId) throw new SheetPoolError("material_not_sheet");
  const spec = (await loadLfSheetSpecs(tx, [materialId])).get(materialId);
  if (!spec) throw new SheetPoolError("material_not_sheet");
  if (rows.some((r) => r.productionStatus === "NEEDS_LAYOUT")) throw new SheetPoolError("line_needs_layout");

  const parsed = rows.map((r) => {
    const data = parseLargeFormatLineData(r.largeFormatLineData);
    if (!data) throw new SheetPoolError("lines_not_found");
    return { row: r, data };
  });

  const orderNumbers = [...new Set(rows.map((r) => r.order.orderNumber))].sort((a, b) => a - b);
  const confirmedCount = parsed.filter((p) => p.data.sheetPool).length;
  if (confirmedCount === parsed.length) {
    return {
      alreadyConfirmed: true,
      noSaving: false,
      poolSheets: params.poolSheets,
      naiveSheets: 0,
      returnedSheets: 0,
      orderNumbers,
      stockAfter: null,
    };
  }
  if (confirmedCount > 0) throw new SheetPoolError("line_already_confirmed");

  // Own sheets and printed area per line (gallery wrap included, as on the sheet).
  const inputs = parsed.map(({ row, data }) => {
    const layout = lfLineSheetLayout(data, spec);
    const wrap = Math.max(0, data.galleryWrapCm ?? 0);
    const area = (data.printWidthCm + 2 * wrap) * (data.printHeightCm + 2 * wrap) * Math.max(0, data.quantity);
    return { id: row.id, ownSheets: lfLineStockQuantity({ sheetLayout: layout }), area };
  });

  // The pool can't be smaller than the pieces' total area allows.
  const printable = lfSheetPrintableCm(spec);
  const printableArea = printable.widthCm * printable.heightCm;
  const totalArea = inputs.reduce((s, l) => s + l.area, 0);
  if (printableArea > 0 && params.poolSheets < Math.ceil(totalArea / printableArea - EPS)) {
    throw new SheetPoolError("sheets_too_few");
  }

  const plan = planLfSheetPool(inputs, params.poolSheets);
  const variantId: string = await requireLfMaterialVariantId(tx, materialId);
  if (!plan.ok) {
    if (plan.code === "no_saving") {
      return {
        alreadyConfirmed: false,
        noSaving: true,
        poolSheets: params.poolSheets,
        naiveSheets: inputs.reduce((s, l) => s + l.ownSheets, 0),
        returnedSheets: 0,
        orderNumbers,
        stockAfter: null,
      };
    }
    throw new SheetPoolError("invalid_sheets");
  }

  // What every line holds on the material's variant now (re-read after locking).
  const held = await tx.stockMovement.groupBy({
    by: ["orderLineId"],
    where: { orderLineId: { in: ids }, variantId, kind: { in: [...ORDER_HOLDING_KINDS] } },
    _sum: { delta: true },
  });
  const heldByLine = new Map(held.map((h) => [h.orderLineId, roundQty(-Number(h._sum.delta?.toString() ?? "0"))]));

  const poolId = randomUUID();
  const confirmedAt = new Date().toISOString();
  const note = sheetPoolMovementNote(params.poolSheets, plan.naiveSheets, orderNumbers);
  let returnedSheets = 0;
  for (const share of plan.lines) {
    const { row, data } = parsed.find((p) => p.row.id === share.id)!;
    const next: LargeFormatLineData = applyLfSheetPoolToLineData(data, {
      poolId,
      poolSheets: params.poolSheets,
      naiveSheets: plan.naiveSheets,
      orderNumbers,
      lineCount: plan.lines.length,
      ownSheets: share.ownSheets,
      shareSheets: share.shareSheets,
      stockSheets: share.stockSheets,
      confirmedAt,
      confirmedById: params.createdById,
    });
    await tx.orderLine.update({
      where: { id: row.id },
      data: { largeFormatLineData: next as unknown as Prisma.InputJsonValue },
    });
    // A line waiting for procurement holds less (or nothing): give back only what it holds
    // above its share; the backlog later takes just the share (`lfLineStockQuantityForMaterial`).
    const back: number = roundQty((heldByLine.get(row.id) ?? 0) - share.stockSheets);
    if (back > EPS) {
      await returnToStock(tx, {
        variantId,
        quantity: back,
        kind: StockMovementKind.LayoutPoolReturn,
        orderId: row.order.id,
        orderNumber: row.order.orderNumber,
        orderLineId: row.id,
        createdById: params.createdById,
        note,
      });
      returnedSheets = roundQty(returnedSheets + back);
    }
  }

  const after = await tx.stockVariant.findUniqueOrThrow({ where: { id: variantId }, select: { stockQuantity: true } });
  return {
    alreadyConfirmed: false,
    noSaving: false,
    poolSheets: params.poolSheets,
    naiveSheets: plan.naiveSheets,
    returnedSheets,
    orderNumbers,
    stockAfter: Number(after.stockQuantity.toString()),
  };
}
