"use client";

import { useSyncExternalStore } from "react";
import { trackShopEvent } from "./analytics";
import {
  CART_STORAGE_KEY,
  cartIsFull,
  cartReducer,
  cartRefuses,
  leanCart,
  parseCart,
  serializeCart,
  type CartAction,
  type CartLine,
} from "./cart";
import {
  LAST_ORDER_KEY,
  RECENT_ORDERS_KEY,
  applyPlacedOrder,
  applyRecentOrderChecks,
  parseRecentOrders,
  rememberRecentOrder,
  type RecentOrder,
  type RecentOrderCheck,
} from "./recentOrders";

/**
 * Browser cart store: `localStorage` + in-memory snapshot shared by the
 * header badge, product pages and the cart. Other tabs stay in sync through
 * the `storage` event. The server snapshot is always empty.
 */

const EMPTY: CartLine[] = [];
let lines: CartLine[] | null = null;
const listeners = new Set<() => void>();

function read(): CartLine[] {
  try {
    return parseCart(window.localStorage.getItem(CART_STORAGE_KEY));
  } catch {
    return [];
  }
}

function snapshot(): CartLine[] {
  if (lines == null) lines = read();
  return lines;
}

function emit() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === CART_STORAGE_KEY) {
      lines = read();
      emit();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The browser's storage is full (each browser names it its own way). */
export function isQuotaError(e: unknown): boolean {
  if (typeof DOMException === "undefined" || !(e instanceof DOMException)) return false;
  return e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014;
}

/**
 * Write `next` to `localStorage`: the lines as they are, else (storage full)
 * without the per-file thumbnails. `"full"`: not even that fits; `"off"`:
 * no storage at all (blocked) — the cart then lives for this page view.
 */
function writeCart(next: CartLine[]): { status: "ok" | "full" | "off"; lines: CartLine[] } {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(next));
    return { status: "ok", lines: next };
  } catch (e) {
    if (!isQuotaError(e)) return { status: "off", lines: next };
  }
  const lean: CartLine[] = leanCart(next);
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, serializeCart(lean));
    return { status: "ok", lines: lean };
  } catch (e) {
    return { status: isQuotaError(e) ? "full" : "off", lines: next };
  }
}

/**
 * Apply `action`. Returns false when a full cart refused a new line — the
 * «max N lines per order» notice is then shown (`useCartFullNotice`); callers
 * stay on their page instead of confirming «added». Also false when the
 * browser's storage cannot hold the added / edited line: the cart stays as it
 * was and «the cart does not fit in this browser» is shown (never a line that
 * silently disappears on the next page load).
 */
export function dispatchCart(action: CartAction): boolean {
  if (cartRefuses(snapshot(), action)) {
    showCartNotice("full");
    return false;
  }
  const next: CartLine[] = cartReducer(snapshot(), action);
  const saved = writeCart(next);
  if (saved.status === "full" && (action.type === "add" || action.type === "update")) {
    showCartNotice("storage");
    return false;
  }
  if (action.type === "add") trackShopEvent("add_to_cart", { product: action.line.slug });
  // Removing / editing quantities on a full storage: the change holds for this page view.
  lines = saved.lines;
  emit();
  return true;
}

/**
 * True when a new line would be refused (checked before an editor uploads its
 * print file); shows the notice too.
 */
export function refuseIfCartFull(): boolean {
  if (!cartIsFull(snapshot())) return false;
  showCartNotice("full");
  return true;
}

// ─── «Cart full» / «storage full» notice (rendered once in the shop layout) ──

/** `full`: 30 lines (one order's limit); `storage`: the browser's storage cannot hold the cart. */
export type CartNotice = "full" | "storage";
let notice: CartNotice | null = null;
const noticeListeners = new Set<() => void>();
let noticeTimer: ReturnType<typeof setTimeout> | null = null;

function showCartNotice(kind: CartNotice) {
  notice = kind;
  if (noticeTimer) clearTimeout(noticeTimer);
  // The storage notice asks the customer to act: it stays longer.
  noticeTimer = setTimeout(
    () => {
      notice = null;
      for (const l of noticeListeners) l();
    },
    kind === "storage" ? 15000 : 8000,
  );
  for (const l of noticeListeners) l();
}

export function hideCartFullNotice() {
  notice = null;
  for (const l of noticeListeners) l();
}

/** The notice showing, if any (survives client navigation, e.g. «Repetă comanda» → cart). */
export function useCartNotice(): CartNotice | null {
  return useSyncExternalStore(
    (l) => {
      noticeListeners.add(l);
      return () => noticeListeners.delete(l);
    },
    () => notice,
    () => null,
  );
}

/** Whether the «max N lines» notice is showing. */
export function useCartFullNotice(): boolean {
  return useCartNotice() === "full";
}

export function useCart(): CartLine[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** True after hydration (the cart is client-only; avoids an «empty cart» flash). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function noopSubscribe(): () => void {
  return () => {};
}

// ─── Recent orders («Comenzile mele») ────────────────────────────────────────

const EMPTY_ORDERS: RecentOrder[] = [];
let ordersCache: { raw: string | null; legacy: string | null; list: RecentOrder[] } | null = null;
const orderListeners = new Set<() => void>();

function readOrders(): RecentOrder[] {
  try {
    const raw = window.localStorage.getItem(RECENT_ORDERS_KEY);
    const legacy = window.localStorage.getItem(LAST_ORDER_KEY);
    if (ordersCache && ordersCache.raw === raw && ordersCache.legacy === legacy) return ordersCache.list;
    ordersCache = { raw, legacy, list: parseRecentOrders(raw, legacy) };
    return ordersCache.list;
  } catch {
    return EMPTY_ORDERS;
  }
}

function writeOrders(list: RecentOrder[]) {
  try {
    window.localStorage.setItem(RECENT_ORDERS_KEY, JSON.stringify(list));
    // The legacy key follows the list (a forgotten order must not come back from it).
    if (list[0]) window.localStorage.setItem(LAST_ORDER_KEY, list[0].token);
    else window.localStorage.removeItem(LAST_ORDER_KEY);
  } catch {
    /* ignore */
  }
  for (const l of orderListeners) l();
}

function subscribeOrders(listener: () => void): () => void {
  orderListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === RECENT_ORDERS_KEY || e.key === LAST_ORDER_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    orderListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** Remember an order seen on its page (no cart change). */
export function rememberOrder(token: string, number?: string | number | null) {
  writeOrders(rememberRecentOrder(readOrders(), { token, number, at: Date.now() }));
}

/** Forget orders the server does not know and fill in missing numbers (list order kept). */
export function applyOrderChecks(checks: readonly RecentOrderCheck[]) {
  if (checks.length === 0) return;
  const before = readOrders();
  const after = applyRecentOrderChecks(before, checks);
  const same = after.length === before.length && after.every((o, i) => o.number === before[i]!.number);
  if (!same) writeOrders(after);
}

/**
 * An order was created from the cart (paid or not yet): remember it and drop
 * exactly the lines that were sent with it — once per order.
 */
export function placeOrderFromCart(placed: { token: string; number?: string | number | null; lineIds: readonly string[] }) {
  // Re-read the cart: another tab may have changed it since this page loaded.
  lines = read();
  const out = applyPlacedOrder(lines, readOrders(), { ...placed, at: Date.now() });
  writeOrders(out.orders);
  if (out.cleared) dispatchCart({ type: "replace", lines: out.cart });
}

export function useRecentOrders(): RecentOrder[] {
  return useSyncExternalStore(subscribeOrders, readOrders, () => EMPTY_ORDERS);
}
