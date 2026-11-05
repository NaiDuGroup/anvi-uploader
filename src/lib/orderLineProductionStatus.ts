import type { OrderStatus } from "@/lib/validations";

/**
 * Production status of one order line (`OrderLine.productionStatus`).
 *
 * Step 1 of the per-line status move: every line simply mirrors its order's
 * status through {@link lineStatusForOrderStatus} (kept in sync on every write
 * of `Order.status`, see `src/lib/orderLineStatusSync.ts`). Nothing reads it
 * yet. Later the production part of the order status is derived from the
 * lines ({@link deriveOrderProductionSummary}).
 *
 * - WAITING: not started (studio phase, or sent to the workshop and queued).
 * - NEEDS_LAYOUT: waits for a layout. Defined for step 2; never produced in step 1.
 * - PRINTING: being printed in the workshop.
 * - DONE: printed (ready, back in the studio or handed over).
 *
 * Pure and client-safe.
 */
export const LINE_PRODUCTION_STATUSES = ["WAITING", "NEEDS_LAYOUT", "PRINTING", "DONE"] as const;

export type LineProductionStatus = (typeof LINE_PRODUCTION_STATUSES)[number];

/** Database default of `OrderLine.productionStatus` (also for an unknown order status). */
export const DEFAULT_LINE_PRODUCTION_STATUS: LineProductionStatus = "WAITING";

const LINE_STATUS_BY_ORDER_STATUS = {
  NEW: "WAITING",
  IN_PROGRESS: "WAITING",
  SENT_TO_WORKSHOP: "WAITING",
  ISSUE: "WAITING",
  WORKSHOP_PRINTING: "PRINTING",
  WORKSHOP_READY: "DONE",
  READY_IN_STUDIO: "DONE",
  RETURNED_TO_STUDIO: "DONE",
  DELIVERED: "DONE",
} as const satisfies Record<OrderStatus, LineProductionStatus>;

export function isLineProductionStatus(value: unknown): value is LineProductionStatus {
  return typeof value === "string" && (LINE_PRODUCTION_STATUSES as readonly string[]).includes(value);
}

/**
 * The line production status an order status stands for. ISSUE maps to
 * WAITING for new lines and the backfill, but an order *moving* to ISSUE keeps
 * its lines as they are ({@link orderStatusKeepsLineStatuses}). Unknown → WAITING.
 */
export function lineStatusForOrderStatus(orderStatus: string): LineProductionStatus {
  return Object.prototype.hasOwnProperty.call(LINE_STATUS_BY_ORDER_STATUS, orderStatus)
    ? LINE_STATUS_BY_ORDER_STATUS[orderStatus as OrderStatus]
    : DEFAULT_LINE_PRODUCTION_STATUS;
}

/** An order going to this status leaves its lines' production statuses unchanged. */
export function orderStatusKeepsLineStatuses(orderStatus: string): boolean {
  return orderStatus === "ISSUE";
}

export interface OrderProductionSummary {
  /** Number of lines. */
  total: number;
  /** Lines per production status (every status present, 0 when none; unknown values count as WAITING). */
  counts: Record<LineProductionStatus, number>;
  /** Every line has the same status (null without lines). */
  uniform: LineProductionStatus | null;
  /** All lines DONE (false without lines). */
  allDone: boolean;
  /** At least one line started (PRINTING or DONE). */
  anyStarted: boolean;
}

/**
 * Production summary of an order from its lines, e.g. «1 из 3 ждёт макет» is
 * `counts.NEEDS_LAYOUT` of `total`. For step 2; not used in the UI yet.
 */
export function deriveOrderProductionSummary(
  lines: readonly { productionStatus: string }[],
): OrderProductionSummary {
  const counts: Record<LineProductionStatus, number> = { WAITING: 0, NEEDS_LAYOUT: 0, PRINTING: 0, DONE: 0 };
  for (const l of lines) {
    const s = isLineProductionStatus(l.productionStatus) ? l.productionStatus : DEFAULT_LINE_PRODUCTION_STATUS;
    counts[s] += 1;
  }
  const total = lines.length;
  const present = LINE_PRODUCTION_STATUSES.filter((s) => counts[s] > 0);
  return {
    total,
    counts,
    uniform: present.length === 1 ? present[0]! : null,
    allDone: total > 0 && counts.DONE === total,
    anyStarted: counts.PRINTING + counts.DONE > 0,
  };
}
