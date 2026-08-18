import { round2 } from "./money";

/**
 * Per-client order/debt aggregates for the admin clients registry.
 *
 * Debt is defined exactly like the client cabinet's "De plată" figure
 * (`OrdersListClient.tsx`): the sum of `Order.price` over non-deleted orders
 * with `isPaid = false`. Orders without a price cannot contribute money but
 * are still counted so the admin can see they need attention.
 */
export interface ClientDebtTotals {
  /** All non-deleted orders of the client. */
  ordersCount: number;
  /** Non-deleted unpaid orders (including ones without a price). */
  unpaidCount: number;
  /** Sum of prices of unpaid orders, MDL. Matches the cabinet's "De plată". */
  unpaidTotalMdl: number;
}

export interface ClientOrdersCountRow {
  clientId: string | null;
  count: number;
}

export interface ClientUnpaidRow {
  clientId: string | null;
  count: number;
  /** SUM(price) over unpaid orders; null when every unpaid order has no price. */
  sumMdl: number | null;
}

export const EMPTY_CLIENT_DEBT: ClientDebtTotals = {
  ordersCount: 0,
  unpaidCount: 0,
  unpaidTotalMdl: 0,
};

/**
 * Merge the two `groupBy(clientId)` result sets (all orders / unpaid orders)
 * into a per-client totals map. Rows with a null clientId (orders not linked
 * to a registry client) are ignored.
 */
export function mergeClientOrderAggregates(
  totals: readonly ClientOrdersCountRow[],
  unpaid: readonly ClientUnpaidRow[],
): Map<string, ClientDebtTotals> {
  const out = new Map<string, ClientDebtTotals>();
  for (const row of totals) {
    if (row.clientId === null) continue;
    out.set(row.clientId, { ...EMPTY_CLIENT_DEBT, ordersCount: row.count });
  }
  for (const row of unpaid) {
    if (row.clientId === null) continue;
    const base = out.get(row.clientId) ?? { ...EMPTY_CLIENT_DEBT };
    out.set(row.clientId, {
      ...base,
      unpaidCount: row.count,
      unpaidTotalMdl: round2(row.sumMdl ?? 0),
    });
  }
  return out;
}
