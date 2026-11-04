import { SHOP_PRINT_BIG_FILE_BYTES, type ShopPrintMode } from "./printPrices";

/**
 * Files of the photo / document print page (`/printare`): which files each
 * mode takes, the PDF page count read in the browser, the cart thumbnail of a
 * document. Client-safe (pdf-lib is loaded on demand).
 */

export type PrintFileKind = "pdf" | "image" | "word";

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|tiff?)$/i;
const WORD_EXT = /\.(docx?|odt|rtf)$/i;

/** Documents: PDF, Word / ODT (pages entered by hand) or images (one page). Photos: images only. */
export function printFileKind(file: { name: string; type?: string }, mode: ShopPrintMode): PrintFileKind | null {
  const type: string = file.type ?? "";
  const image: boolean = type.startsWith("image/") || IMAGE_EXT.test(file.name);
  if (mode === "photo") return image ? "image" : null;
  if (type === "application/pdf" || /\.pdf$/i.test(file.name)) return "pdf";
  if (image) return "image";
  if (WORD_EXT.test(file.name) || /msword|wordprocessingml|opendocument\.text|rtf/.test(type)) return "word";
  return null;
}

export const PRINT_ACCEPT: Record<ShopPrintMode, string> = {
  doc: "application/pdf,.pdf,image/jpeg,image/png,.jpg,.jpeg,.png,.doc,.docx,.odt,.rtf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  photo: "image/*,.jpg,.jpeg,.png,.heic,.heif,.webp,.tif,.tiff",
};

/** Over 200 MB: warned (slow upload) and its pages are not read in the browser. */
export function isBigPrintFile(sizeBytes: number | null | undefined): boolean {
  return (sizeBytes ?? 0) > SHOP_PRINT_BIG_FILE_BYTES;
}

/**
 * Pages of a PDF, or null when it cannot be read (broken, or the page tree
 * is encrypted): the customer then types the count. Password-protected PDFs
 * usually still open (`ignoreEncryption`: only the content is encrypted).
 */
export async function countPdfPages(data: ArrayBuffer | Uint8Array): Promise<number | null> {
  try {
    const { PDFDocument } = await import("pdf-lib");
    const doc = await PDFDocument.load(data, { ignoreEncryption: true, updateMetadata: false });
    const n: number = doc.getPageCount();
    return Number.isInteger(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

/** «4,3 MB» / «850 KB». */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1).replace(".", ",")} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** A page with a coloured badge («PDF», «DOC», «IMG») — the cart image of a document line. */
export function printDocThumbUrl(label = "PDF"): string {
  const color: string = label === "DOC" ? "#2563eb" : label === "IMG" ? "#059669" : "#dc2626";
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">`,
    `<rect width="100" height="100" fill="#f4f4f5"/>`,
    `<path d="M30 14h30l14 14v58H30z" fill="#fff" stroke="#d4d4d8" stroke-width="2"/>`,
    `<path d="M60 14v14h14" fill="none" stroke="#d4d4d8" stroke-width="2"/>`,
    `<rect x="22" y="52" width="44" height="20" rx="3" fill="${color}"/>`,
    `<text x="44" y="66.5" font-family="Arial, sans-serif" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">${label}</text>`,
    `</svg>`,
  ].join("");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
