import { dtfZoneIdFromPaperType } from "@/lib/dtf/dtfConstants";
import { uvZoneIdFromPaperType } from "@/lib/uv/uvConstants";
import { isSublimationFilePaperType } from "@/lib/sublimation/sublimationConstants";
import {
  BUSINESS_CARD_BACK_PAPER_TYPE,
  BUSINESS_CARD_FRONT_PAPER_TYPE,
} from "@/lib/businessCard/businessCardConstants";
import type { TranslationDictionary } from "@/lib/i18n/types";

/**
 * Maps stored `paperType` keys to upload-form labels for the active locale.
 * Internal tags (`business_card_front`, `mug_layout`…) always get a human label;
 * `productType` tells sticker artwork apart from card faces.
 */
export function formatPaperTypeLabel(
  paper: string | null | undefined,
  upload: TranslationDictionary["upload"],
  productType?: string | null,
): string {
  if (paper == null || paper === "") return "—";
  switch (paper) {
    case "A0":
      return upload.paperA0;
    case "A1":
      return upload.paperA1;
    case "A2":
      return upload.paperA2;
    case "A3":
      return upload.paperA3;
    case "A4":
      return upload.paperA4;
    case "A5":
      return upload.paperA5;
    case "A6":
      return upload.paperA6;
    case "other":
      return upload.paperOther;
    case BUSINESS_CARD_FRONT_PAPER_TYPE:
    case BUSINESS_CARD_BACK_PAPER_TYPE:
      if (productType === "sticker_sheet") return upload.fileKindStickerArtwork;
      return paper === BUSINESS_CARD_BACK_PAPER_TYPE ? upload.fileKindBack : upload.fileKindFront;
    case "large_format":
      return upload.fileKindLargeFormat;
    case "mug_layout":
      return upload.fileKindMugLayout;
    case "notebook_layout":
      return upload.fileKindNotebookLayout;
    case "pen_layout":
      return upload.fileKindPenLayout;
    default: {
      if (dtfZoneIdFromPaperType(paper)) return "DTF";
      if (uvZoneIdFromPaperType(paper)) return "UV";
      if (isSublimationFilePaperType(paper)) return "SUBL";
      const otherMatch = paper.match(/^other:(.+)x(.+)$/);
      if (otherMatch) return `${upload.paperOther} (${otherMatch[1]}×${otherMatch[2]} cm)`;
      // A plain format name («A3+», «SRA3») reads fine; any other internal tag does not.
      return /^[A-Za-z0-9+]+$/.test(paper) ? paper : upload.fileKindArtwork;
    }
  }
}
