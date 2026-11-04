import type { Metadata } from "next";
import { CartPageClient } from "@/components/shop/CartPageClient";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { loadShopLineLabels } from "@/lib/storefront/lineLabelsServer";
import { SHOP_PRIVATE_ROBOTS } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())("cartTitle"), robots: SHOP_PRIVATE_ROBOTS };
}

export default async function ShopCartPage() {
  const lang = await getShopLang();
  const t = shopT(lang);
  const labels = await loadShopLineLabels(lang);
  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-5 px-4 pt-5 pb-10 sm:px-6 sm:pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="m-0 text-[28px] font-extrabold sm:text-4xl">{t("cartTitle")}</h1>
        <span className="text-sm text-(--muted2)">{t("cartSteps")}</span>
      </div>
      <CartPageClient labels={labels} />
    </main>
  );
}
