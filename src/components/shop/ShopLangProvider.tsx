"use client";

import { createContext, useContext, useEffect, useMemo } from "react";
import { shopT, type ShopLang, type ShopT } from "@/lib/storefront/i18n";
import { shopHref } from "@/lib/storefront/shopHost";

type ShopCtx = {
  lang: ShopLang;
  t: ShopT;
  base: "" | "/shop";
  href: (path: string) => string;
  /** A real card payment is configured (until then the shop says «plată online — în curând»). */
  paymentLive: boolean;
  /** A storefront account is signed in (`shop_session`): header icon, bottom nav → `/cont/comenzi`. */
  signedIn: boolean;
};

const Ctx = createContext<ShopCtx>({ lang: "ro", t: shopT("ro"), base: "/shop", href: (p) => p, paymentLive: false, signedIn: false });

/**
 * Language + link base of the storefront. `base` is "" on a shop host
 * (anvi.md/cos) and "/shop" elsewhere (print.anvi.md/shop/cos); `href`
 * maps a `/shop/...` path to this host's URL.
 */
export function ShopLangProvider({
  lang,
  base = "/shop",
  paymentLive = false,
  signedIn = false,
  children,
}: {
  lang: ShopLang;
  base?: "" | "/shop";
  paymentLive?: boolean;
  signedIn?: boolean;
  children: React.ReactNode;
}) {
  const value = useMemo(
    () => ({ lang, t: shopT(lang), base, href: (p: string) => shopHref(base, p), paymentLive, signedIn }),
    [lang, base, paymentLive, signedIn],
  );
  // `<html lang>` follows the shop language after a client-side switch (the root layout sets it on load).
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShopLang() {
  return useContext(Ctx);
}
