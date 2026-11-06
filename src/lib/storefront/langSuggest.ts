import { SHOP_LANGS, SHOP_LANG_COOKIE, type ShopLang } from "./i18n";

/**
 * First-visit language hint of the storefront: a visitor who never picked a
 * language (no `shop_lang` cookie) and whose browser prefers Russian or
 * English sees a slim banner offering that language. Never a redirect — the
 * page stays Romanian for crawlers and link previews (one URL per page, see
 * `shopSeo.ts`). Pure (unit-tested); the banner reads the inputs after mount.
 */

/** Each language's own name (endonym): menu items, the phone sheet row. */
export const SHOP_LANG_NAMES: Record<ShopLang, string> = { ro: "Română", ru: "Русский", en: "English" };

/** Crawlers, link-preview fetchers and headless checkers: no banner for them. */
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|embedly|preview|lighthouse|headless|bingpreview/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  return !!ua && BOT_UA.test(ua);
}

/** The `shop_lang` cookie is set (a language was picked, or `?lang=` opened the page). */
export function hasShopLangChoice(cookieHeader: string | null | undefined): boolean {
  return (cookieHeader ?? "").split(";").some((c) => c.trim().startsWith(`${SHOP_LANG_COOKIE}=`));
}

/**
 * The first shop language in the browser's preference list (`ru-RU` → ru,
 * `mo` / `ro-MD` → ro), or null when none of them is one we have.
 */
export function preferredShopLang(browserLangs: readonly string[]): ShopLang | null {
  for (const raw of browserLangs) {
    const primary = raw.trim().toLowerCase().split(/[-_]/)[0] ?? "";
    const lang = primary === "mo" ? "ro" : primary;
    if ((SHOP_LANGS as readonly string[]).includes(lang)) return lang as ShopLang;
  }
  return null;
}

/**
 * The language to suggest, or null: nothing once a choice is stored, nothing
 * for bots, and only Russian / English (Romanian is the default page language).
 */
export function shopLangSuggestion(input: {
  current: ShopLang;
  chosen: boolean;
  browserLangs: readonly string[];
  userAgent?: string | null;
}): ShopLang | null {
  if (input.chosen || isBotUserAgent(input.userAgent)) return null;
  const preferred = preferredShopLang(input.browserLangs);
  if (!preferred || preferred === "ro" || preferred === input.current) return null;
  return preferred;
}
