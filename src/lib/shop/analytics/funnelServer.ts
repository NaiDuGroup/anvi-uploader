import "server-only";
import { prisma } from "@/lib/prisma";
import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { SHOP_PRINT_SLUG } from "@/lib/storefront/printPrices";
import { PS_PRODUCTS } from "@/lib/storefront/printShop/config";
import { SHOP_UV_STICKERS_SLUG } from "@/lib/storefront/printShop/uvStickers";
import { loadShopProductNamesRu } from "@/lib/shop/lineProductServer";
import type { ShopReportPeriod } from "@/lib/shop/report/period";
import {
  buildFunnel,
  deviceSplit,
  productDropOff,
  sourceTable,
  type DeviceInput,
  type FunnelStepCounts,
  type ProductFunnelInput,
  type ShopFunnelReport,
  type SourceInput,
} from "./funnel";

/** Rows per table (biggest first). */
const PRODUCT_LIMIT = 100;
const SOURCE_LIMIT = 200;

/** Russian names of the product pages (catalog + print-shop sections); the slug otherwise. */
async function productNamesRu(): Promise<Record<string, string>> {
  const names: Record<string, string> = {
    [SHOP_BC_SLUG]: "Визитки",
    [SHOP_PRINT_SLUG]: "Печать фото и документов",
    [SHOP_UV_STICKERS_SLUG]: "UV-DTF наклейки",
  };
  for (const p of PS_PRODUCTS) names[p.slug] = p.staffRu;
  try {
    Object.assign(names, await loadShopProductNamesRu());
  } catch (e) {
    console.error("[shop-funnel] product names failed:", e);
  }
  return names;
}

/** The funnel section of the report for a period (SQL aggregates + the pure math in `funnel.ts`). */
export async function loadShopFunnelReport(period: ShopReportPeriod): Promise<ShopFunnelReport> {
  const { start, end } = period;
  const [stepRows, productRows, sourceRows, deviceRows, names] = await Promise.all([
    prisma.$queryRaw<Array<FunnelStepCounts & { events: number }>>`
      SELECT
        COUNT(*)::int AS "events",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'page_view')::int AS "visit",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'page_view' AND product IS NOT NULL)::int AS "product_view",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'add_to_cart')::int AS "add_to_cart",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'cart_view')::int AS "cart_view",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'checkout_start')::int AS "checkout_start",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'payment_start')::int AS "payment_start",
        COUNT(DISTINCT session_id) FILTER (WHERE type = 'paid')::int AS "paid"
      FROM shop_events
      WHERE created_at >= ${start} AND created_at < ${end}`,
    prisma.$queryRaw<ProductFunnelInput[]>`
      WITH flags AS (
        SELECT session_id,
          bool_or(type = 'checkout_start') AS co,
          bool_or(type = 'paid') AS paid
        FROM shop_events
        WHERE created_at >= ${start} AND created_at < ${end}
        GROUP BY session_id
      ), p AS (
        SELECT product, session_id, MIN(category) AS category,
          bool_or(type = 'page_view') AS viewed,
          bool_or(type = 'add_to_cart') AS added
        FROM shop_events
        WHERE created_at >= ${start} AND created_at < ${end}
          AND product IS NOT NULL AND type IN ('page_view', 'add_to_cart')
        GROUP BY product, session_id
      )
      SELECT p.product AS "product", MIN(p.category) AS "category",
        COUNT(*) FILTER (WHERE p.viewed)::int AS "views",
        COUNT(*) FILTER (WHERE p.added)::int AS "adds",
        COUNT(*) FILTER (WHERE p.added AND f.co)::int AS "checkouts",
        COUNT(*) FILTER (WHERE p.added AND f.paid)::int AS "paid"
      FROM p JOIN flags f USING (session_id)
      GROUP BY p.product
      ORDER BY COUNT(*) FILTER (WHERE p.viewed) DESC, p.product
      LIMIT ${PRODUCT_LIMIT}`,
    prisma.$queryRaw<SourceInput[]>`
      WITH firsts AS (
        SELECT DISTINCT ON (session_id) session_id, referrer, utm_source, utm_medium, utm_campaign
        FROM shop_events
        WHERE created_at >= ${start} AND created_at < ${end}
        ORDER BY session_id, created_at, id
      ), flags AS (
        SELECT session_id,
          bool_or(type = 'add_to_cart') AS added,
          bool_or(type = 'checkout_start') AS co,
          bool_or(type = 'paid') AS paid
        FROM shop_events
        WHERE created_at >= ${start} AND created_at < ${end}
        GROUP BY session_id
      )
      SELECT f.referrer AS "referrer", f.utm_source AS "utmSource", f.utm_medium AS "utmMedium", f.utm_campaign AS "utmCampaign",
        COUNT(*)::int AS "sessions",
        COUNT(*) FILTER (WHERE g.added)::int AS "adds",
        COUNT(*) FILTER (WHERE g.co)::int AS "checkouts",
        COUNT(*) FILTER (WHERE g.paid)::int AS "paid"
      FROM firsts f JOIN flags g USING (session_id)
      GROUP BY 1, 2, 3, 4
      ORDER BY COUNT(*) DESC
      LIMIT ${SOURCE_LIMIT}`,
    prisma.$queryRaw<DeviceInput[]>`
      WITH firsts AS (
        SELECT DISTINCT ON (session_id) session_id, device
        FROM shop_events
        WHERE created_at >= ${start} AND created_at < ${end}
        ORDER BY session_id, created_at, id
      ), flags AS (
        SELECT session_id, bool_or(type = 'paid') AS paid
        FROM shop_events
        WHERE created_at >= ${start} AND created_at < ${end}
        GROUP BY session_id
      )
      SELECT f.device AS "device", COUNT(*)::int AS "sessions", COUNT(*) FILTER (WHERE g.paid)::int AS "paid"
      FROM firsts f JOIN flags g USING (session_id)
      GROUP BY 1`,
    productNamesRu(),
  ]);
  const counts = stepRows[0];
  return {
    from: period.from,
    to: period.to,
    events: counts?.events ?? 0,
    steps: buildFunnel(counts ?? {}),
    products: productDropOff(productRows, names),
    sources: sourceTable(sourceRows),
    devices: deviceSplit(deviceRows),
  };
}
