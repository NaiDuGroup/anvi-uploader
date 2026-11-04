import type { Metadata } from "next";
import { BusinessCardPage } from "@/components/shop/BusinessCardPage";
import { shopT } from "@/lib/storefront/i18n";
import { getShopLang } from "@/lib/storefront/lang";
import { getShopBase } from "@/lib/storefront/shopBase";
import { breadcrumbJsonLd, previewText, productJsonLd, shopFromPrice, shopPageMetadata } from "@/lib/storefront/shopSeo";
import { shopBusinessCardProduct } from "@/lib/storefront/businessCardProduct";
import { JsonLd } from "@/components/shop/JsonLd";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ edit?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getShopLang();
  const t = shopT(lang);
  // Image: the generated `opengraph-image` of this segment (the SVG photo does not work in previews).
  return shopPageMetadata({ title: t("bcTitle"), description: previewText(t("bcDescription")), path: "/carti-de-vizita", lang, ownImage: true });
}

/** Business cards: the category is the product (one configurable product). */
export default async function ShopBusinessCardsPage({ searchParams }: Props) {
  const rawEdit = (await searchParams).edit;
  const editId: string | null = typeof rawEdit === "string" && rawEdit.length <= 64 ? rawEdit : null;
  const lang = await getShopLang();
  const t = shopT(lang);
  const bc = shopBusinessCardProduct(lang);
  return (
    <>
      <JsonLd
        data={[
          productJsonLd(
            { name: bc.name, description: bc.description, slug: bc.slug, image: null, price: shopFromPrice(bc), available: true },
            "/carti-de-vizita",
          ),
          breadcrumbJsonLd([
            { name: t("home"), path: "/" },
            { name: t("bcNav"), path: "/carti-de-vizita" },
          ]),
        ]}
      />
      <BusinessCardPage lang={lang} base={await getShopBase()} editId={editId} />
    </>
  );
}
