import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutClient } from "@/components/shop/CheckoutClient";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("checkoutTitle"), robots: { index: false } };
}

export default async function ShopCheckoutPage() {
  const t = shopT(await getShopLang());
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("checkoutTitle")}</h1>
        <span className="text-sm text-(--muted2)">
          <Link href="/shop/cos">{t("cartTitle")}</Link> → <b className="text-(--ink)">{t("checkoutTitle")}</b>
        </span>
      </div>
      <CheckoutClient />
    </main>
  );
}
