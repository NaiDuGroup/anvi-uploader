import { SHOP_BC_SLUG } from "@/lib/storefront/businessCards";
import { SHOP_LF_CATEGORY_SLUG, SHOP_LF_PRODUCTS, SHOP_LF_RULES } from "@/lib/storefront/largeFormat";
import { SHOP_LF_PRODUCT_KEY } from "@/lib/storefront/largeFormatLabels";
import { describeQuoteLine, type ShopLineLabels } from "@/lib/storefront/lineLabels";
import { shopT, type Localized, type ShopLang } from "@/lib/storefront/i18n";
import { SHOP_PRINT_SLUG } from "@/lib/storefront/printPrices";
import { PS_PRODUCTS } from "@/lib/storefront/printShop/config";
import { SHOP_UV_STICKERS_SLUG } from "@/lib/storefront/printShop/uvStickers";
import type { ShopCategorySlug, ShopQuoteLine } from "@/lib/storefront/types";

/**
 * Which storefront product and category a cart / order line belongs to,
 * derived from its QUOTE on the server (never from a slug the browser sends):
 * used by promo-code eligibility and the admin report's top products /
 * categories. Pure (client-safe).
 */

/** Catalog categories + the print-shop sections that are not catalog categories. */
export type ShopReportCategory = ShopCategorySlug | "tipografie" | "printare" | "print-mare-format" | "carti-de-vizita";

/** Category names (Russian, staff UI) in menu order. */
export const SHOP_REPORT_CATEGORIES: readonly { slug: ShopReportCategory; ru: string; ro: string; en: string }[] = [
  { slug: "caiete", ru: "Блокноты", ro: "Carnete", en: "Notebooks" },
  { slug: "cani", ru: "Кружки", ro: "Căni", en: "Mugs" },
  { slug: "tricouri", ru: "Футболки и кепки", ro: "Tricouri și șepci", en: "T-shirts and caps" },
  { slug: "pixuri", ru: "Ручки", ro: "Pixuri", en: "Pens" },
  { slug: "genti", ru: "Сумки", ro: "Genți", en: "Bags" },
  { slug: "jucarii", ru: "Игрушки", ro: "Jucării", en: "Toys" },
  { slug: "sticle", ru: "Бутылки", ro: "Sticle", en: "Bottles" },
  { slug: "jocuri", ru: "Игры", ro: "Jocuri", en: "Games" },
  { slug: "craciun", ru: "Новый год", ro: "Crăciun", en: "Christmas" },
  { slug: "cadouri", ru: "Подарки", ro: "Cadouri", en: "Gifts" },
  { slug: "tipografie", ru: "Типография", ro: "Tipografie", en: "Print shop" },
  { slug: "carti-de-vizita", ru: "Визитки", ro: "Cărți de vizită", en: "Business cards" },
  { slug: "printare", ru: "Фото и документы", ro: "Printare", en: "Photo & document printing" },
  { slug: "print-mare-format", ru: "Широкоформатная печать", ro: "Print mare format", en: "Wide format" },
];

export function isShopReportCategory(v: string): v is ShopReportCategory {
  return SHOP_REPORT_CATEGORIES.some((c) => c.slug === v);
}

export interface ShopLineProductRef {
  /** Product slug (`/p/<slug>` or the section slug for non-catalog lines). */
  slug: string;
  category: ShopReportCategory | null;
}

/**
 * Product slug + category of a quote line. `productCategory`: catalog
 * product slug → category (from the live catalog). Null when the line is not
 * recognisable (a malformed stored quote, a product gone from the catalog).
 */
export function shopLineProductRef(
  quote: unknown,
  labels: ShopLineLabels,
  productCategory: Readonly<Record<string, ShopCategorySlug>>,
): ShopLineProductRef | null {
  if (quote == null || typeof quote !== "object") return null;
  const q = quote as ShopQuoteLine;
  if (q.kind === "businessCard") return { slug: SHOP_BC_SLUG, category: "carti-de-vizita" };
  if (q.kind === "print") return { slug: SHOP_PRINT_SLUG, category: "printare" };
  if (q.kind === "uv" && (q as { source?: string }).source === "stickers") {
    return { slug: SHOP_UV_STICKERS_SLUG, category: "tipografie" };
  }
  let text: { slug: string } | null = null;
  try {
    text = describeQuoteLine(q, labels, shopT("ru"));
  } catch {
    text = null;
  }
  if (q.kind === "sheetShop") return text ? { slug: text.slug, category: "tipografie" } : null;
  if (q.kind === "largeFormat") return text ? { slug: text.slug, category: SHOP_LF_CATEGORY_SLUG } : null;
  if (!text) return null;
  return { slug: text.slug, category: productCategory[text.slug] ?? null };
}

/** Names of the non-catalog sections (business cards, photo printing, UV-DTF stickers). */
const SECTION_NAMES: Readonly<Record<string, Localized>> = {
  [SHOP_BC_SLUG]: { ru: "Визитки", ro: "Cărți de vizită", en: "Business cards" },
  [SHOP_PRINT_SLUG]: { ru: "Печать фото и документов", ro: "Printare foto și documente", en: "Photo & document printing" },
  [SHOP_UV_STICKERS_SLUG]: { ru: "UV-DTF наклейки", ro: "Autocolante UV-DTF", en: "UV-DTF stickers" },
};

/**
 * Product names by slug in one language (admin report tables, funnel): the
 * sections, print-shop products (staff names in Russian), wide-format products
 * and the catalog products of that language (`catalogProducts` loaded in `lang`).
 */
export function shopProductNames(lang: ShopLang, catalogProducts: readonly { slug: string; name: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [slug, name] of Object.entries(SECTION_NAMES)) out[slug] = name[lang];
  for (const p of PS_PRODUCTS) out[p.slug] = lang === "ru" ? p.staffRu : p.name[lang];
  const t = shopT(lang);
  for (const p of SHOP_LF_PRODUCTS) out[SHOP_LF_RULES[p].slug] = t(SHOP_LF_PRODUCT_KEY[p]);
  for (const p of catalogProducts) out[p.slug] = p.name;
  return out;
}
