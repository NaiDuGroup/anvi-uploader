import { SHOP_CATEGORIES } from "./catalogConfig";
import { pickLocalized, type Localized, type ShopLang } from "./i18n";
import { SHOP_LF_CATEGORY_IMAGE, SHOP_LF_CATEGORY_SLUG } from "./largeFormat";
import { SHOP_PHOTO_PRINT_IMAGE, SHOP_PHOTO_PRINT_PATH } from "./links";
import { PS_CATEGORY_IMAGE, PS_CATEGORY_NAME, PS_CATEGORY_SLUG } from "./printShop/config";
import type { ShopCategorySlug } from "./types";

/**
 * Storefront category navigation (header bar, «Catalog» mega-menu, phone
 * sheet, home tiles): one structure, so they all group the shop the same way.
 * Pure — counts and images come from the caller (the layout loads them).
 *
 * Every `SHOP_CATEGORIES` slug is in exactly one group or is the seasonal
 * entry (unit-tested), so a new category cannot silently miss the menu.
 */

/** A nav destination: a stock category or one of the service pages. */
export type ShopNavKey = ShopCategorySlug | typeof PS_CATEGORY_SLUG | typeof SHOP_LF_CATEGORY_SLUG | "printare";

export type ShopNavGroupId = "photo-gifts" | "print" | "merch";

export interface ShopNavGroupConfig {
  id: ShopNavGroupId;
  title: Localized;
  links: readonly ShopNavKey[];
}

/** The «Catalog» groups, in menu order. */
export const SHOP_NAV_GROUPS: readonly ShopNavGroupConfig[] = [
  {
    id: "photo-gifts",
    title: { ro: "Cadouri cu poza ta", ru: "Подарки с вашим фото", en: "Gifts with your photo" },
    links: ["cani", "caiete", "tricouri", "jucarii", "cadouri"],
  },
  {
    id: "print",
    title: { ro: "Tipar", ru: "Печать", en: "Printing" },
    links: [PS_CATEGORY_SLUG, SHOP_LF_CATEGORY_SLUG, "printare"],
  },
  {
    id: "merch",
    title: { ro: "Merch pentru companii", ru: "Мерч для компаний", en: "Company merch" },
    links: ["pixuri", "genti", "sticle", "jocuri"],
  },
];

/**
 * The seasonal entry: highlighted in the header bar (accent colour + icon) and
 * on top of the «Catalog» menu. Swap it here after the holidays (or set it to
 * null and move «craciun» into a group, or out of `SHOP_CATEGORIES`).
 */
export const SHOP_NAV_SEASONAL: { key: ShopNavKey; icon: "snowflake" } | null = { key: "craciun", icon: "snowflake" };

/** Header bar links between «Catalog» and the seasonal entry. */
export const SHOP_NAV_BAR: readonly ShopNavKey[] = ["cani", "tricouri", PS_CATEGORY_SLUG, SHOP_LF_CATEGORY_SLUG];

/** Shorter labels for the header bar (the menu and the pages keep the full name). */
const SHORT_NAMES: Partial<Record<ShopNavKey, Localized>> = {
  tricouri: { ro: "Tricouri", ru: "Футболки", en: "T-shirts" },
  [SHOP_LF_CATEGORY_SLUG]: { ro: "Mare format", ru: "Широкоформат", en: "Large format" },
};

const SERVICE_NAMES: Record<typeof PS_CATEGORY_SLUG | typeof SHOP_LF_CATEGORY_SLUG | "printare", Localized> = {
  [PS_CATEGORY_SLUG]: PS_CATEGORY_NAME,
  [SHOP_LF_CATEGORY_SLUG]: { ro: "Print mare format", ru: "Широкоформатная печать", en: "Large format printing" },
  printare: { ro: "Foto și documente", ru: "Фото и документы", en: "Photos and documents" },
};

const SERVICE_IMAGES: Record<typeof PS_CATEGORY_SLUG | typeof SHOP_LF_CATEGORY_SLUG | "printare", string> = {
  [PS_CATEGORY_SLUG]: PS_CATEGORY_IMAGE,
  [SHOP_LF_CATEGORY_SLUG]: SHOP_LF_CATEGORY_IMAGE,
  printare: SHOP_PHOTO_PRINT_IMAGE,
};

/** «/shop/…» path of a nav destination (map it with the host's `href`). */
export function shopNavPath(key: ShopNavKey): string {
  return key === "printare" ? SHOP_PHOTO_PRINT_PATH : `/shop/${key}`;
}

export function shopNavName(key: ShopNavKey, lang: ShopLang): string {
  const cat = SHOP_CATEGORIES.find((c) => c.slug === key);
  if (cat) return pickLocalized(cat.name, lang);
  return pickLocalized(SERVICE_NAMES[key as keyof typeof SERVICE_NAMES], lang);
}

/** What the layout knows about a destination: listed products (null = unknown) and a thumbnail. */
export interface ShopNavStat {
  count: number | null;
  image?: string | null;
}

export interface ShopNavLink {
  key: ShopNavKey;
  path: string;
  name: string;
  short: string;
  /** Listed products; null when unknown (database down) or not a product list (photo printing). */
  count: number | null;
  image: string | null;
}

export interface ShopNavGroup {
  id: ShopNavGroupId;
  title: string;
  links: ShopNavLink[];
}

export interface ShopNav {
  groups: ShopNavGroup[];
  bar: ShopNavLink[];
  seasonal: (ShopNavLink & { icon: "snowflake" }) | null;
}

/**
 * The navigation in `lang`. Destinations with a known count of 0 are hidden
 * (an empty category); unknown counts (no database) keep the link.
 */
export function buildShopNav(lang: ShopLang, stats: Partial<Record<ShopNavKey, ShopNavStat>>): ShopNav {
  const link = (key: ShopNavKey): ShopNavLink | null => {
    const s = stats[key];
    const count: number | null = s?.count ?? null;
    if (count === 0) return null;
    const name = shopNavName(key, lang);
    const short = SHORT_NAMES[key];
    return {
      key,
      path: shopNavPath(key),
      name,
      short: short ? pickLocalized(short, lang) : name,
      count,
      image: s?.image ?? SERVICE_IMAGES[key as keyof typeof SERVICE_IMAGES] ?? null,
    };
  };
  const present = (l: ShopNavLink | null): l is ShopNavLink => l != null;
  const seasonalLink = SHOP_NAV_SEASONAL ? link(SHOP_NAV_SEASONAL.key) : null;
  return {
    groups: SHOP_NAV_GROUPS.map((g) => ({ id: g.id, title: pickLocalized(g.title, lang), links: g.links.map(link).filter(present) })).filter(
      (g) => g.links.length > 0,
    ),
    bar: SHOP_NAV_BAR.map(link).filter(present),
    seasonal: seasonalLink && SHOP_NAV_SEASONAL ? { ...seasonalLink, icon: SHOP_NAV_SEASONAL.icon } : null,
  };
}
