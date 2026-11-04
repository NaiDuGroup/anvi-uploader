import { countPdfPages, printFileKind, type PrintFileKind } from "@/lib/storefront/printFiles";
import {
  SHOP_PRINT_MAX_PAGES,
  type ShopDocItem,
  type ShopPrintMode,
  type ShopPrintQuote,
} from "@/lib/storefront/printPrices";

/**
 * Storefront document printing: the server never trusts the page count the
 * browser sent. At checkout every PDF is read from storage (pdf-lib) and its
 * real page count prices the line and goes to `File.pageCount`; an image is
 * one page. Word / ODT / RTF (not readable here), a PDF over
 * `SHOP_PRINT_COUNT_MAX_BYTES` or one that does not open keep the customer's
 * count and are flagged for staff («стр. указаны клиентом»).
 */

/** PDFs above this are not downloaded for counting (memory / time of the checkout function). */
export const SHOP_PRINT_COUNT_MAX_BYTES = 100 * 1024 * 1024;
/** Bytes read for counting in one checkout at most; the rest keep the declared count (flagged). */
export const SHOP_PRINT_COUNT_BUDGET_BYTES = 400 * 1024 * 1024;

/** How the page count of an item was set: read by the server, or as the customer stated it. */
export type PrintPagesSource = "counted" | "customer";

/** File name part of an upload key («uploads/<ms>-<id>-<name>» → «<name>»). */
export function uploadKeyFileName(key: string): string {
  const base: string = key.split("/").pop() ?? key;
  const m = /^\d{13}-[^-]+-(.+)$/.exec(base);
  return m ? m[1]! : base;
}

/**
 * Kind of a print file from what the upload recorded: the stored key's name
 * and the file name must both be a type the mode takes (photos: images only;
 * documents: PDF, Word / ODT / RTF or images). Null when either is not.
 */
export function serverPrintFileKind(file: { fileKey: string; fileName: string }, mode: ShopPrintMode): PrintFileKind | null {
  const byKey = printFileKind({ name: uploadKeyFileName(file.fileKey) }, mode);
  const byName = printFileKind({ name: file.fileName }, mode);
  if (!byKey || !byName) return null;
  // The stored object decides (a «.pdf» key is read as a PDF whatever the display name says).
  return byKey;
}

/** Files of a print line of a type its mode does not take: «file_type», else null. */
export function shopPrintFileTypeProblem(
  quote: ShopPrintQuote,
  files: readonly { fileKey: string; fileName: string }[],
): "file_type" | null {
  return files.every((f) => serverPrintFileKind(f, quote.mode) != null) ? null : "file_type";
}

/** What the server learned about one document file. */
export type PrintPageFact =
  | { kind: "pdf"; pages: number }
  /** PDF too big to read, broken, or the budget is spent. */
  | { kind: "pdf"; pages: null }
  | { kind: "image" }
  | { kind: "word" };

/**
 * The document line with the server's page counts. `changed`: some item's
 * pages differ from what the customer sent (the line must be re-priced).
 */
export function applyPrintPageFacts(
  quote: Extract<ShopPrintQuote, { mode: "doc" }>,
  facts: readonly PrintPageFact[],
): { quote: Extract<ShopPrintQuote, { mode: "doc" }>; sources: PrintPagesSource[]; changed: boolean } {
  let changed = false;
  const sources: PrintPagesSource[] = [];
  const items: ShopDocItem[] = quote.items.map((item, i) => {
    const f = facts[i];
    let pages: number | null = null;
    if (f?.kind === "image") pages = 1;
    else if (f?.kind === "pdf" && f.pages != null && f.pages <= SHOP_PRINT_MAX_PAGES) pages = f.pages;
    if (pages == null) {
      sources.push("customer");
      return item;
    }
    sources.push("counted");
    if (pages !== item.pages) changed = true;
    return { ...item, pages };
  });
  return { quote: { ...quote, items }, sources, changed };
}

/** Reads a stored object for counting: bytes, «too big», or null (missing). */
export type ShopFileReader = (key: string, maxBytes: number) => Promise<{ bytes: Uint8Array } | { tooBig: true } | null>;

/**
 * Page facts of a document line's stored files, read one at a time (one PDF
 * in memory at once). `budget.left` is shared by the lines of one checkout.
 */
export async function readPrintPageFacts(
  files: readonly { fileKey: string; fileName: string }[],
  read: ShopFileReader,
  budget: { left: number } = { left: SHOP_PRINT_COUNT_BUDGET_BYTES },
): Promise<PrintPageFact[]> {
  const out: PrintPageFact[] = [];
  for (const f of files) {
    const kind = serverPrintFileKind(f, "doc");
    if (kind === "image") {
      out.push({ kind: "image" });
      continue;
    }
    if (kind !== "pdf") {
      out.push({ kind: "word" });
      continue;
    }
    const max: number = Math.min(SHOP_PRINT_COUNT_MAX_BYTES, budget.left);
    let pages: number | null = null;
    if (max > 0) {
      try {
        const got = await read(f.fileKey, max);
        if (got && "bytes" in got) {
          budget.left -= got.bytes.byteLength;
          pages = isPdfBytes(got.bytes) ? await countPdfPages(got.bytes) : null;
        }
      } catch (e) {
        console.error("[shop-checkout] page count read failed:", f.fileKey, e);
        pages = null;
      }
    }
    out.push({ kind: "pdf", pages });
  }
  return out;
}

/** «%PDF-» within the first KiB (some writers put junk before the header). */
export function isPdfBytes(bytes: Uint8Array): boolean {
  const head: string = Buffer.from(bytes.subarray(0, 1024)).toString("latin1");
  return head.includes("%PDF-");
}
