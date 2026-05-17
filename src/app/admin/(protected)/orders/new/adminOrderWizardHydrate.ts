import type { PaperType } from "@/app/admin/_lib/constants";
import { PAPER_OPTIONS } from "@/app/admin/_lib/constants";
import type { SlotPaperPrint } from "@/app/admin/_components/AdminPaperRowFields";

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
