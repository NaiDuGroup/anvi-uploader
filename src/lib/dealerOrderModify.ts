import type { OrderStatus } from "@/lib/validations";

/**
 * Dealer self-service on own cabinet orders (stage 1): free edit / cancel
 * until printing starts, then fully locked. «Printing starts» = the order
 * status leaves the editable list OR any line is PRINTING / DONE. One rule for the server routes
 * (`PUT /api/cabinet/orders/[id]`, `POST …/cancel`) and the cabinet UI.
 *
 * Pure and client-safe: no Prisma, no server imports.
 */

/** Statuses in which the dealer may still change or cancel the order. */
export const DEALER_EDITABLE_STATUSES = [
  "NEW",
  "IN_PROGRESS",
  "SENT_TO_WORKSHOP",
  "ISSUE",
] as const satisfies readonly OrderStatus[];

/** The workshop is printing it: buttons stay visible but disabled, with the «write to the workshop» plaque. */
export const DEALER_LOCKED_PRINTING_STATUSES = ["WORKSHOP_PRINTING"] as const satisfies readonly OrderStatus[];

/**
 * Made, back in the studio or handed over: the buttons are hidden, only the
 * chat remains (anything else is an ordinary complaint, not an edit).
 */
export const DEALER_FINISHED_STATUSES = [
  "WORKSHOP_READY",
  "READY_IN_STUDIO",
  "RETURNED_TO_STUDIO",
  "DELIVERED",
] as const satisfies readonly OrderStatus[];

export interface DealerModifiableOrder {
  status: string;
  /**
   * The order's lines (`productionStatus`). Any PRINTING or DONE line locks
   * the order, whatever the order status says (an order-level ISSUE set while
   * a banner prints must not re-open edit / cancel). Pass them wherever the
   * order is checked; absent = no line information (legacy single-line order).
   */
  orderLines?: readonly { productionStatus: string }[];
  isPaid: boolean;
  deletedAt?: Date | string | null;
  cancelledAt?: Date | string | null;
  /** Storefront orders ("shop") are prepaid online and never dealer-editable. */
  source?: string | null;
}

/**
 * Line statuses that still allow a dealer edit / cancel: nothing produced yet.
 * NEEDS_LAYOUT is waiting for the dealer's own fix.
 */
export const DEALER_EDITABLE_LINE_STATUSES = ["WAITING", "NEEDS_LAYOUT"] as const;

/** Some line already prints or is printed (unknown line statuses count as started, to be safe). */
export function hasStartedLine(lines: readonly { productionStatus: string }[] | undefined): boolean {
  if (!lines) return false;
  return lines.some((l) => !(DEALER_EDITABLE_LINE_STATUSES as readonly string[]).includes(l.productionStatus));
}

/** Why the dealer cannot change the order; null when they can. */
export type DealerModifyBlock =
  | "cancelled"
  | "deleted"
  | "shop"
  | "paid"
  | "printing"
  | "finished"
  | "unknown_status";

export function dealerModifyBlockReason(order: DealerModifiableOrder): DealerModifyBlock | null {
  if (order.cancelledAt) return "cancelled";
  if (order.deletedAt) return "deleted";
  if (order.source === "shop") return "shop";
  if ((DEALER_FINISHED_STATUSES as readonly string[]).includes(order.status)) return "finished";
  if ((DEALER_LOCKED_PRINTING_STATUSES as readonly string[]).includes(order.status)) return "printing";
  if (!(DEALER_EDITABLE_STATUSES as readonly string[]).includes(order.status)) return "unknown_status";
  // Editable order status, but a line already prints / is printed (e.g. ISSUE
  // set on a mixed order while the banner prints): locked like printing.
  if (hasStartedLine(order.orderLines)) return "printing";
  // Paid orders are locked: an edit would change the price of money already taken.
  if (order.isPaid) return "paid";
  return null;
}

/** True when the dealer may edit or cancel the order (ownership is checked separately). */
export function canDealerModifyOrder(order: DealerModifiableOrder): boolean {
  return dealerModifyBlockReason(order) === null;
}

/**
 * What the cabinet order page shows the dealer:
 * - `editable`: «Изменить» + «Отменить заказ»;
 * - `locked`: both buttons disabled, plaque + «Написать цеху» (printing / paid);
 * - `hidden`: no buttons, only the chat (ready, delivered, cancelled).
 */
export type DealerOrderActionsState = "editable" | "locked" | "hidden";

export function dealerOrderActionsState(order: DealerModifiableOrder): DealerOrderActionsState {
  const block = dealerModifyBlockReason(order);
  if (block === null) return "editable";
  if (block === "printing" || block === "paid" || block === "unknown_status") return "locked";
  return "hidden";
}

/** Maximum length of the dealer's cancellation reason. */
export const DEALER_CANCEL_REASON_MAX = 500;
/** Minimum (trimmed) length: one meaningful word, not a stray character. */
export const DEALER_CANCEL_REASON_MIN = 3;
