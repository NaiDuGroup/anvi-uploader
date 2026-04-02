import type { TranslationDictionary } from "@/lib/i18n/types";

/** Maps stored `paperType` keys to upload-form labels for the active locale. */
export function formatPaperTypeLabel(
  paper: string | null | undefined,
  upload: TranslationDictionary["upload"],
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
    default:
      return paper;
  }
}
