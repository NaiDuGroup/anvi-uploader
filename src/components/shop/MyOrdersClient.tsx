"use client";

import Link from "next/link";
import { useHydrated, useRecentOrders } from "@/lib/storefront/cartStore";
import { formatOrderDate } from "@/lib/storefront/format";
import { ReceiptIcon } from "./ShopIcons";
import { useShopLang } from "./ShopLangProvider";

/** «Comenzile mele»: the last orders placed from this browser (localStorage), newest first. */
export function MyOrdersClient() {
  const { t, lang, href } = useShopLang();
  const orders = useRecentOrders();
  const hydrated = useHydrated();
  if (!hydrated) return <div className="min-h-[200px]" aria-busy="true" />;
  if (orders.length === 0) {
    return (
      <div className="flex flex-col items-start gap-4 py-4">
        <p className="m-0 text-lg text-(--muted)">{t("myOrdersEmpty")}</p>
        <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
          {t("cartEmptyCta")}
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
        {orders.map((o) => (
          <li key={o.token}>
            <Link
              href={href(`/shop/comanda/${encodeURIComponent(o.token)}`)}
              className="flex min-h-14 items-center gap-3.5 rounded-[14px] border-[1.5px] border-(--line) px-4 py-3 no-underline hover:border-(--ink)"
            >
              <ReceiptIcon size={22} />
              <span className="flex flex-1 flex-col">
                <b>{o.number ? t("orderNumberShort", { number: o.number }) : t("orderNoNumber")}</b>
                {o.at ? (
                  <span className="text-sm text-(--muted)">{formatOrderDate(new Date(o.at).toISOString(), lang)}</span>
                ) : null}
              </span>
              <span aria-hidden className="text-(--muted2)">
                →
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="m-0 text-sm text-(--muted2)">{t("myOrdersNote")}</p>
    </div>
  );
}
