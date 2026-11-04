import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RepeatOrderButton } from "@/components/shop/account/AccountClients";
import { OrderStatusClient } from "@/components/shop/OrderStatusClient";
import { loadAccountOrder } from "@/lib/shop/account/data";
import { requireShopCustomer } from "@/lib/shop/account/pageAuth";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";
import { formatShopHours } from "@/lib/storefront/studioText";
import { safeHttpUrl, telegramHref, viberHref } from "@/lib/studioInfo/studioInfo";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ number: string }> };

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("myOrder"), robots: { index: false } };
}

/**
 * `/cont/comenzi/[number]`: one own order — the public order view (status,
 * EVS tracking, delivery, lines, «Plătește acum») + its files + «Repetă comanda».
 * Another account's order number answers 404.
 */
export default async function ShopAccountOrderPage({ params }: Props) {
  const { number } = await params;
  const me = await requireShopCustomer(`/cont/comenzi/${encodeURIComponent(number)}`);
  const lang = await getShopLang();
  const t = shopT(lang);
  const href = await getShopHref();
  const n = /^\d{1,9}$/.test(number) ? Number(number) : NaN;
  const order = await loadAccountOrder(me.id, n, lang);
  if (!order) notFound();
  const contacts = await loadShopContacts();
  const viber = contacts.wholesale.find((c) => c.viber) ?? null;
  const telegram = contacts.wholesale.find((c) => c.telegram) ?? null;
  const pickup = { address: contacts.address, hours: formatShopHours(contacts.hours, lang), mapUrl: safeHttpUrl(contacts.mapUrl) };
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-6 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <Link href={href("/shop/cont/comenzi")} className="self-start text-sm font-semibold">
        ← {t("myOrders")}
      </Link>
      <div className="flex flex-wrap gap-3">
        <RepeatOrderButton orderNumber={order.view.orderNumber} />
      </div>
      <OrderStatusClient
        token={order.publicToken}
        viberHref={viber ? viberHref(viber.phone) : null}
        telegramHref={telegram ? telegramHref(telegram.phone) : null}
        pickup={pickup}
      />
      {order.files.length ? (
        <section aria-labelledby="acc-order-files" className="flex max-w-[860px] flex-col gap-2">
          <h2 id="acc-order-files" className="m-0 text-xl font-extrabold">
            {t("accOrderFiles")}
          </h2>
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-(--muted)">
            {order.files.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                {f.name}
                {f.available ? null : <span className="text-(--muted2)"> — {t("accFileGone")}</span>}
              </li>
            ))}
          </ul>
          <Link href={href("/shop/cont/fisiere")} className="self-start text-sm font-semibold">
            {t("accFiles")} →
          </Link>
        </section>
      ) : null}
    </main>
  );
}
