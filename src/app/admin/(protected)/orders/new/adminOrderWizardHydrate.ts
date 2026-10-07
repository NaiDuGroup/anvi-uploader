import type { PaperType } from "@/app/admin/_lib/constants";
import { PAPER_OPTIONS } from "@/app/admin/_lib/constants";
import type { SlotPaperPrint } from "@/app/admin/_components/AdminPaperRowFields";
import { businessCardFaces } from "@/lib/businessCard/businessCardConstants";

/**
 * Which stored files of one order line become their own wizard row.
 *
 * Normally that is every file. A double-sided business-card run is the
 * exception: both faces belong to the same line and are imposed on the same
 * sheet, so the line must come back as a single row with the reverse carried
 * alongside it — one row per file would bill and impose two separate runs.
 */
export function wizardRowFilesForLine<
  T extends { id: string; paperType: string | null },
>(
  productType: string,
  files: readonly T[],
): { rowFiles: T[]; businessCardBack: T | null } {
  if (productType !== "business_card") {
    return { rowFiles: [...files], businessCardBack: null };
  }
  const { front, back } = businessCardFaces(files);
  return {
    rowFiles: front != null ? [front] : [],
    businessCardBack: back,
  };
}

/** Restore admin paper row state from stored `File` row on an order line. */
export function paperPrintFromStoredFile(f: {
  paperType: string | null;
  color: string;
  pageCount: number | null;
}): SlotPaperPrint {
  const raw = f.paperType ?? "A4";
  if (raw.startsWith("other:")) {
    const rest = raw.slice(6);
    const [w, h] = rest.split("x");
    return {
      color: f.color === "color" ? "color" : "bw",
      paperType: "other",
      customWidth: w?.trim() ?? "",
      customHeight: h?.trim() ?? "",
      pageCount: f.pageCount ?? undefined,
    };
  }
  const pt = PAPER_OPTIONS.includes(raw as PaperType)
    ? (raw as PaperType)
    : "A4";
  return {
    color: f.color === "color" ? "color" : "bw",
    paperType: pt,
    customWidth: "",
    customHeight: "",
    pageCount: f.pageCount ?? undefined,
  };
}
