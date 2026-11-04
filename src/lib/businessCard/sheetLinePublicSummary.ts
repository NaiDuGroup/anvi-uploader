import { businessCardTrimSize, parseBusinessCardLineData } from "./parseBusinessCardLineData";
import type { BusinessCardSides } from "./businessCardConstants";
import { sheetPaperDisplayName } from "@/lib/sheetProduct/sheetProductConfig";

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
};

export function toSheetLinePublicSummary(
  raw: unknown,
  opts: { production: boolean },
): SheetLinePublicSummary | null {
  const data = parseBusinessCardLineData(raw);
  if (!data) return null;
  const trim = businessCardTrimSize(data);
  return {
    paperName: sheetPaperDisplayName(data.paperSnapshot),
    widthCm: trim.widthCm,
    heightCm: trim.heightCm,
    sides: data.sides,
    quantity: data.quantity,
    ...(opts.production
      ? {
          sheetsUsed: data.sheetsUsed,
          cardsPerSheet: data.cardsPerSheet,
          ...(data.artworkFit === "cover" || data.artworkFit === "contain" ? { artworkFit: data.artworkFit } : {}),
        }
      : {}),
  };
}
