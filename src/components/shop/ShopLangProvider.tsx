"use client";

import { createContext, useContext, useMemo } from "react";
import { shopT, type ShopLang, type ShopT } from "@/lib/storefront/i18n";

const Ctx = createContext<{ lang: ShopLang; t: ShopT }>({ lang: "ro", t: shopT("ro") });

export function ShopLangProvider({ lang, children }: { lang: ShopLang; children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, t: shopT(lang) }), [lang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useShopLang() {
  return useContext(Ctx);
}
