import type { Metadata } from "next";
import { InfoPage, infoPageMetadata } from "@/components/shop/InfoPage";
import { getShopLang } from "@/lib/storefront/lang";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return infoPageMetadata("livrare-si-plata", await getShopLang());
}

export default function ShopInfoPage() {
  return <InfoPage slug="livrare-si-plata" />;
}
