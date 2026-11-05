"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SHOP_LANG_COOKIE, SHOP_LANGS, type ShopLang } from "@/lib/storefront/i18n";
import { SHOP_PHOTO_PRINT_PATH } from "@/lib/storefront/links";
import { cartCount } from "@/lib/storefront/cart";
import { useCart, useHydrated } from "@/lib/storefront/cartStore";
import { CartIcon, GridIcon, UserIcon } from "./ShopIcons";
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

/**
 * «Toate categoriile»: every category in one panel — with a dozen of them the
 * scrolling row below the header no longer shows them all on a phone.
 */
function AllCategoriesMenu({ links }: { links: { key: string; href: string; name: string; accent?: boolean }[] }) {
  const { t } = useShopLang();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);
  return (
    <div ref={box} className="shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="shop-all-categories"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-(--soft) px-3 font-bold text-(--ink)"
      >
        <GridIcon size={16} /> {t("allCategories")}
      </button>
      {open ? (
        <div
          id="shop-all-categories"
          className="absolute inset-x-0 top-full z-50 border-b border-(--line) bg-white shadow-lg"
        >
          <ul className="mx-auto m-0 grid max-w-[1320px] list-none grid-cols-2 whitespace-normal gap-x-4 gap-y-1 px-4 py-3 sm:grid-cols-3 sm:px-6 lg:grid-cols-5">
            {links.map((l) => (
              <li key={l.key}>
                <Link
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center rounded-lg px-2 text-[15px] font-semibold no-underline hover:bg-(--soft) ${
                    l.accent ? "text-(--gold-ink)" : "text-(--ink)"
                  }`}
                >
                  {l.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ShopHeader({ categories }: { categories: { slug: string; name: string }[] }) {
  const { t, href, paymentLive } = useShopLang();
  const navLinks: { key: string; href: string; name: string; accent?: boolean }[] = [
    ...categories.map((c) => ({ key: c.slug, href: href(`/shop/${c.slug}`), name: c.name })),
    { key: "photo-print", href: href(SHOP_PHOTO_PRINT_PATH), name: t("photoTileTitle") },
    { key: "companies", href: href("/shop/companii"), name: t("forCompanies"), accent: true },
  ];
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
        <nav aria-label={t("mainNav")} className="ml-auto flex items-center gap-2 sm:gap-5">
          <Link href={href("/shop/companii")} className="hidden text-[15px] font-semibold no-underline md:inline">
            {t("forCompanies")}
          </Link>
          <LangSwitch />
          <AccountButton />
          <CartButton />
        </nav>
      </div>
      <nav
        aria-label={t("categories")}
        className="mx-auto flex max-w-[1320px] items-center gap-4 px-4 pb-1.5 text-sm font-semibold whitespace-nowrap text-(--muted) sm:px-6"
      >
        <AllCategoriesMenu links={navLinks} />
        {/* The row scrolls sideways on a phone; the fade hints there is more. */}
        <div className="relative min-w-0 flex-1">
          <div className="shop-no-scrollbar flex gap-6 overflow-x-auto pr-8">
            {navLinks.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className={`inline-flex min-h-10 items-center no-underline ${l.accent ? "text-(--gold-ink)" : ""}`}
              >
                {l.name}
              </Link>
            ))}
          </div>
          <span aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white" />
        </div>
      </nav>
    </header>
  );
}
