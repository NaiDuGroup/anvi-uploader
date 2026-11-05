import { psProduct } from "@/lib/storefront/printShop/config";

/** Number for a size label: «14.8» → «14,8» (Russian decimal comma). */
function cmRu(raw: string): string {
  const n = Number(raw.replace(",", "."));
  if (!Number.isFinite(n)) return raw;
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

/**
 * Human paper format of a paper-print line for the board: «A4» stays as is,
 * a stored custom size «other:21x14.8» becomes «21×14,8 см».
 */
export function paperFormatLabelRu(paperType: string): string {
  const m = /^other:([\d.,]+)x([\d.,]+)$/.exec(paperType);
  if (m) return `${cmRu(m[1])}×${cmRu(m[2])} см`;
  return paperType;
}

/**
 * Staff name of the storefront print-shop product a paper line was ordered
 * as (`OrderLine.shopLineData` of a «Tipografie» line, e.g. a desk calendar →
 * «Календарь настольный на пружине»); null for studio lines and other kinds.
 */
export function shopPaperProductNameRu(shopLineData: unknown): string | null {
  if (shopLineData == null || typeof shopLineData !== "object") return null;
  const d = shopLineData as { kind?: unknown; quote?: unknown };
  if (d.kind !== "sheetShop" || d.quote == null || typeof d.quote !== "object") return null;
  const productId = (d.quote as { product?: unknown }).product;
  if (typeof productId !== "string") return null;
  return psProduct(productId)?.staffRu ?? null;
}

/**
 * Board label of a paper-print line: the storefront product name with the
 * format («Календарь настольный на пружине · 21×14,8 см»), or the format alone.
 */
export function paperLineLabelRu(paperType: string, shopLineData?: unknown): string {
  const format = paperFormatLabelRu(paperType);
  const product = shopPaperProductNameRu(shopLineData);
  return product ? `${product} · ${format}` : format;
}
