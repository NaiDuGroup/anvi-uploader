/**
 * Wizard row state of a «Открытки и карточки» line. Paper, size, sides and the
 * run live on the shared sheet-product fields of the row (`bcSheetPaperId`,
 * `bcPresetId`, `bcSides`, `copiesStr`); this is the rest.
 */

import type { BusinessCardLineData } from "@/lib/businessCard/types";
import type { PostcardOptions } from "./postcard";

export type PostcardDraft = PostcardOptions;

export function defaultPostcardDraft(): PostcardDraft {
  return {
    purpose: "postcard",
    format: "A4+",
    wholeSheet: false,
    lamination: "none",
    creaseLines: 0,
    roundedCorners: false,
    figuredCut: false,
  };
}

/** Edit mode: the draft a stored line was made from. */
export function postcardDraftFromLineData(data: BusinessCardLineData): PostcardDraft | null {
  const pc = data.postcard;
  if (!pc) return null;
  return {
    purpose: pc.purpose,
    format: pc.format,
    wholeSheet: pc.wholeSheet,
    lamination: pc.lamination,
    creaseLines: pc.creaseLines,
    roundedCorners: pc.roundedCorners,
    figuredCut: pc.figuredCut,
  };
}

/** What drives the price (purpose is only a label) — compared with the stored line in edit mode. */
export function postcardPricingKey(d: PostcardOptions | null | undefined): string | null {
  if (!d) return null;
  return [d.format, d.wholeSheet ? "whole" : "cut", d.lamination, d.creaseLines, d.roundedCorners ? "r" : "-", d.figuredCut ? "f" : "-"].join("|");
}
