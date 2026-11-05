import "server-only";
import { prisma } from "@/lib/prisma";
import { loadShopLineRefResolver, loadShopProductNames } from "@/lib/shop/lineProductServer";
import type { ShopLang } from "@/lib/storefront/i18n";
import { SHOP_TEST_ORDER_NOTE_PREFIX } from "@/lib/shop/orderFlags";
import { aggregateShopOrders, customerKeys, type ShopOrdersReport, type ShopReportOrderRow } from "./orders";
import type { ShopReportPeriod } from "./period";

const ORDER_SELECT = {
  id: true,
  orderNumber: true,
  createdAt: true,
  source: true,
  price: true,
  isPaid: true,
  paymentStatus: true,
  paymentProvider: true,
  notes: true,
  deletedAt: true,
  deliveryMethod: true,
  deliveryPriceMdl: true,
  shopCustomerId: true,
  customerEmail: true,
  promoCode: true,
  promoDiscountMdl: true,
  orderLines: { select: { shopLineData: true }, orderBy: { sortOrder: "asc" as const } },
};

/** Storefront orders created in the period, not deleted (test orders included: filtered by the aggregation). */
export async function loadShopReportOrders(period: ShopReportPeriod): Promise<ShopReportOrderRow[]> {
  return prisma.order.findMany({
    where: { source: "shop", deletedAt: null, createdAt: { gte: period.start, lt: period.end } },
    select: ORDER_SELECT,
    orderBy: { createdAt: "asc" },
  });
}

/**
 * Customer keys (see `customerKeys`) of the period's orders that already had
 * a paid, non-test, non-deleted storefront order before the period started.
 */
export async function loadPriorPaidKeys(rows: readonly ShopReportOrderRow[], before: Date): Promise<Set<string>> {
  const ids = new Set<string>();
  const emails = new Set<string>();
  for (const o of rows) {
    if (o.shopCustomerId) ids.add(o.shopCustomerId);
    const e = o.customerEmail?.trim().toLowerCase();
    if (e) emails.add(e);
  }
  if (ids.size === 0 && emails.size === 0) return new Set();
  const prior = await prisma.order.findMany({
    where: {
      source: "shop",
      deletedAt: null,
      createdAt: { lt: before },
      OR: [{ paymentStatus: "paid" }, { isPaid: true }],
      AND: [
        { OR: [{ paymentProvider: null }, { paymentProvider: { not: "test" } }] },
        { OR: [{ notes: null }, { NOT: { notes: { startsWith: SHOP_TEST_ORDER_NOTE_PREFIX } } }] },
        {
          OR: [
            ...(ids.size ? [{ shopCustomerId: { in: [...ids] } }] : []),
            ...(emails.size ? [{ customerEmail: { in: [...emails], mode: "insensitive" as const } }] : []),
          ],
        },
      ],
    },
    select: { shopCustomerId: true, customerEmail: true },
  });
  const out = new Set<string>();
  for (const p of prior) for (const k of customerKeys(p)) out.add(k);
  return out;
}

/** The orders report; product names in `lang` (the admin language). */
export async function loadShopOrdersReport(period: ShopReportPeriod, includeTest: boolean, lang: ShopLang = "ru"): Promise<ShopOrdersReport> {
  const rows = await loadShopReportOrders(period);
  const [priorPaidKeys, resolveLine, productNames] = await Promise.all([
    loadPriorPaidKeys(rows, period.start),
    loadShopLineRefResolver(),
    loadShopProductNames(lang),
  ]);
  return aggregateShopOrders(rows, { from: period.from, to: period.to, includeTest, priorPaidKeys, resolveLine, productNames });
}
