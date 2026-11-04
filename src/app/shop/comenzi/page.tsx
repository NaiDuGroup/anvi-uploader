import type { Metadata } from "next";
import { MyOrdersClient } from "@/components/shop/MyOrdersClient";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("myOrders"), robots: SHOP_PRIVATE_ROBOTS };
}

export default async function ShopMyOrdersPage() {
  const t = shopT(await getShopLang());
  return (
    <main className="mx-auto flex max-w-[860px] flex-col gap-5 px-4 pt-6 pb-12 sm:px-6 sm:pt-10">
      <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("myOrders")}</h1>
      <MyOrdersClient />
    </main>
  );
}
