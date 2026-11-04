import type { Metadata } from "next";
import { LEGAL_TITLE, LegalPage } from "@/components/shop/LegalPage";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { title: shopT(await getShopLang())(LEGAL_TITLE.termeni) };
}

export default async function ShopLegalPage() {
  return <LegalPage doc="termeni" lang={await getShopLang()} />;
}
