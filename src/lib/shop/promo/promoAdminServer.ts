import "server-only";
import { prisma } from "@/lib/prisma";
import { SHOP_REPORT_CATEGORIES } from "@/lib/shop/lineProduct";
import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { tryLoadShopCatalog } from "@/lib/storefront/catalog";
import { SHOP_LF_RULES } from "@/lib/storefront/largeFormat";
import { SHOP_PRINT_SLUG } from "@/lib/storefront/printPrices";
import { PS_PRODUCTS } from "@/lib/storefront/printShop/config";
import { SHOP_UV_STICKERS_SLUG } from "@/lib/storefront/printShop/uvStickers";
import { promoAdminRow, type PromoAdminRow } from "./promoAdmin";
import { promoHeldOrdersWhere, promoRealOrdersWhere } from "./promoOrdersWhere";

/**
 * Every promo code with its paid uses, held unpaid orders and orders count, newest first.
 * Trashed and test-payment orders are not counted (same rule as the checkout limits).
 */
export async function listPromoCodes(now: Date = new Date()): Promise<PromoAdminRow[]> {
  const rows = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const [all, pending] = await Promise.all([
    prisma.order.groupBy({ by: ["promoCodeId"], where: promoRealOrdersWhere({ in: ids }), _count: { _all: true } }),
    prisma.order.groupBy({
      by: ["promoCodeId"],
      where: promoHeldOrdersWhere({ in: ids }, now),
      _count: { _all: true },
    }),
  ]);
  const allBy = new Map(all.map((r) => [r.promoCodeId, r._count._all]));
  const pendingBy = new Map(pending.map((r) => [r.promoCodeId, r._count._all]));
  return rows.map((r) => promoAdminRow(r, { ordersCount: allBy.get(r.id) ?? 0, pendingOrders: pendingBy.get(r.id) ?? 0 }));
}

export interface PromoProductOption {
  slug: string;
  name: string;
  category: string;
}

/** Products the code may be limited to: the catalog + print shop / wide format / business cards / photo printing. */
export async function promoProductOptions(): Promise<PromoProductOption[]> {
  const catalog = await tryLoadShopCatalog("ru");
  const out: PromoProductOption[] = (catalog?.products ?? []).map((p) => ({ slug: p.slug, name: p.name, category: p.category }));
  out.push({ slug: SHOP_BC_SLUG, name: "Визитки", category: "carti-de-vizita" });
  out.push({ slug: SHOP_PRINT_SLUG, name: "Фото и документы", category: "printare" });
  out.push({ slug: SHOP_UV_STICKERS_SLUG, name: "Наклейки UV-DTF", category: "tipografie" });
  for (const p of PS_PRODUCTS) out.push({ slug: p.slug, name: p.staffRu, category: "tipografie" });
  for (const r of Object.values(SHOP_LF_RULES)) out.push({ slug: r.slug, name: r.slug, category: "print-mare-format" });
  const seen = new Set<string>();
  return out.filter((p) => (seen.has(p.slug) ? false : (seen.add(p.slug), true)));
}

export const PROMO_CATEGORY_OPTIONS = SHOP_REPORT_CATEGORIES;
