"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cartCount } from "@/lib/storefront/cart";
import { shopHidesBottomNav } from "@/lib/storefront/bottomNav";
import { shopRelPath } from "@/lib/storefront/shopHost";
import { useCart, useHydrated, useRecentOrders } from "@/lib/storefront/cartStore";
import { BriefcaseIcon, CartIcon, GridIcon, HomeIcon, ReceiptIcon, UserIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";
import { navHasPath, useShopNav } from "./ShopCatalogNav";

/** Phone tab bar. Hidden on pages with their own bottom bar (`shopHidesBottomNav`). */
export function ShopBottomNav() {
  const { t, href, signedIn } = useShopLang();
  const navCtx = useShopNav();
  // Storefront-relative path: "/cos" both on anvi.md/cos and print.anvi.md/shop/cos.
  const path = shopRelPath(usePathname() ?? "");
  const lines = useCart();
  const hydrated = useHydrated();
  const orders = useRecentOrders();
  if (shopHidesBottomNav(path)) return null;
  const count: number = hydrated ? cartCount(lines) : 0;

  const items = [
    { href: href("/shop"), label: t("home"), icon: HomeIcon, active: path === "/" },
    // «Catalog» opens the category sheet (a button, not a link).
    {
      href: href("/shop#catalog"),
      label: t("catalog"),
      icon: GridIcon,
      active: navCtx ? navCtx.sheetOpen || navHasPath(navCtx.nav, path) : false,
      catalog: true,
    },
    { href: href("/shop/cos"), label: t("cart"), icon: CartIcon, active: path === "/cos", badge: count },
    // Signed in → the account's orders; else one order → straight to it;
    // several → «Comenzile mele» (this browser); none → companies.
    signedIn
      ? { href: href("/shop/cont/comenzi"), label: t("navOrders"), icon: ReceiptIcon, active: path.startsWith("/cont/comenzi") || path.startsWith("/comanda") }
      : orders.length === 1
      ? { href: href(`/shop/comanda/${encodeURIComponent(orders[0]!.token)}`), label: t("navMyOrder"), icon: ReceiptIcon, active: path.startsWith("/comanda") }
      : orders.length > 1
        ? { href: href("/shop/comenzi"), label: t("navOrders"), icon: ReceiptIcon, active: path.startsWith("/comanda") || path === "/comenzi" }
        : { href: href("/shop/companii"), label: t("navCompanies"), icon: BriefcaseIcon, active: path === "/companii" },
    // Account (sign-in page when signed out).
    {
      href: href("/shop/cont"),
      label: t("navAccount"),
      icon: UserIcon,
      active: path.startsWith("/cont") && !(signedIn && path.startsWith("/cont/comenzi")),
    },
  ];

  return (
    <nav
      aria-label={t("mainNav")}
      className={`fixed inset-x-0 bottom-0 grid ${navCtx?.sheetOpen ? "z-50" : "z-40"} grid-cols-5 border-t border-(--line) bg-white pt-2 pb-[max(10px,env(safe-area-inset-bottom))] text-[11px] font-bold md:hidden`}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const body = (
          <>
            <Icon size={22} />
            {/* Narrow phones (360 px): wrap a long label onto a second line rather than cut it. */}
            <span className="line-clamp-2 max-w-full px-0.5 text-center leading-tight break-words">{it.label}</span>
            {"badge" in it && it.badge ? (
              <span className="absolute top-[-4px] left-1/2 ml-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-(--gold) px-1 text-[11px] text-(--ink)">
                {it.badge}
              </span>
            ) : null}
          </>
        );
        const cls = `relative flex flex-col items-center gap-1 no-underline ${it.active ? "text-(--ink)" : "text-(--muted2)"}`;
        if ("catalog" in it && navCtx) {
          return (
            <button
              key="catalog"
              type="button"
              aria-expanded={navCtx.sheetOpen}
              onClick={navCtx.sheetOpen ? navCtx.closeSheet : navCtx.openSheet}
              className={`${cls} border-0 bg-transparent p-0 font-bold`}
            >
              {body}
            </button>
          );
        }
        return (
          <Link key={it.href} href={it.href} aria-current={it.active ? "page" : undefined} className={cls}>
            {body}
          </Link>
        );
      })}
    </nav>
  );
}
