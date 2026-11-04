import type { Metadata } from "next";
import { LEGAL_TITLE, LegalPage } from "@/components/shop/LegalPage";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { shopPageMetadata } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getShopLang();
  return shopPageMetadata({ title: shopT(lang)(LEGAL_TITLE.retur), path: "/retur", lang });
}

export default async function ShopLegalPage() {
  return <LegalPage doc="retur" lang={await getShopLang()} />;
}
