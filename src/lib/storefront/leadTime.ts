import type { ShopT } from "./i18n";
import { lineMadeToOrderDays, type ShopLineLabels } from "./lineLabels";
import { psProduct } from "./printShop/config";
import type { ShopQuoteLine } from "./types";

/**
 * When an order is ready, in working days after payment: «1–2» (the studio's
 * usual), «6–7» (an option brought in for the order, +5) or «from 14» (a
 * print-shop product with its own lead time, e.g. invitations). The cart
 * promises the longest of its lines. Pure (client-safe, unit-tested).
 */
export interface ShopLeadTime {
  from: number;
  /** null: «from N working days» (no upper bound promised). */
  to: number | null;
}

/** The studio's usual lead time: 1–2 working days. */
export const SHOP_BASE_LEAD_TIME: ShopLeadTime = { from: 1, to: 2 };

/** The usual lead time plus `extraDays` (made to order). */
export function leadTimeWithExtra(extraDays: number | null | undefined): ShopLeadTime {
  const n: number = extraDays != null && extraDays > 0 ? extraDays : 0;
  return { from: SHOP_BASE_LEAD_TIME.from + n, to: SHOP_BASE_LEAD_TIME.to! + n };
}

/** The longer of lead times: the latest start and the latest end («from N» wins over a range ending before N). */
export function maxLeadTime(times: readonly ShopLeadTime[]): ShopLeadTime {
  if (times.length === 0) return SHOP_BASE_LEAD_TIME;
  const from: number = Math.max(...times.map((x) => x.from));
  if (times.some((x) => x.to == null)) return { from, to: null };
  return { from, to: Math.max(from, ...times.map((x) => x.to!)) };
}

/** Lead time of one cart / order line: a print-shop product's own, else 1–2 days (+N made to order). */
export function lineLeadTime(quote: ShopQuoteLine, labels: ShopLineLabels | null | undefined): ShopLeadTime {
  const times: ShopLeadTime[] = [leadTimeWithExtra(lineMadeToOrderDays(quote, labels))];
  if (quote.kind === "sheetShop") {
    const days: number | undefined = psProduct(quote.product)?.leadDays;
    if (days) times.push({ from: days, to: null });
  }
  return maxLeadTime(times);
}

/** The cart's (or order's) promise: the longest line. */
export function cartLeadTime(quotes: readonly ShopQuoteLine[], labels: ShopLineLabels | null | undefined): ShopLeadTime {
  return maxLeadTime(quotes.map((q) => lineLeadTime(q, labels)));
}

/** «✓ Gata în 6–7 zile lucrătoare» (product page), «… după plată.» (checkout), «Termen de execuție: …» (order page). */
export function leadTimeText(lead: ShopLeadTime, t: ShopT, where: "product" | "checkout" | "order"): string {
  if (lead.to == null) {
    const key = where === "product" ? "readyFromDays" : where === "checkout" ? "checkoutReadyFrom" : "orderReadyFrom";
    return t(key, { n: lead.from });
  }
  const key = where === "product" ? "readyInRange" : where === "checkout" ? "checkoutReadyRange" : "orderReadyRange";
  return t(key, { from: lead.from, n: lead.to });
}
