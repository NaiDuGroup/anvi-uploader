import { isStickerSheetPaper } from "@/lib/stickerSheet/stickerSheet";

/** A3+ / SRA3 sheet (cm): the largest the Ricoh takes. */
export const A3_NATIVE_SHEET_CM = { widthCm: 32, heightCm: 45 } as const;

type SizeValue = number | string | { toString(): string } | null | undefined;

function cm(v: SizeValue): number {
  if (v == null) return Number.NaN;
  return typeof v === "number" ? v : Number(v.toString());
}

/**
 * «A3+ native» sheet paper: stocked as whole A3+ sheets (≥ 32×45 either way,
 * e.g. textured «Tintoretto Gesso 300g») and printed only on A3+ — never cut
 * to A4+. Postcards on it are forced to A3+, priced per A3+ sheet (one side /
 * both sides) and write off 1 sheet per A3+; business cards, flyers and the
 * storefront never use it. Sticker paper (also A3+) is its own product.
 */
export function isA3NativePaper(paper: {
  name?: string | null;
  sheetWidthCm?: SizeValue;
  sheetHeightCm?: SizeValue;
}): boolean {
  const w = cm(paper.sheetWidthCm);
  const h = cm(paper.sheetHeightCm);
  if (!(w > 0 && h > 0)) return false;
  const short = Math.min(w, h);
  const long = Math.max(w, h);
  if (short + 0.001 < A3_NATIVE_SHEET_CM.widthCm || long + 0.001 < A3_NATIVE_SHEET_CM.heightCm) return false;
  return !isStickerSheetPaper({ name: paper.name ?? "" });
}

/** Papers business cards / flyers / the storefront may use: neither sticker nor A3+-only paper. */
export function isRegularSheetPaper(paper: Parameters<typeof isA3NativePaper>[0]): boolean {
  return !isStickerSheetPaper({ name: paper.name ?? "" }) && !isA3NativePaper(paper);
}
