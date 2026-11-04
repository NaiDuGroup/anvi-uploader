import type { ShopT } from "@/lib/storefront/i18n";
import {
  isShopPrintQuote,
  photoSizeText,
  printItemPaperType,
  shopPhotoSize,
  type ShopDocItem,
  type ShopPhotoItem,
  type ShopPrintQuote,
} from "@/lib/storefront/printPrices";
import type { FileInput } from "@/lib/validations";

/**
 * Storefront photo / document printing → the order as production reads it.
 * One `paper_print` order line per cart line; one `File` row per item with
 * copies, colour, `paperType` («A4», «A3», photos «other:10x15») and the
 * page count — exactly what a print.anvi.md upload stores. What a `File`
 * row has no column for (duplex, photo finish) is in `shopLineData.printItems`
 * and shown by the admin (`ShopPrintLineSummary`) and the staff note.
 * Pure (client-safe: the admin reads `parseShopPrintLine`).
 */

/** Files of a print line: one per item, in the items' order. */
export function shopPrintFilesProblem(quote: ShopPrintQuote, files: readonly unknown[]): "required" | "count_mismatch" | null {
  if (files.length === 0) return "required";
  return files.length === quote.items.length ? null : "count_mismatch";
}

/** `File` rows of a print line (the order pipeline input). */
export function shopPrintFiles(quote: ShopPrintQuote, files: readonly { fileKey: string; fileName: string }[]): FileInput[] {
  return quote.items.map((item, i) => {
    const f = files[i]!;
    const base = { fileName: f.fileName, fileUrl: f.fileKey, copies: item.copies, paperType: printItemPaperType(quote.mode, item) };
    if (quote.mode === "doc") {
      const d = item as ShopDocItem;
      return { ...base, color: d.color, pageCount: d.pages };
    }
    return { ...base, color: "color" as const };
  });
}

/** One file of a stored print line (`shopLineData.printItems`). */
export interface ShopPrintItemRecord {
  fileName: string;
  fileKey: string;
  /** Lei for this file at order time. */
  total: number;
}

export function shopPrintItemRecords(
  files: readonly { fileKey: string; fileName: string }[],
  itemTotals: readonly number[],
): ShopPrintItemRecord[] {
  return files.map((f, i) => ({ fileName: f.fileName, fileKey: f.fileKey, total: itemTotals[i] ?? 0 }));
}

// ─── Text (customer language, or Russian for staff) ──────────────────────────

/** «A4 · Alb-negru · Față-verso · 12 pag. × 2» / «10×15 · Lucios × 3». */
export function printItemText(mode: ShopPrintQuote["mode"], item: ShopDocItem | ShopPhotoItem, t: ShopT): string {
  if (mode === "doc") {
    const d = item as ShopDocItem;
    return [
      d.format,
      d.color === "color" ? t("printColorOpt") : t("printBw"),
      d.sides === "two" ? t("printDuplex") : t("printOneSided"),
      t("printPagesN", { n: d.pages }),
    ].join(" · ") + ` × ${d.copies}`;
  }
  const p = item as ShopPhotoItem;
  const size = shopPhotoSize(p.size);
  return `${size ? photoSizeText(size) : p.size} · ${p.finish === "matte" ? t("printMatte") : t("printGlossy")} × ${p.copies}`;
}

/**
 * Options of a print line grouped by price row, for the cart and the staff
 * note: «A4 · Alb-negru · O față: 3 fișiere, 24 pag. tipărite» /
 * «10×15 · Lucios × 12 · 13×18 · Mat × 2».
 */
export function printOptionsText(quote: ShopPrintQuote, t: ShopT): string {
  if (quote.mode === "doc") {
    const groups = new Map<string, { label: string; files: number; printed: number }>();
    for (const d of quote.items as ShopDocItem[]) {
      const label = [
        d.format,
        d.color === "color" ? t("printColorOpt") : t("printBw"),
        d.sides === "two" ? t("printDuplex") : t("printOneSided"),
      ].join(" · ");
      const g = groups.get(label) ?? { label, files: 0, printed: 0 };
      g.files += 1;
      g.printed += d.pages * d.copies;
      groups.set(label, g);
    }
    return [...groups.values()]
      .map((g) => `${g.label}: ${t("printFilesN", { n: g.files })}, ${t("printPrintedPages", { n: g.printed })}`)
      .join("; ");
  }
  const groups = new Map<string, { label: string; copies: number }>();
  for (const p of quote.items as ShopPhotoItem[]) {
    const size = shopPhotoSize(p.size);
    const label = `${size ? photoSizeText(size) : p.size} · ${p.finish === "matte" ? t("printMatte") : t("printGlossy")}`;
    const g = groups.get(label) ?? { label, copies: 0 };
    g.copies += p.copies;
    groups.set(label, g);
  }
  return [...groups.values()].map((g) => `${g.label} × ${g.copies}`).join("; ");
}

export function printLineTitle(quote: ShopPrintQuote, t: ShopT): string {
  return quote.mode === "doc" ? t("printDocTitle") : t("printPhotoTitle");
}

/** «итого 57 стр.» / «15 фото» — the staff note's count of a print line. */
export function printQtyText(quote: ShopPrintQuote, t: ShopT): string {
  const n: number =
    quote.mode === "doc"
      ? (quote.items as ShopDocItem[]).reduce((s, d) => s + d.pages * d.copies, 0)
      : (quote.items as ShopPhotoItem[]).reduce((s, p) => s + p.copies, 0);
  return quote.mode === "doc" ? t("printPrintedPages", { n }) : t("printPhotosN", { n });
}

/** Per-file list for the staff note: «1) a.pdf: A4 · Ч/б · …; 2) …». */
export function printFilesNote(quote: ShopPrintQuote, files: readonly { fileName: string }[], t: ShopT): string | null {
  if (files.length === 0) return null;
  return quote.items
    .map((item, i) => `${i + 1}) ${files[i]?.fileName ?? "?"}: ${printItemText(quote.mode, item, t)}`)
    .join("; ");
}

// ─── Admin view of a stored line ─────────────────────────────────────────────

export interface ShopPrintLineRow {
  fileName: string;
  /** Options in the viewer's language (format / size, colour, sides, pages, finish, copies). */
  text: string;
  total: number | null;
}

/**
 * Rows of a stored print line (`OrderLine.shopLineData`), or null when the
 * line is not a storefront print line.
 */
export function parseShopPrintLine(raw: unknown, t: ShopT): { mode: ShopPrintQuote["mode"]; rows: ShopPrintLineRow[] } | null {
  if (raw == null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (d.kind !== "print" || !isShopPrintQuote(d.quote)) return null;
  const quote = d.quote;
  const records: unknown[] = Array.isArray(d.printItems) ? d.printItems : [];
  const rows: ShopPrintLineRow[] = quote.items.map((item, i) => {
    const r = records[i] as Partial<ShopPrintItemRecord> | undefined;
    return {
      fileName: typeof r?.fileName === "string" ? r.fileName : `#${i + 1}`,
      text: printItemText(quote.mode, item, t),
      total: typeof r?.total === "number" ? r.total : null,
    };
  });
  return { mode: quote.mode, rows };
}
