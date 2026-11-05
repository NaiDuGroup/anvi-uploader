import type { PrismaClient } from "@prisma/client";
import { lineStatusForOrderStatus, orderStatusKeepsLineStatuses } from "@/lib/orderLineProductionStatus";

/**
 * Invariant check of the per-line production status, step 1: every line of an
 * order (soft-deleted ones included) has `productionStatus ===
 * lineStatusForOrderStatus(order.status)`. ISSUE orders are skipped — moving to
 * ISSUE keeps the lines as they were. Read-only: runs in a READ ONLY
 * transaction, so it is safe against production. CLI:
 * `scripts/check-line-status-sync.ts`.
 */

export interface LineStatusMismatch {
  orderId: string;
  orderNumber: number;
  orderStatus: string;
  deleted: boolean;
  expected: string;
  /** Lines that differ: id, sort order, actual status. */
  lines: { id: string; sortOrder: number; productionStatus: string }[];
}

export interface LineStatusCheckResult {
  ordersChecked: number;
  linesChecked: number;
  /** ISSUE orders, not checked. */
  ordersSkipped: number;
  mismatches: LineStatusMismatch[];
}

export interface LineStatusRow {
  orderId: string;
  orderNumber: number;
  orderStatus: string;
  deleted: boolean;
  lineId: string;
  sortOrder: number;
  productionStatus: string;
}

/** Pure part: group rows (one per line) into per-order mismatches. */
export function findLineStatusMismatches(rows: readonly LineStatusRow[]): LineStatusCheckResult {
  const checked = new Set<string>();
  const skipped = new Set<string>();
  const byOrder = new Map<string, LineStatusMismatch>();
  let linesChecked = 0;
  for (const r of rows) {
    if (orderStatusKeepsLineStatuses(r.orderStatus)) {
      skipped.add(r.orderId);
      continue;
    }
    checked.add(r.orderId);
    linesChecked += 1;
    const expected = lineStatusForOrderStatus(r.orderStatus);
    if (r.productionStatus === expected) continue;
    let m = byOrder.get(r.orderId);
    if (!m) {
      m = {
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        orderStatus: r.orderStatus,
        deleted: r.deleted,
        expected,
        lines: [],
      };
      byOrder.set(r.orderId, m);
    }
    m.lines.push({ id: r.lineId, sortOrder: r.sortOrder, productionStatus: r.productionStatus });
  }
  const mismatches = [...byOrder.values()].sort((a, b) => a.orderNumber - b.orderNumber);
  return { ordersChecked: checked.size, linesChecked, ordersSkipped: skipped.size, mismatches };
}

/** Load every line with its order's status (read-only transaction) and check it. */
export async function checkLineStatusSync(
  db: Pick<PrismaClient, "$transaction">,
  opts: { orderIds?: readonly string[] } = {},
): Promise<LineStatusCheckResult> {
  const rows = await db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
    return tx.orderLine.findMany({
      where: opts.orderIds ? { orderId: { in: [...opts.orderIds] } } : undefined,
      select: {
        id: true,
        sortOrder: true,
        productionStatus: true,
        order: { select: { id: true, orderNumber: true, status: true, deletedAt: true } },
      },
    });
  });
  return findLineStatusMismatches(
    rows.map((l) => ({
      orderId: l.order.id,
      orderNumber: l.order.orderNumber,
      orderStatus: l.order.status,
      deleted: l.order.deletedAt != null,
      lineId: l.id,
      sortOrder: l.sortOrder,
      productionStatus: l.productionStatus,
    })),
  );
}
