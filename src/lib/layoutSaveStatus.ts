import type { OrderStatus } from "@/lib/validations";

/**
 * What saving a mug / notebook layout (`PATCH /api/admin/orders/[id]/mug-layout`,
 * `…/notebook-layout`) does to the order status.
 *
 * - Studio phase (NEW, IN_PROGRESS, ISSUE): the order goes (back) to IN_PROGRESS
 *   and the client's approval feedback is cleared — the new layout answers it.
 * - SENT_TO_WORKSHOP: kept as the «redo the layout before the workshop starts»
 *   rollback to IN_PROGRESS. Nothing is printed yet, the dealer may still edit it
 *   either way, and `isWorkshop` is left as is, so the public approval link
 *   does not re-open.
 * - Printing or later (WORKSHOP_PRINTING, WORKSHOP_READY, READY_IN_STUDIO,
 *   RETURNED_TO_STUDIO, DELIVERED) or an unknown status: the layout is saved but
 *   the status, `isWorkshop` and `approvalFeedback` stay untouched — rolling back
 *   would re-open dealer edit / cancel on an order already printed or handed over.
 *
 * Pure and client-safe.
 */
export const LAYOUT_SAVE_RESETS_STATUS = [
  "NEW",
  "IN_PROGRESS",
  "ISSUE",
  "SENT_TO_WORKSHOP",
] as const satisfies readonly OrderStatus[];

export interface LayoutSaveStatusChange {
  /** Fields to merge into the `order.update` data. Empty when the status stays. */
  orderData: { status?: "IN_PROGRESS"; approvalFeedback?: null };
  /** A `status_changed` log entry to write, or null. */
  log: { oldValue: string; newValue: "IN_PROGRESS" } | null;
}

export function layoutSaveStatusChange(currentStatus: string): LayoutSaveStatusChange {
  if (!(LAYOUT_SAVE_RESETS_STATUS as readonly string[]).includes(currentStatus)) {
    return { orderData: {}, log: null };
  }
  return {
    orderData: { status: "IN_PROGRESS", approvalFeedback: null },
    log: currentStatus === "IN_PROGRESS" ? null : { oldValue: currentStatus, newValue: "IN_PROGRESS" },
  };
}
