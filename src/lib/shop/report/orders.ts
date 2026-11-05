import { round2 } from "@/lib/money";
import { isShopTestOrder } from "@/lib/shop/orderFlags";
import type { ShopLineProductRef } from "@/lib/shop/lineProduct";
import { bucketKey, dayKeyOf, periodBuckets, toCsv, type ShopReportGranularity } from "./period";

/**
 * Admin report «Сайт: заказы и воронка» — orders part. Pure aggregation over
 * storefront orders already loaded for the period (see `ordersServer.ts`).
 *
 * - Test orders (`isShopTestOrder`: provider 'test' / «[ТЕСТ сайт]») are left
 *   out unless `includeTest`; deleted orders never reach here (the loader
 *   filters `deletedAt`, and `aggregate` drops any that slip through).
 * - Paid = online payment confirmed (`paymentStatus='paid'`) or marked paid by
 *   staff (`isPaid`). Revenue = Σ `Order.price` of paid orders: lines +
 *   delivery − promo discount, i.e. what the customer paid.
 * - New vs returning: per customer (account id, else e-mail) with a paid
 *   order in the period; returning = a paid order before the period.
 */

type Decimalish = { toString(): string } | number | null | undefined;

export interface ShopReportOrderRow {
  id: string;
  orderNumber: number;
  createdAt: Date;
  source: string;
  price: Decimalish;
  isPaid: boolean;
  paymentStatus: string;
  paymentProvider: string | null;
  notes: string | null;
  deletedAt?: Date | null;
  deliveryMethod: string | null;
  deliveryPriceMdl?: Decimalish;
  shopCustomerId: string | null;
  customerEmail: string | null;
  promoCode?: string | null;
  promoDiscountMdl?: Decimalish;
  orderLines: { shopLineData: unknown }[];
}

export interface ShopReportBucket {
  key: string;
  orders: number;
  paid: number;
  unpaid: number;
  revenue: number;
  aov: number;
}

export interface ShopReportDeliveryRow {
  method: string;
  orders: number;
  paid: number;
  revenue: number;
}

export interface ShopReportProductRow {
  slug: string;
  name: string;
  category: string | null;
  qty: number;
  lines: number;
  /** Σ line totals at cart prices (before the promo discount). */
  amount: number;
}

export interface ShopReportCategoryRow {
  category: string | null;
  qty: number;
  lines: number;
  amount: number;
}

export interface ShopOrdersReport {
  from: string;
  to: string;
  includeTest: boolean;
  summary: {
    orders: number;
    paid: number;
    unpaid: number;
    revenue: number;
    aov: number;
    unpaidAmount: number;
    discount: number;
    promoOrders: number;
    testOrders: number;
  };
  series: Record<ShopReportGranularity, ShopReportBucket[]>;
  delivery: ShopReportDeliveryRow[];
  customers: { new: number; returning: number; newRevenue: number; returningRevenue: number; unknown: number };
  topProducts: ShopReportProductRow[];
  topCategories: ShopReportCategoryRow[];
}

export interface ShopReportOptions {
  from: string;
  to: string;
  includeTest?: boolean;
  /** Customer keys (`id:<account>` / `email:<address>`) with a paid order before the period. */
  priorPaidKeys?: ReadonlySet<string>;
  resolveLine?: (quote: unknown) => ShopLineProductRef | null;
  productNames?: Readonly<Record<string, string>>;
  topN?: number;
}

function num(v: Decimalish): number {
  if (v == null) return 0;
  const n = typeof v === "number" ? v : Number(v.toString());
  return Number.isFinite(n) ? n : 0;
}

export function isReportPaid(o: Pick<ShopReportOrderRow, "isPaid" | "paymentStatus">): boolean {
  return o.paymentStatus === "paid" || o.isPaid;
}

/** Whether an order belongs in the report at all (shop, not deleted, test only when asked). */
export function isReportableShopOrder(
  o: Pick<ShopReportOrderRow, "source" | "paymentProvider" | "notes" | "deletedAt">,
  includeTest: boolean,
): boolean {
  if (o.source !== "shop" || o.deletedAt) return false;
  return includeTest || !isShopTestOrder(o);
}

/** Keys identifying a storefront customer: the account id and / or the e-mail. */
export function customerKeys(o: Pick<ShopReportOrderRow, "shopCustomerId" | "customerEmail">): string[] {
  const keys: string[] = [];
  if (o.shopCustomerId) keys.push(`id:${o.shopCustomerId}`);
  const email = o.customerEmail?.trim().toLowerCase();
  if (email) keys.push(`email:${email}`);
  return keys;
}

function emptyBucket(key: string): ShopReportBucket {
  return { key, orders: 0, paid: 0, unpaid: 0, revenue: 0, aov: 0 };
}

const DELIVERY_ORDER = ["pickup", "courier_chisinau", "courier_moldova"];

export function aggregateShopOrders(rows: readonly ShopReportOrderRow[], opts: ShopReportOptions): ShopOrdersReport {
  const includeTest = opts.includeTest === true;
  const topN = opts.topN ?? 15;
  const all = rows.filter((o) => o.source === "shop" && !o.deletedAt);
  const testOrders = all.filter((o) => isShopTestOrder(o)).length;
  const orders = all.filter((o) => isReportableShopOrder(o, includeTest));

  const series = {} as Record<ShopReportGranularity, ShopReportBucket[]>;
  const maps = {} as Record<ShopReportGranularity, Map<string, ShopReportBucket>>;
  for (const g of ["day", "week", "month"] as const) {
    const keys = periodBuckets(opts.from, opts.to, g);
    maps[g] = new Map(keys.map((k) => [k, emptyBucket(k)]));
  }

  let paid = 0;
  let revenue = 0;
  let unpaidAmount = 0;
  let discount = 0;
  let promoOrders = 0;
  const delivery = new Map<string, ShopReportDeliveryRow>();
  const products = new Map<string, ShopReportProductRow>();
  const categories = new Map<string, ShopReportCategoryRow>();
  /** Customer (first key) → { returning, revenue }. */
  const customers = new Map<string, { returning: boolean; revenue: number }>();
  let unknownCustomers = 0;

  for (const o of orders) {
    const price = num(o.price);
    const isPaid = isReportPaid(o);
    const day = dayKeyOf(o.createdAt);
    for (const g of ["day", "week", "month"] as const) {
      const k = bucketKey(day, g);
      const b = maps[g].get(k) ?? emptyBucket(k);
      maps[g].set(k, b);
      b.orders += 1;
      if (isPaid) {
        b.paid += 1;
        b.revenue += price;
      } else b.unpaid += 1;
    }
    const method = o.deliveryMethod && DELIVERY_ORDER.includes(o.deliveryMethod) ? o.deliveryMethod : "other";
    const d = delivery.get(method) ?? { method, orders: 0, paid: 0, revenue: 0 };
    delivery.set(method, d);
    d.orders += 1;
    if (!isPaid) {
      unpaidAmount += price;
      continue;
    }
    paid += 1;
    revenue += price;
    d.paid += 1;
    d.revenue += price;
    const disc = num(o.promoDiscountMdl);
    if (o.promoCode && disc > 0) {
      promoOrders += 1;
      discount += disc;
    }

    const keys = customerKeys(o);
    if (keys.length === 0) unknownCustomers += 1;
    else {
      const known = keys.find((k) => customers.has(k));
      const id = known ?? keys[0]!;
      const c = customers.get(id) ?? { returning: keys.some((k) => opts.priorPaidKeys?.has(k) ?? false), revenue: 0 };
      c.revenue += price;
      for (const k of keys) customers.set(k, c);
    }

    for (const l of o.orderLines) {
      const data = l.shopLineData && typeof l.shopLineData === "object" ? (l.shopLineData as Record<string, unknown>) : null;
      if (!data) continue;
      const qty = typeof data.quantity === "number" ? data.quantity : 0;
      const amount = typeof data.total === "number" ? data.total : 0;
      let ref: ShopLineProductRef | null = null;
      try {
        ref = opts.resolveLine ? opts.resolveLine(data.quote) : null;
      } catch {
        ref = null;
      }
      const title = typeof data.title === "string" ? data.title : "—";
      const slug = ref?.slug ?? `?${title}`;
      const p = products.get(slug) ?? {
        slug: ref?.slug ?? "",
        name: (ref && opts.productNames?.[ref.slug]) || title,
        category: ref?.category ?? null,
        qty: 0,
        lines: 0,
        amount: 0,
      };
      products.set(slug, p);
      p.qty += qty;
      p.lines += 1;
      p.amount += amount;
      const ck = ref?.category ?? "";
      const c = categories.get(ck) ?? { category: ref?.category ?? null, qty: 0, lines: 0, amount: 0 };
      categories.set(ck, c);
      c.qty += qty;
      c.lines += 1;
      c.amount += amount;
    }
  }

  for (const g of ["day", "week", "month"] as const) {
    series[g] = [...maps[g].values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((b) => ({ ...b, revenue: round2(b.revenue), aov: b.paid ? round2(b.revenue / b.paid) : 0 }));
  }
  const uniqueCustomers = new Set(customers.values());
  const cust = { new: 0, returning: 0, newRevenue: 0, returningRevenue: 0, unknown: unknownCustomers };
  for (const c of uniqueCustomers) {
    if (c.returning) {
      cust.returning += 1;
      cust.returningRevenue += c.revenue;
    } else {
      cust.new += 1;
      cust.newRevenue += c.revenue;
    }
  }
  cust.newRevenue = round2(cust.newRevenue);
  cust.returningRevenue = round2(cust.returningRevenue);

  const byAmount = <T extends { amount: number; qty: number }>(a: T, b: T): number => b.amount - a.amount || b.qty - a.qty;
  return {
    from: opts.from,
    to: opts.to,
    includeTest,
    summary: {
      orders: orders.length,
      paid,
      unpaid: orders.length - paid,
      revenue: round2(revenue),
      aov: paid ? round2(revenue / paid) : 0,
      unpaidAmount: round2(unpaidAmount),
      discount: round2(discount),
      promoOrders,
      testOrders,
    },
    series,
    delivery: [...delivery.values()]
      .sort((a, b) => {
        const ia = DELIVERY_ORDER.indexOf(a.method);
        const ib = DELIVERY_ORDER.indexOf(b.method);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      })
      .map((d) => ({ ...d, revenue: round2(d.revenue) })),
    customers: cust,
    topProducts: [...products.values()]
      .sort(byAmount)
      .slice(0, topN)
      .map((p) => ({ ...p, amount: round2(p.amount) })),
    topCategories: [...categories.values()].sort(byAmount).map((c) => ({ ...c, amount: round2(c.amount) })),
  };
}

/** CSV: one row per order of the report (test orders only when included). No customer names, phones or e-mails. */
export function shopOrdersCsv(
  rows: readonly ShopReportOrderRow[],
  opts: { includeTest?: boolean; priorPaidKeys?: ReadonlySet<string> },
): string {
  const header = [
    "Заказ",
    "Дата (Кишинёв)",
    "Оплачен",
    "Статус оплаты",
    "Сумма, MDL",
    "Доставка, MDL",
    "Скидка, MDL",
    "Промокод",
    "Способ доставки",
    "Покупатель",
    "Позиций",
    "Тест",
  ];
  /** Earliest paid order in the period per customer: «новый» only on that one when no prior paid order. */
  const seen = new Set<string>();
  const sorted = rows
    .filter((o) => isReportableShopOrder(o, opts.includeTest === true))
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const out: (string | number | null)[][] = [header];
  for (const o of sorted) {
    const paid = isReportPaid(o);
    const keys = customerKeys(o);
    let who = "";
    if (paid) {
      if (keys.length === 0) who = "гость";
      else {
        const returning = keys.some((k) => seen.has(k) || (opts.priorPaidKeys?.has(k) ?? false));
        who = returning ? "повторный" : "новый";
        for (const k of keys) seen.add(k);
      }
    }
    const disc = num(o.promoDiscountMdl);
    out.push([
      o.orderNumber,
      `${dayKeyOf(o.createdAt)} ${new Intl.DateTimeFormat("ru-RU", { timeZone: "Europe/Chisinau", hour: "2-digit", minute: "2-digit" }).format(o.createdAt)}`,
      paid ? "да" : "нет",
      o.paymentStatus,
      round2(num(o.price)),
      round2(num(o.deliveryPriceMdl)),
      disc ? round2(disc) : null,
      o.promoCode ?? null,
      o.deliveryMethod ?? null,
      who,
      o.orderLines.length,
      isShopTestOrder(o) ? "да" : "",
    ]);
  }
  return toCsv(out);
}
