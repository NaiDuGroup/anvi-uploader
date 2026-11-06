"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { SHOP_LANG_COOKIE, SHOP_LANGS, type ShopLang } from "@/lib/storefront/i18n";
import { cartCount } from "@/lib/storefront/cart";
import { useCart, useHydrated } from "@/lib/storefront/cartStore";
import { CartIcon, UserIcon } from "./ShopIcons";
import { ShopCategoryBar } from "./ShopCatalogNav";
import { useShopLang } from "./ShopLangProvider";

/** Each language's own name, for the switch buttons' accessible labels. */
const LANG_NAMES: Record<ShopLang, string> = { ro: "Română", ru: "Русский", en: "English" };

function writeShopLangCookie(lang: ShopLang) {
  document.cookie = `${SHOP_LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

export function LangSwitch({ className = "" }: { className?: string }) {
  const { lang, t } = useShopLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (next: ShopLang) => {
    if (next === lang) return;
    writeShopLangCookie(next);
    start(() => router.refresh());
  };
  return (
    <div role="group" aria-label={t("langLabel")} className={`flex items-center gap-1 text-sm ${className}`} aria-busy={pending}>
      {SHOP_LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => pick(l)}
          aria-pressed={l === lang}
          aria-label={LANG_NAMES[l]}
          lang={l}
          className={`min-h-10 min-w-10 rounded-lg px-2 py-1.5 font-bold uppercase ${
            l === lang ? "bg-(--ink) text-white" : "text-(--muted2) hover:bg-(--soft)"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function CartButton() {
  const { t, href } = useShopLang();
  const lines = useCart();
  const hydrated = useHydrated();
  const count: number = hydrated ? cartCount(lines) : 0;
  return (
    <Link
      href={href("/shop/cos")}
      aria-label={`${t("cart")}${count ? ` (${count})` : ""}`}
      className="relative flex h-11 items-center gap-2 rounded-[10px] bg-(--soft) px-3.5 text-[15px] font-bold no-underline"
    >
      <CartIcon size={20} />
      <span className="hidden md:inline">{t("cart")}</span>
      <span
        aria-hidden
        className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-xs font-extrabold ${
          count ? "bg-(--gold) text-(--ink)" : "invisible"
        }`}
      >
        {count || 0}
      </span>
    </Link>
  );
}

/** Account icon: «Contul meu» (signed in) or the login page. */
export function AccountButton() {
  const { t, href, signedIn } = useShopLang();
  return (
    <Link
      href={href("/shop/cont")}
      aria-label={signedIn ? t("account") : t("accLoginTitle")}
      title={signedIn ? t("account") : t("accLoginTitle")}
      className="relative grid h-11 w-11 place-items-center rounded-[10px] bg-(--soft) no-underline"
    >
      <UserIcon size={20} />
      {signedIn ? <span aria-hidden className="absolute top-2 right-2 h-2 w-2 rounded-full bg-(--gold)" /> : null}
    </Link>
  );
}

export function ShopHeader() {
  const { t, href, paymentLive } = useShopLang();
  return (
    <header className="relative border-b border-(--line) bg-white">
      <div className="hidden flex-wrap justify-center gap-x-7 gap-y-1 bg-(--ink) px-6 py-2 text-[13px] text-white sm:flex">
        <span>{t("topDeliveryCity")}</span>
        <span>{t("topDeliveryCountry")}</span>
        <span>{paymentLive ? t("topPayment") : t("topPaymentSoon")}</span>
      </div>
      <div className="mx-auto flex max-w-[1320px] items-center gap-3 px-4 py-3 sm:gap-6 sm:px-6 sm:py-4">
        <Link href={href("/shop")} className="flex shrink-0 items-center gap-2.5 no-underline" aria-label={`ANVI — ${t("home")}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- static logo */}
          <img src="/logo.png" alt="" width={44} height={44} className="h-10 w-10 sm:h-12 sm:w-12" />
          <span className="hidden text-lg font-extrabold tracking-[0.04em] min-[420px]:inline sm:text-xl">ANVI</span>
        </Link>
        {/* «Pentru companii» is at the end of the category bar below. */}
        <nav aria-label={t("mainNav")} className="ml-auto flex items-center gap-2 sm:gap-5">
          <LangSwitch />
          <AccountButton />
          <CartButton />
        </nav>
      </div>
      <ShopCategoryBar />
    </header>
  );
}
