import type { Metadata } from "next";
import { BusinessCardPage } from "@/components/shop/BusinessCardPage";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = shopT(await getShopLang());
  return { title: t("bcTitle"), description: t("bcDescription") };
}

/** Business cards: the category is the product (one configurable product). */
export default async function ShopBusinessCardsPage({ searchParams }: Props) {
  const rawEdit = (await searchParams).edit;
  const editId: string | null = typeof rawEdit === "string" && rawEdit.length <= 64 ? rawEdit : null;
  return <BusinessCardPage lang={await getShopLang()} base={await getShopBase()} editId={editId} />;
}
