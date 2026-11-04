import {
  BUSINESS_CARD_BACK_PAPER_TYPE,
  BUSINESS_CARD_DEFAULT_PRESET_ID,
  BUSINESS_CARD_FRONT_PAPER_TYPE,
  findBusinessCardPreset,
  layoutSizeFromTrim,
} from "@/lib/businessCard/businessCardConstants";
import { businessCardTrimSize, parseBusinessCardLineData } from "@/lib/businessCard/parseBusinessCardLineData";
import type { BusinessCardFrame } from "./fileMetaFormat";

const cmToMm = (cm: number): number => Math.round(cm * 100) / 10;

/**
 * Card size a business-card file is measured against: the line's own card
 * (trim + bleed) when it has one, else the default 90×50 card → 94×54 mm.
 * Null for files that are not business-card artwork.
 */
export function businessCardFileFrame(
  paperType: string | null | undefined,
  businessCardLineData: unknown,
): BusinessCardFrame | null {
  if (paperType !== BUSINESS_CARD_FRONT_PAPER_TYPE && paperType !== BUSINESS_CARD_BACK_PAPER_TYPE) return null;
  const data = parseBusinessCardLineData(businessCardLineData);
  if (data) {
    const trim = businessCardTrimSize(data);
    return {
      widthMm: cmToMm(data.cardWidthCm),
      heightMm: cmToMm(data.cardHeightCm),
      trimWidthMm: cmToMm(trim.widthCm),
      trimHeightMm: cmToMm(trim.heightCm),
    };
  }
  const preset = findBusinessCardPreset(BUSINESS_CARD_DEFAULT_PRESET_ID) ?? { trimWidthCm: 9, trimHeightCm: 5 };
  const card = layoutSizeFromTrim(preset.trimWidthCm, preset.trimHeightCm);
  return {
    widthMm: cmToMm(card.cardWidthCm),
    heightMm: cmToMm(card.cardHeightCm),
    trimWidthMm: cmToMm(preset.trimWidthCm),
    trimHeightMm: cmToMm(preset.trimHeightCm),
  };
}
