import { SHOP_OG_CONTENT_TYPE, SHOP_OG_SIZE, shopOgImage } from "@/lib/storefront/ogImage";

/** Home page link preview (and the default of every storefront page without its own image). */
export const alt = "ANVI — produse personalizate";
export const size = SHOP_OG_SIZE;
export const contentType = SHOP_OG_CONTENT_TYPE;

export default function Image() {
  return shopOgImage({
    title: "Produse personalizate",
    subtitle: "Carnete, căni, tricouri, pixuri și cărți de vizită cu designul tău. Producție proprie în Chișinău.",
  });
}
