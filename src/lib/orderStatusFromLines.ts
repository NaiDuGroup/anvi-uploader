import type { OrderStatus } from "@/lib/validations";
import {
  DEFAULT_LINE_PRODUCTION_STATUS,
  isLineProductionStatus,
  type LineProductionStatus,
} from "@/lib/orderLineProductionStatus";

/**
 * Per-line production status, step 2: while an order is in the workshop phase
 * its `Order.status` is derived from its lines' `productionStatus`.
 *
 * - all lines WAITING → SENT_TO_WORKSHOP;
 * - all lines DONE → WORKSHOP_READY;
 * - anything else (any PRINTING, or a DONE + WAITING mix) → WORKSHOP_PRINTING.
 *
 * NEEDS_LAYOUT counts as WAITING for now (step 3 gives it a meaning).
 * Outside the workshop phase nothing is derived: the order status is set by
 * hand and the lines follow it (step 1, `orderLinesStatusSyncWrite`).
 *
 * Pure and client-safe.
 */

/** Order statuses whose value is derived from the lines. */
export const WORKSHOP_PHASE_STATUSES = [
  "SENT_TO_WORKSHOP",
  "WORKSHOP_PRINTING",
  "WORKSHOP_READY",
] as const satisfies readonly OrderStatus[];

export type WorkshopPhaseStatus = (typeof WORKSHOP_PHASE_STATUSES)[number];

/** Line statuses the line status API accepts. NEEDS_LAYOUT is reserved for step 3. */
export const SETTABLE_LINE_STATUSES = ["WAITING", "PRINTING", "DONE"] as const satisfies readonly LineProductionStatus[];

export type SettableLineStatus = (typeof SETTABLE_LINE_STATUSES)[number];

export function isWorkshopPhaseStatus(status: string): status is WorkshopPhaseStatus {
  return (WORKSHOP_PHASE_STATUSES as readonly string[]).includes(status);
}

export function isSettableLineStatus(value: unknown): value is SettableLineStatus {
  return typeof value === "string" && (SETTABLE_LINE_STATUSES as readonly string[]).includes(value);
}

/** Unknown values count as WAITING; NEEDS_LAYOUT counts as WAITING until step 3. */
function normalized(status: string): "WAITING" | "PRINTING" | "DONE" {
  const s = isLineProductionStatus(status) ? status : DEFAULT_LINE_PRODUCTION_STATUS;
  return s === "NEEDS_LAYOUT" ? "WAITING" : s;
}

/** A line not started yet (WAITING, or NEEDS_LAYOUT until step 3): new work for the workshop. */
export function isLineWaiting(status: string): boolean {
  return normalized(status) === "WAITING";
}

/** The workshop-phase order status a single line status stands for. */
export function orderStatusForLineStatus(status: string): WorkshopPhaseStatus {
  switch (normalized(status)) {
    case "WAITING":
      return "SENT_TO_WORKSHOP";
    case "PRINTING":
      return "WORKSHOP_PRINTING";
    case "DONE":
      return "WORKSHOP_READY";
  }
}

/**
 * Workshop-phase order status from the lines. Null without lines (nothing to
 * derive from; the stored status stays).
 */
export function deriveWorkshopOrderStatus(
  lines: readonly { productionStatus: string }[],
): WorkshopPhaseStatus | null {
  if (lines.length === 0) return null;
  let waiting = 0;
  let done = 0;
  for (const l of lines) {
    const s = normalized(l.productionStatus);
    if (s === "WAITING") waiting += 1;
    else if (s === "DONE") done += 1;
  }
  if (waiting === lines.length) return "SENT_TO_WORKSHOP";
  if (done === lines.length) return "WORKSHOP_READY";
  return "WORKSHOP_PRINTING";
}

/**
 * Whether a line's status may be set on its own. Only in the workshop phase:
 * studio-made orders (NEW / IN_PROGRESS / READY_IN_STUDIO) and orders past the
 * workshop (RETURNED_TO_STUDIO / DELIVERED) or in ISSUE keep the order-level
 * status, which their lines follow.
 */
export function canSetLineStatus(orderStatus: string): boolean {
  return isWorkshopPhaseStatus(orderStatus);
}

/**
 * What one line shows on the workshop board, in order-status words: in the
 * workshop phase the line's own status (WAITING → SENT_TO_WORKSHOP, …),
 * otherwise the order's status (RETURNED_TO_STUDIO, DELIVERED, ISSUE, …).
 */
export function boardLineStatus(orderStatus: string, lineStatus: string): string {
  return isWorkshopPhaseStatus(orderStatus) ? orderStatusForLineStatus(lineStatus) : orderStatus;
}
