import type { Metadata } from "next";
import { JsonLd } from "@/components/shop/JsonLd";
import { PrintPage } from "@/components/shop/PrintPage";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { SHOP_PRINT_PATH, breadcrumbJsonLd, shopPrintPageMetadata } from "@/lib/storefront/shopSeo";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  // Image: the generated `opengraph-image` of this segment.
  return shopPrintPageMetadata(await getShopLang());
}

/** Photo & document printing with delivery (print.anvi.md stays the walk-in uploader). */
export default async function ShopPrintPage({ searchParams }: Props) {
  const rawEdit = (await searchParams).edit;
  const editId: string | null = typeof rawEdit === "string" && rawEdit.length <= 64 ? rawEdit : null;
  const lang = await getShopLang();
  const t = shopT(lang);
  return (
    <>
      <JsonLd
        data={breadcrumbJsonLd([
          { name: t("home"), path: "/" },
          { name: t("photoTileTitle"), path: SHOP_PRINT_PATH },
        ])}
      />
      <PrintPage lang={lang} base={await getShopBase()} editId={editId} />
    </>
  );
}
