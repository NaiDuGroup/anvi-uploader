import type { HistoryEntry } from "@/lib/orderHistoryFormat";
import { isAdmin } from "@/lib/roles";
import type { WorkshopBoardSection } from "./types";

/**
 * Who may open the «Весь заказ» panel: the same roles as the workshop board
 * page (`/admin/workshop-board`). Dealers / cabinet customers never have a
 * staff session; studio «admin» is sent to the orders list by the page.
 */
export function canOpenOrderOverview(role: string): boolean {
  return role === "workshop" || role === "superadmin";
}

/** Prices, payment state and money history: never for the workshop. */
export function canSeeOrderMoney(role: string): boolean {
  return role === "superadmin" || role === "admin";
}

/** The workshop sees workshop orders only (board scope); super admin any order. */
export function canViewOrderInOverview(role: string, order: { isWorkshop: boolean }): boolean {
  if (!canOpenOrderOverview(role)) return false;
  return role !== "workshop" || order.isWorkshop;
}

/** «Редактировать»: same rule as the orders list + wizard (staff, storefront orders are not editable). */
export function canEditOrderFromOverview(role: string, source: string): boolean {
  return isAdmin(role) && source !== "shop";
}

const MONEY_FIELDS = new Set(["price", "isPaid", "paidAt", "paymentStatus", "deliveryPriceMdl", "promoDiscountMdl"]);
const MONEY_ACTIONS = new Set(["payment_mismatch", "urgency_fee_waived"]);
/** Metadata keys that carry amounts (urgency `feeMdl` stays: the board shows the urgency fee badge too). */
const MONEY_META_KEY = /price|paid|payment|total|cost|profit|amount|debt|discount|sum/i;

function stripMoneyMeta(meta: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (MONEY_META_KEY.test(key)) continue;
    if (key === "changes" && Array.isArray(value)) {
      out.changes = value.filter(
        (c) => !(c && typeof c === "object" && (c as { kind?: unknown }).kind === "price"),
      );
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * History for the panel. For roles without money access, entries about prices
 * and payments are dropped and amounts removed from edits («dealer_edited»
 * keeps old/new price in `oldValue`/`newValue`).
 */
export function historyForRole(entries: readonly HistoryEntry[], role: string): HistoryEntry[] {
  if (canSeeOrderMoney(role)) return [...entries];
  const out: HistoryEntry[] = [];
  for (const e of entries) {
    if (MONEY_ACTIONS.has(e.action)) continue;
    if (e.action === "field_updated" && e.field && MONEY_FIELDS.has(e.field)) continue;
    const priceInValues = e.action === "dealer_edited";
    out.push({
      ...e,
      oldValue: priceInValues ? null : e.oldValue,
      newValue: priceInValues ? null : e.newValue,
      metadata: e.metadata ? stripMoneyMeta(e.metadata) : null,
    });
  }
  return out;
}

/** Orders list in a new tab, searched by the order number (`?q=`). */
export function ordersListSearchHref(orderNumber: number): string {
  return `/admin/orders?q=${encodeURIComponent(String(orderNumber))}`;
}

/** Which of the order's lines the board currently shows (by `orderLineId`). */
export function orderLinesOnBoard(sections: readonly WorkshopBoardSection[], orderId: string): Set<string> {
  const ids = new Set<string>();
  for (const s of sections) {
    for (const g of s.groups) {
      for (const l of g.lines) if (l.orderId === orderId) ids.add(l.orderLineId);
    }
  }
  return ids;
}
