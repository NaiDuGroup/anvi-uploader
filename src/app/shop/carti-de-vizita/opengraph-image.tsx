import { SHOP_OG_CONTENT_TYPE, SHOP_OG_SIZE, shopOgImage } from "@/lib/storefront/ogImage";

export const alt = "Cărți de vizită 90×50 mm";
export const size = SHOP_OG_SIZE;
export const contentType = SHOP_OG_CONTENT_TYPE;

export default function Image() {
  return shopOgImage({
    eyebrow: "Catalog",
    title: "Cărți de vizită 90×50 mm",
    subtitle: "Hârtie 350 g/m², color · tipar pe Ricoh Pro C5200s",
  });
}
