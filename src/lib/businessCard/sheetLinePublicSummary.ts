import { businessCardTrimSize, parseBusinessCardLineData } from "./parseBusinessCardLineData";
import type { BusinessCardSides } from "./businessCardConstants";
import { sheetPaperDisplayName } from "@/lib/sheetProduct/sheetProductConfig";
import { stickerSheetSummaryRu } from "@/lib/stickerSheet/stickerSheet";
import { postcardFinishingRu, postcardSummaryRu } from "@/lib/postcard/postcard";

/**
 * Business card / flyer line without prices or paper costs: paper, finished
 * size, sides and the run. `production` adds the imposition (sheets used,
 * pieces per sheet) for staff views.
 */
export type SheetLinePublicSummary = {
  /** «Coated 300 · 300 g/m²». */
  paperName: string;
  widthCm: number;
  heightCm: number;
  sides: BusinessCardSides;
  quantity: number;
  sheetsUsed?: number;
  cardsPerSheet?: number;
  /** Storefront card (staff view): crop to fill / fit with white margins. */
  artworkFit?: "cover" | "contain";
  /** Storefront print shop: the product id (`printShop/config.ts`) — flyers, invitations, calendars… */
  shopProduct?: string;
  /** Storefront finishing: lamination (print shop, business cards) and rounded corners (business cards). */
  lamination?: "gloss" | "matte";
  roundedCorners?: boolean;
  /** Sticker sheets: «A3+ · круг Ø65 · с резкой». */
  stickerRu?: string;
  /** Postcards: «Приглашение · A5 · A4+» and the finishing («ламинация мат · биговка 1»). */
  postcardRu?: string;
  postcardFinishingRu?: string;
};

export function toSheetLinePublicSummary(
  raw: unknown,
  opts: { production: boolean },
): SheetLinePublicSummary | null {
  const data = parseBusinessCardLineData(raw);
  if (!data) return null;
  const trim = businessCardTrimSize(data);
  const lamination = data.shopPrint?.lamination ?? data.shopFinishing?.lamination;
  return {
    paperName: sheetPaperDisplayName(data.paperSnapshot),
    widthCm: trim.widthCm,
    heightCm: trim.heightCm,
    sides: data.sides,
    quantity: data.quantity,
    ...(data.shopPrint?.product ? { shopProduct: data.shopPrint.product } : {}),
    ...(lamination === "gloss" || lamination === "matte" ? { lamination } : {}),
    ...(data.shopFinishing?.roundedCorners ? { roundedCorners: true } : {}),
    ...(data.stickerSheet ? { stickerRu: stickerSheetSummaryRu(data.stickerSheet) } : {}),
    ...(data.postcard
      ? { postcardRu: postcardSummaryRu(data), postcardFinishingRu: postcardFinishingRu(data.postcard) }
      : {}),
    ...(opts.production
      ? {
          sheetsUsed: data.sheetsUsed,
          cardsPerSheet: data.cardsPerSheet,
          ...(data.artworkFit === "cover" || data.artworkFit === "contain" ? { artworkFit: data.artworkFit } : {}),
        }
      : {}),
  };
}
