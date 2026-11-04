import type { Metadata } from "next";
import Link from "next/link";
import { ReceiptIcon } from "@/components/shop/ShopIcons";
import { listAccountOrders } from "@/lib/shop/account/data";
import { requireShopCustomer } from "@/lib/shop/account/pageAuth";
import { formatOrderDate, formatPrice } from "@/lib/storefront/format";
import { shopT, type ShopStringKey } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("myOrders"), robots: SHOP_PRIVATE_ROBOTS };
}

/** `/cont/comenzi`: the signed-in customer's storefront orders, newest first. */
export default async function ShopAccountOrdersPage() {
  const me = await requireShopCustomer("/cont/comenzi");
  const lang = await getShopLang();
  const t = shopT(lang);
  const href = await getShopHref();
  const orders = await listAccountOrders(me.id);
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <Link href={href("/shop/cont")} className="self-start text-sm font-semibold">
        {t("accBack")}
      </Link>
      <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("myOrders")}</h1>
      {orders.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 text-lg text-(--muted)">{t("accOrdersEmpty")}</p>
          <p className="m-0 text-sm text-(--muted2)">{t("accOrdersHint", { email: me.email })}</p>
          <Link href={href("/shop")} className="shop-btn-dark rounded-xl bg-(--ink) px-6 py-3.5 font-bold no-underline">
            {t("cartEmptyCta")}
          </Link>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0">
          {orders.map((o) => (
            <li key={o.orderNumber}>
              <Link
                href={href(`/shop/cont/comenzi/${o.orderNumber}`)}
                className="flex min-h-16 items-center gap-3.5 rounded-[14px] border-[1.5px] border-(--line) px-4 py-3 no-underline hover:border-(--ink)"
              >
                <ReceiptIcon size={22} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <b>{t("orderNumberShort", { number: o.orderNumber })}</b>
                  <span className="text-sm text-(--muted)">
                    {[formatOrderDate(o.createdAt, lang), formatPrice(o.total, lang), o.trackingNumber ? t("accTracking", { n: o.trackingNumber }) : ""]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                    o.status === "pending_payment" || o.status === "issue" ? "bg-(--warn-soft) text-(--warn)" : "bg-(--soft) text-(--ink)"
                  }`}
                >
                  {t(`accSt${o.status}` as ShopStringKey)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
