import type { Metadata } from "next";
import Link from "next/link";
import { AccountDetailsForm } from "@/components/shop/account/AccountForms";
import { requireShopCustomer } from "@/lib/shop/account/pageAuth";
import { accountCheckoutDraft } from "@/lib/storefront/checkoutDraft";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopHref } from "@/lib/storefront/shopBase";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("accDetails"), robots: { index: false } };
}

/** `/cont/date`: name, phone and saved delivery address of the account. */
export default async function ShopAccountDetailsPage() {
  const me = await requireShopCustomer("/cont/date");
  const t = shopT(await getShopLang());
  const href = await getShopHref();
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <Link href={href("/shop/cont")} className="self-start text-sm font-semibold">
        {t("accBack")}
      </Link>
      <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("accDetails")}</h1>
      <AccountDetailsForm initial={accountCheckoutDraft(me)} />
    </main>
  );
}
