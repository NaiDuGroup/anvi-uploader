import type { Metadata } from "next";
import { PrintPage } from "@/components/shop/PrintPage";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const t = shopT(await getShopLang());
  return { title: t("photoTileTitle"), description: t("printIntro") };
}

/** Photo & document printing with delivery (print.anvi.md stays the walk-in uploader). */
export default async function ShopPrintPage({ searchParams }: Props) {
  const rawEdit = (await searchParams).edit;
  const editId: string | null = typeof rawEdit === "string" && rawEdit.length <= 64 ? rawEdit : null;
  return <PrintPage lang={await getShopLang()} base={await getShopBase()} editId={editId} />;
}
