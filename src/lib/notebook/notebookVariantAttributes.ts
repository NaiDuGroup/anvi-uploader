import type { Prisma } from "@prisma/client";
import { NOTEBOOK_DEFAULT_PRINT } from "@/lib/printDimensions";
import {
  NOTEBOOK_PAPER_KIND_DEFAULT,
  coerceNotebookPaperKind,
  type NotebookPaperKind,
} from "./notebookPaperKind";
import { NOTEBOOK_LOOK_DEFAULTS, notebookLookJson, parseNotebookLook, type NotebookLook } from "./notebookLook";

/** Notebook-specific fields stored in `StockItem.attributes`. */
export type NotebookAttributes = {
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  paperKind: NotebookPaperKind;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
} & NotebookLook;

/** Same defaults as the legacy `notebook_products` columns. */
export const NOTEBOOK_ATTRIBUTE_DEFAULTS: NotebookAttributes = {
  coverColorHex: "#1f1f1f",
  strapColorHex: "#1f1f1f",
  bookmarkColorHex: "#c0392b",
  paperKind: NOTEBOOK_PAPER_KIND_DEFAULT,
  printWidthCm: NOTEBOOK_DEFAULT_PRINT.widthCm,
  printHeightCm: NOTEBOOK_DEFAULT_PRINT.heightCm,
  printDpi: NOTEBOOK_DEFAULT_PRINT.dpi,
  has3dPreview: true,
  ...NOTEBOOK_LOOK_DEFAULTS,
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function positiveNumber(value: unknown): number | null {
  const n: number = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Read notebook fields from item attributes, filling gaps with catalog defaults. */
export function parseNotebookAttributes(raw: unknown): NotebookAttributes {
  const r: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hex = (v: unknown, fallback: string): string =>
    typeof v === "string" && HEX_RE.test(v) ? v : fallback;
  const dpi: number | null = positiveNumber(r.printDpi);
  const d = NOTEBOOK_ATTRIBUTE_DEFAULTS;
  return {
    coverColorHex: hex(r.coverColorHex, d.coverColorHex),
    strapColorHex: hex(r.strapColorHex, d.strapColorHex),
    bookmarkColorHex: hex(r.bookmarkColorHex, d.bookmarkColorHex),
    paperKind: coerceNotebookPaperKind(r.paperKind),
    printWidthCm: positiveNumber(r.printWidthCm) ?? d.printWidthCm,
    printHeightCm: positiveNumber(r.printHeightCm) ?? d.printHeightCm,
    printDpi: dpi != null ? Math.round(dpi) : d.printDpi,
    has3dPreview: typeof r.has3dPreview === "boolean" ? r.has3dPreview : d.has3dPreview,
    ...parseNotebookLook(r),
  };
}

/** Attributes JSON to store for a notebook (print dims rounded like the old Decimal(5,2) columns). */
export function notebookAttributesJson(a: NotebookAttributes): Prisma.InputJsonObject {
  return {
    coverColorHex: a.coverColorHex,
    strapColorHex: a.strapColorHex,
    bookmarkColorHex: a.bookmarkColorHex,
    paperKind: a.paperKind,
    printWidthCm: Math.round(a.printWidthCm * 100) / 100,
    printHeightCm: Math.round(a.printHeightCm * 100) / 100,
    printDpi: a.printDpi,
    has3dPreview: a.has3dPreview,
    ...notebookLookJson(a),
  };
}
