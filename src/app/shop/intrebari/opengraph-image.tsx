import { SHOP_OG_CONTENT_TYPE, SHOP_OG_SIZE, shopOgImage } from "@/lib/storefront/ogImage";

export const alt = "Întrebări frecvente";
export const size = SHOP_OG_SIZE;
export const contentType = SHOP_OG_CONTENT_TYPE;

export default function Image() {
  return shopOgImage({ title: "Întrebări frecvente", subtitle: "Fișiere, rezoluție, livrare, plată și cont" });
}
