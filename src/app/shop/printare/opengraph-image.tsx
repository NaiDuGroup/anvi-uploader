import { SHOP_OG_CONTENT_TYPE, SHOP_OG_SIZE, shopOgImage } from "@/lib/storefront/ogImage";

/** /printare link preview (Romanian: preview bots send no language cookie). */
export const alt = "Printare foto și documente";
export const size = SHOP_OG_SIZE;
export const contentType = SHOP_OG_CONTENT_TYPE;

export default function Image() {
  return shopOgImage({
    eyebrow: "Printare",
    title: "Printare foto și documente",
    subtitle: "PDF, Word, JPG, PNG, HEIC · ridicare din atelier sau livrare prin curier",
  });
}
