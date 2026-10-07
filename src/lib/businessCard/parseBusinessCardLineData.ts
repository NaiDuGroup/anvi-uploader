import { BUSINESS_CARD_BLEED_CM } from "./businessCardConstants";
import type { BusinessCardLineData } from "./types";

export function parseBusinessCardLineData(raw: unknown): BusinessCardLineData | null {
  if (raw == null || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (
    typeof o.quantity !== "number" ||
    typeof o.cardsPerSheet !== "number" ||
    typeof o.sheetsUsed !== "number" ||
    typeof o.cardWidthCm !== "number" ||
    typeof o.cardHeightCm !== "number" ||
    o.paperSnapshot == null ||
    typeof o.paperSnapshot !== "object" ||
    o.layout == null ||
    typeof o.layout !== "object"
  ) {
    return null;
  }
  return raw as BusinessCardLineData;
}

/**
 * Finished size to show the customer. Lines written before trim sizes existed
 * stored only the sheet footprint (e.g. 9.4 × 5.4), so shrink it back by the
 * bleed the studio has always applied.
 */
export function businessCardTrimSize(data: BusinessCardLineData): {
  widthCm: number;
  heightCm: number;
} {
  if (data.cardTrimWidthCm != null && data.cardTrimHeightCm != null) {
    return { widthCm: data.cardTrimWidthCm, heightCm: data.cardTrimHeightCm };
  }
  const bleed = data.bleedCm ?? BUSINESS_CARD_BLEED_CM;
  const shrink = (cm: number): number =>
    Math.round((cm - 2 * bleed) * 1000) / 1000;
  return {
    widthCm: shrink(data.cardWidthCm),
    heightCm: shrink(data.cardHeightCm),
  };
}
