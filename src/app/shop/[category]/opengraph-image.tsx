import { SHOP_CATEGORIES } from "@/lib/storefront/catalogConfig";
import { SHOP_OG_CONTENT_TYPE, SHOP_OG_SIZE, shopOgImage } from "@/lib/storefront/ogImage";

/** Category link preview: the category name in Romanian (preview bots send no language cookie). */
export const alt = "ANVI";
export const size = SHOP_OG_SIZE;
export const contentType = SHOP_OG_CONTENT_TYPE;

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const c = SHOP_CATEGORIES.find((x) => x.slug === category);
  return shopOgImage({
    eyebrow: "Catalog",
    title: c?.name.ro ?? "Produse personalizate",
    subtitle: "Cu designul tău · producție proprie în Chișinău",
  });
}
