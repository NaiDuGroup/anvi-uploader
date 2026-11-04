import { SHOP_OG_CONTENT_TYPE, SHOP_OG_SIZE, shopOgImage } from "@/lib/storefront/ogImage";

export const alt = "Despre noi";
export const size = SHOP_OG_SIZE;
export const contentType = SHOP_OG_CONTENT_TYPE;

export default function Image() {
  return shopOgImage({ title: "Despre noi", subtitle: "Atelier de imprimare în Chișinău: UV, DTF, sublimare, Ricoh" });
}
