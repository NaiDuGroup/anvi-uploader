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
