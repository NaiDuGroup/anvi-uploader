"use client";

import { createContext, useContext, useMemo } from "react";
import { shopT, type ShopLang, type ShopT } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";

type ShopCtx = { lang: ShopLang; t: ShopT; base: "" | "/shop"; href: (path: string) => string };

const Ctx = createContext<ShopCtx>({ lang: "ro", t: shopT("ro"), base: "/shop", href: (p) => p });

/**
 * Language + link base of the storefront. `base` is "" on a shop host
 * (anvi.md/cos) and "/shop" elsewhere (print.anvi.md/shop/cos); `href`
 * maps a `/shop/...` path to this host's URL.
 */
export function ShopLangProvider({
  lang,
  base = "/shop",
  children,
}: {
  lang: ShopLang;
  base?: "" | "/shop";
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ lang, t: shopT(lang), base, href: (p: string) => shopHref(base, p) }), [lang, base]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShopLang() {
  return useContext(Ctx);
}
