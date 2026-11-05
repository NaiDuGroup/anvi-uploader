import type { PrismaClient } from "@prisma/client";
import { lineStatusForOrderStatus, orderStatusKeepsLineStatuses } from "@/lib/orderLineProductionStatus";
import { deriveWorkshopOrderStatus, isWorkshopPhaseStatus } from "@/lib/orderStatusFromLines";

/**
 * Invariant check of the per-line production status (steps 1 + 2):
 * - workshop phase (SENT_TO_WORKSHOP / WORKSHOP_PRINTING / WORKSHOP_READY):
 *   the order status is derived from its lines, so `order.status ===
 *   deriveWorkshopOrderStatus(lines)` (rule `order_from_lines`);
 * - any other status: every line has `productionStatus ===
 *   lineStatusForOrderStatus(order.status)` (rule `lines_follow_order`);
 * - ISSUE orders are skipped — moving to ISSUE keeps the lines as they were.
 *
 * Soft-deleted orders are checked too. Read-only: runs in a READ ONLY
 * transaction, so it is safe against production. CLI:
 * `scripts/check-line-status-sync.ts`.
 */

export type LineStatusRule = "lines_follow_order" | "order_from_lines";

export interface LineStatusMismatch {
  orderId: string;
  orderNumber: number;
  orderStatus: string;
  deleted: boolean;
  rule: LineStatusRule;
  /**
   * `lines_follow_order`: the line status every line should have;
   * `order_from_lines`: the order status derived from the lines.
   */
  expected: string;
  /** `lines_follow_order`: the differing lines; `order_from_lines`: all lines. */
  lines: { id: string; sortOrder: number; productionStatus: string }[];
}

export interface LineStatusCheckResult {
  ordersChecked: number;
  linesChecked: number;
  /** ISSUE orders, not checked. */
  ordersSkipped: number;
  /** Of `ordersChecked`: workshop-phase orders checked by the derive rule. */
  ordersDerived: number;
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

/** Pure part: group rows (one per line) per order and check each order. */
export function findLineStatusMismatches(rows: readonly LineStatusRow[]): LineStatusCheckResult {
  const byOrder = new Map<string, LineStatusRow[]>();
  for (const r of rows) {
    const list = byOrder.get(r.orderId);
    if (list) list.push(r);
    else byOrder.set(r.orderId, [r]);
  }
  let ordersChecked = 0;
  let ordersSkipped = 0;
  let ordersDerived = 0;
  let linesChecked = 0;
  const mismatches: LineStatusMismatch[] = [];
  for (const orderRows of byOrder.values()) {
    const head = orderRows[0]!;
    if (orderStatusKeepsLineStatuses(head.orderStatus)) {
      ordersSkipped += 1;
      continue;
    }
    ordersChecked += 1;
    linesChecked += orderRows.length;
    const base = {
      orderId: head.orderId,
      orderNumber: head.orderNumber,
      orderStatus: head.orderStatus,
      deleted: head.deleted,
    };
    const toLine = (r: LineStatusRow) => ({ id: r.lineId, sortOrder: r.sortOrder, productionStatus: r.productionStatus });
    if (isWorkshopPhaseStatus(head.orderStatus)) {
      ordersDerived += 1;
      const derived = deriveWorkshopOrderStatus(orderRows);
      if (derived !== null && derived !== head.orderStatus) {
        const sorted = [...orderRows].sort((a, b) => a.sortOrder - b.sortOrder);
        mismatches.push({ ...base, rule: "order_from_lines", expected: derived, lines: sorted.map(toLine) });
      }
      continue;
    }
    const expected = lineStatusForOrderStatus(head.orderStatus);
    const bad = orderRows.filter((r) => r.productionStatus !== expected);
    if (bad.length > 0) mismatches.push({ ...base, rule: "lines_follow_order", expected, lines: bad.map(toLine) });
  }
  mismatches.sort((a, b) => a.orderNumber - b.orderNumber);
  return { ordersChecked, linesChecked, ordersSkipped, ordersDerived, mismatches };
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
