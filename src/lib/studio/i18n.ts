import type { ShopLang } from "@/lib/storefront/i18n";

/**
 * Studio strings (ro / ru / en). Each Studio module defines its own small
 * dictionary with `defineStudioStrings`: the Russian and English tables must
 * have exactly the Romanian keys, so a missing translation fails `tsc`.
 */

export type StudioVars = Readonly<Record<string, string | number>>;
export type StudioT<K extends string> = (key: K, vars?: StudioVars) => string;

export function fillVars(s: string, vars?: StudioVars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

export function defineStudioStrings<K extends string>(dict: {
  ro: Record<K, string>;
  ru: Record<NoInfer<K>, string>;
  en: Record<NoInfer<K>, string>;
}): (lang: ShopLang) => StudioT<K> {
  return (lang) => (key, vars) => fillVars(dict[lang][key] ?? dict.ro[key], vars);
}

/** Localized value given inline (template names, quality messages). */
export type StudioLocalized = Record<ShopLang, string>;
