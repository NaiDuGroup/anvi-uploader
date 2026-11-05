import type { Prisma } from "@prisma/client";
import {
  lineStatusForOrderStatus,
  orderStatusKeepsLineStatuses,
  type LineProductionStatus,
} from "@/lib/orderLineProductionStatus";
import { CLEARED_LAYOUT_ISSUE_FIELDS } from "@/lib/layoutIssue";
import { deriveWorkshopOrderStatus, isWorkshopPhaseStatus } from "@/lib/orderStatusFromLines";

/**
 * Keeps `OrderLine.productionStatus` in sync with `Order.status` (step 1 of
 * the per-line production status; see `src/lib/orderLineProductionStatus.ts`).
 *
 * Every write of `Order.status` goes through one of these:
 * - {@link orderLinesStatusSyncWrite}: nested write merged into the same
 *   `order.update({ data })` (Prisma runs it in one transaction). There is no
 *   bulk `order.updateMany` of `status` today; a new one must sync its lines
 *   in the same transaction too;
 * - {@link newLineProductionFields}: lines created on an existing order.
 *
 * An order going to ISSUE leaves its lines as they are. «Нужен макет»
 * (NEEDS_LAYOUT) lines are never moved by an order-level write: in the workshop
 * phase they keep their status and flag ({@link planOrderStatusWrite}), and a
 * status outside the workshop phase is refused while any line is flagged.
 */

/** `productionStatus` of a line created on an order whose status is `orderStatus`. */
export function newLineProductionFields(orderStatus: string): { productionStatus: LineProductionStatus } {
  return { productionStatus: lineStatusForOrderStatus(orderStatus) };
}

export interface OrderLinesStatusSyncWrite {
  orderLines?: {
    updateMany: {
      where: Prisma.OrderLineScalarWhereInput;
      data: Prisma.OrderLineUncheckedUpdateManyWithoutOrderInput;
    };
  };
}

/**
 * Nested `orderLines` write to spread into an `order.update({ data })` that
 * may set `status`. Empty when no status is written (`undefined`), or the
 * order goes to ISSUE. Only lines whose status actually changes get a new
 * `productionStatusAt`. «Нужен макет» (NEEDS_LAYOUT) lines are left alone —
 * status and flag (callers outside the workshop phase must refuse the write
 * first, see {@link planOrderStatusWrite}).
 */
export function orderLinesStatusSyncWrite(
  newOrderStatus: unknown,
  at: Date = new Date(),
): OrderLinesStatusSyncWrite {
  if (typeof newOrderStatus !== "string" || orderStatusKeepsLineStatuses(newOrderStatus)) return {};
  const productionStatus = lineStatusForOrderStatus(newOrderStatus);
  return {
    orderLines: {
      updateMany: {
        where: { productionStatus: { notIn: [productionStatus, "NEEDS_LAYOUT"] } },
        data: { productionStatus, productionStatusAt: at, ...CLEARED_LAYOUT_ISSUE_FIELDS },
      },
    },
  };
}

export type OrderStatusWritePlan =
  /** Refused: these lines wait for a layout and the target is outside the workshop phase. */
  | { ok: false; needsLayoutLineIds: string[] }
  /**
   * Allowed: store `status` (in the workshop phase the one derived from the
   * lines after the write, which may differ from the requested one);
   * `keptLineIds` are the NEEDS_LAYOUT lines the write leaves as they are.
   */
  | { ok: true; status: string; keptLineIds: string[] };

/**
 * What an order-level status write (`PATCH /api/orders/[id]`, layout save
 * roll-back, …) may do to an order with these lines. Pure.
 *
 * - ISSUE: allowed as requested, lines untouched;
 * - workshop phase: every line but NEEDS_LAYOUT ones follows the target; the
 *   stored status is derived from the resulting lines (NEEDS_LAYOUT counts as
 *   WAITING, so e.g. WORKSHOP_READY with a flagged line → WORKSHOP_PRINTING);
 * - any other status: refused while a line is NEEDS_LAYOUT.
 */
export function planOrderStatusWrite(
  requestedStatus: string,
  lines: readonly { id: string; productionStatus: string }[],
): OrderStatusWritePlan {
  if (orderStatusKeepsLineStatuses(requestedStatus)) return { ok: true, status: requestedStatus, keptLineIds: [] };
  const flagged = lines.filter((l) => l.productionStatus === "NEEDS_LAYOUT").map((l) => l.id);
  if (!isWorkshopPhaseStatus(requestedStatus)) {
    return flagged.length > 0
      ? { ok: false, needsLayoutLineIds: flagged }
      : { ok: true, status: requestedStatus, keptLineIds: [] };
  }
  const target = lineStatusForOrderStatus(requestedStatus);
  const next = lines.map((l) => ({
    productionStatus: l.productionStatus === "NEEDS_LAYOUT" ? l.productionStatus : target,
  }));
  return { ok: true, status: deriveWorkshopOrderStatus(next) ?? requestedStatus, keptLineIds: flagged };
}
