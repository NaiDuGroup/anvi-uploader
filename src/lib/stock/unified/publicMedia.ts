import { publicAssetUrlFromStorageKey } from "@/lib/mug/publicAssetUrl";
import { parseStockItemDescription, type StockItemDescription } from "./itemDescription";

/** Product window on the public order pages: extra photos and the description. */
export type PublicProductMedia = {
  galleryPublicUrls: string[];
  description: StockItemDescription | null;
};

export function publicProductMedia(item: { galleryImages: string[]; description: unknown }): PublicProductMedia {
  return {
    galleryPublicUrls: item.galleryImages
      .map((k) => publicAssetUrlFromStorageKey(k))
      .filter((u): u is string => !!u),
    description: parseStockItemDescription(item.description),
  };
}
