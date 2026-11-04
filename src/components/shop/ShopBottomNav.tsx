"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cartCount } from "@/lib/storefront/cart";
import { shopRelPath } from "@/lib/storefront/shopHost";
import { useCart, useHydrated, useRecentOrders } from "@/lib/storefront/cartStore";
import { BriefcaseIcon, CartIcon, GridIcon, HomeIcon, ReceiptIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

/** Phone tab bar. Hidden on product / checkout pages, which have their own bottom bar. */
export function ShopBottomNav({ catalogHref }: { catalogHref: string }) {
  const { t, href } = useShopLang();
  // Storefront-relative path: "/cos" both on anvi.md/cos and print.anvi.md/shop/cos.
  const path = shopRelPath(usePathname() ?? "");
  const lines = useCart();
  const hydrated = useHydrated();
  const orders = useRecentOrders();
  if (path.startsWith("/p/") || path.startsWith("/checkout") || path.startsWith("/pay")) {
    return null;
  }
  const count: number = hydrated ? cartCount(lines) : 0;

  const items = [
    { href: href("/shop"), label: t("home"), icon: HomeIcon, active: path === "/" },
    { href: href(catalogHref), label: t("catalog"), icon: GridIcon, active: /^\/(caiete|cani|tricouri|pixuri)/.test(path) },
    { href: href("/shop/cos"), label: t("cart"), icon: CartIcon, active: path === "/cos", badge: count },
    // One order → straight to it; several → «Comenzile mele»; none → companies.
    orders.length === 1
      ? { href: href(`/shop/comanda/${encodeURIComponent(orders[0]!.token)}`), label: t("myOrder"), icon: ReceiptIcon, active: path.startsWith("/comanda") }
      : orders.length > 1
        ? { href: href("/shop/comenzi"), label: t("myOrders"), icon: ReceiptIcon, active: path.startsWith("/comanda") || path === "/comenzi" }
        : { href: href("/shop/companii"), label: t("navCompanies"), icon: BriefcaseIcon, active: path === "/companii" },
  ];

  return (
    <nav
      aria-label={t("mainNav")}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-(--line) bg-white pt-2 pb-[max(10px,env(safe-area-inset-bottom))] text-[11px] font-bold md:hidden"
    >
      {items.map((it) => {
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={it.active ? "page" : undefined}
            className={`relative flex flex-col items-center gap-1 no-underline ${it.active ? "text-(--ink)" : "text-(--muted2)"}`}
          >
            <Icon size={22} />
            <span className="max-w-full truncate px-1">{it.label}</span>
            {"badge" in it && it.badge ? (
              <span className="absolute top-[-4px] left-1/2 ml-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-(--gold) px-1 text-[11px] text-(--ink)">
                {it.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
