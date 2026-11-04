import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutClient } from "@/components/shop/CheckoutClient";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { loadShopContacts } from "@/lib/storefront/contacts";
import { loadShopLineLabels } from "@/lib/storefront/lineLabelsServer";
import { formatShopHours } from "@/lib/storefront/studioText";
import { safeHttpUrl } from "@/lib/studioInfo/studioInfo";
import { getShopHref } from "@/lib/storefront/shopBase";
import { shopPaymentState } from "@/lib/shop/paymentMode";
import { hasShopTesterAccess } from "@/lib/shop/testerAccess";
import { getShopCustomer } from "@/lib/shop/account/session";
import { accountCheckoutDraft } from "@/lib/storefront/checkoutDraft";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("checkoutTitle"), robots: { index: false } };
}

export default async function ShopCheckoutPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const href = await getShopHref();
  const [labels, contacts] = await Promise.all([loadShopLineLabels(lang), loadShopContacts()]);
  const pickup = { address: contacts.address, hours: formatShopHours(contacts.hours, lang), mapUrl: safeHttpUrl(contacts.mapUrl) };
  // Say it before the form is filled: without a way to pay, checkout refuses (503 payment_unavailable).
  const paymentAvailable = shopPaymentState(process.env, { tester: await hasShopTesterAccess() }) !== "unavailable";
  const me = await getShopCustomer();
  const account = me ? accountCheckoutDraft(me) : null;
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("checkoutTitle")}</h1>
        <span className="text-sm text-(--muted2)">
          <Link href={href("/shop/cos")}>{t("cartTitle")}</Link> → <b className="text-(--ink)">{t("checkoutTitle")}</b>
        </span>
      </div>
      <CheckoutClient paymentAvailable={paymentAvailable} labels={labels} pickup={pickup} account={account} />
    </main>
  );
}
