import type { ShopOrderView } from "./orderStatus";
import { cartReducer, type CartLine } from "./cart";

/**
 * «Comenzile mele»: the last few storefront orders placed from this browser
 * (`localStorage`), and the cart clean-up after an order. Pure (unit-tested);
 * `cartStore.ts` wraps it.
 *
 * Clearing the cart after an order happens exactly once per order and only
 * removes the lines that were sent with it — a line added afterwards (in this
 * tab or another one, before or after the payment page) is never lost.
 */

export const RECENT_ORDERS_KEY = "anvi_shop_orders_v1";
/** Older single-token key (kept in sync for pages that still read it). */
export const LAST_ORDER_KEY = "anvi_shop_last_order";
export const RECENT_ORDERS_MAX = 5;

export interface RecentOrder {
  token: string;
  /** Order number when known («1234»). */
  number: string | null;
  /** When it was placed / first seen here (ms). */
  at: number;
  /** The cart lines of this order were removed from the cart (once). */
  cleared?: boolean;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === "object" && !Array.isArray(v);
}

/** Stored list (newest first); a legacy single token becomes a one-entry list. */
export function parseRecentOrders(raw: string | null | undefined, legacyToken?: string | null): RecentOrder[] {
  let list: RecentOrder[] = [];
  if (raw) {
    try {
      const data: unknown = JSON.parse(raw);
      if (Array.isArray(data)) {
        list = data
          .filter((o): o is Record<string, unknown> => isObj(o) && typeof o.token === "string" && o.token.length > 0 && o.token.length <= 64)
          .map((o) => ({
            token: o.token as string,
            number: typeof o.number === "string" || typeof o.number === "number" ? String(o.number) : null,
            at: typeof o.at === "number" ? o.at : 0,
            ...(o.cleared === true ? { cleared: true } : {}),
          }));
      }
    } catch {
      list = [];
    }
  }
  if (legacyToken && !list.some((o) => o.token === legacyToken)) {
    list.push({ token: legacyToken, number: null, at: 0 });
  }
  return list.slice(0, RECENT_ORDERS_MAX);
}

/** Add or refresh an order (newest first, at most {@link RECENT_ORDERS_MAX}); keeps its `cleared` flag. */
export function rememberRecentOrder(
  list: readonly RecentOrder[],
  entry: { token: string; number?: string | number | null; at: number },
): RecentOrder[] {
  const prev = list.find((o) => o.token === entry.token);
  const next: RecentOrder = {
    token: entry.token,
    number: entry.number != null && entry.number !== "" ? String(entry.number) : (prev?.number ?? null),
    at: prev?.at || entry.at,
    ...(prev?.cleared ? { cleared: true } : {}),
  };
  return [next, ...list.filter((o) => o.token !== entry.token)].slice(0, RECENT_ORDERS_MAX);
}

/**
 * An order was just created from the cart: remember it and remove ITS lines
 * from the cart — exactly once (a second call for the same order, e.g. a
 * re-render or a second tab, changes nothing in the cart).
 */
export function applyPlacedOrder(
  cart: readonly CartLine[],
  orders: readonly RecentOrder[],
  placed: { token: string; number?: string | number | null; lineIds: readonly string[]; at: number },
): { cart: CartLine[]; orders: RecentOrder[]; cleared: boolean } {
  const already: boolean = orders.some((o) => o.token === placed.token && o.cleared);
  const remembered = rememberRecentOrder(orders, placed).map((o) => (o.token === placed.token ? { ...o, cleared: true } : o));
  if (already) return { cart: [...cart], orders: remembered, cleared: false };
  return { cart: cartReducer([...cart], { type: "removeIds", ids: placed.lineIds }), orders: remembered, cleared: true };
}

/** What `GET /api/shop/order/[token]` said about a remembered order. */
export type RecentOrderCheck = { token: string; found: false } | { token: string; found: true; number: string | number };

/**
 * Apply the server's answers: an order it does not know (404 — deleted, a
 * studio order, a stale token) is forgotten; a found one gets its number.
 * The list order is kept.
 */
export function applyRecentOrderChecks(list: readonly RecentOrder[], checks: readonly RecentOrderCheck[]): RecentOrder[] {
  const byToken = new Map(checks.map((c) => [c.token, c]));
  const out: RecentOrder[] = [];
  for (const o of list) {
    const c = byToken.get(o.token);
    if (c && !c.found) continue;
    out.push(c?.found && String(c.number) ? { ...o, number: String(c.number) } : o);
  }
  return out;
}

/** «Comenzile mele» shows only orders with a number (an entry without one is not checked yet or stale). */
export function visibleRecentOrders(list: readonly RecentOrder[]): RecentOrder[] {
  return list.filter((o) => o.number != null && o.number !== "");
}

/** Status + amount of a remembered order, from its status answer (shown in «Comenzile mele»). */
export type RecentOrderInfo = { status: ShopOrderView["status"]; total: number };

const ORDER_STATUSES: ReadonlySet<string> = new Set(["pending_payment", "paid", "in_production", "shipped", "delivered", "issue"]);

/** Status + amount from `GET /api/shop/order/[token]`; null when either is missing. */
export function orderInfo(body: { status?: unknown; total?: unknown } | null): RecentOrderInfo | null {
  if (!body || typeof body.status !== "string" || !ORDER_STATUSES.has(body.status)) return null;
  if (typeof body.total !== "number" || !Number.isFinite(body.total)) return null;
  return { status: body.status as ShopOrderView["status"], total: body.total };
}
