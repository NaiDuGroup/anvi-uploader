import type { Prisma } from "@prisma/client";
import { PEN_DEFAULT_PRINT } from "@/lib/printDimensions";

/** Pen-specific print fields stored in `StockItem.attributes`. */
export type PenAttributes = {
  bodyColorHex: string;
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
};

export const PEN_ATTRIBUTE_DEFAULTS: PenAttributes = {
  bodyColorHex: "#1f1f1f",
  clipColorHex: "#c0c0c0",
  printWidthCm: PEN_DEFAULT_PRINT.widthCm,
  printHeightCm: PEN_DEFAULT_PRINT.heightCm,
  printDpi: PEN_DEFAULT_PRINT.dpi,
  has3dPreview: false,
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function positiveNumber(value: unknown): number | null {
  const n: number = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Read pen print fields from item attributes, filling gaps with catalog defaults. */
export function parsePenAttributes(raw: unknown): PenAttributes {
  const r: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hex = (v: unknown, fallback: string): string =>
    typeof v === "string" && HEX_RE.test(v) ? v : fallback;
  const dpi: number | null = positiveNumber(r.printDpi);
  return {
    bodyColorHex: hex(r.bodyColorHex, PEN_ATTRIBUTE_DEFAULTS.bodyColorHex),
    clipColorHex: hex(r.clipColorHex, PEN_ATTRIBUTE_DEFAULTS.clipColorHex),
    printWidthCm: positiveNumber(r.printWidthCm) ?? PEN_ATTRIBUTE_DEFAULTS.printWidthCm,
    printHeightCm: positiveNumber(r.printHeightCm) ?? PEN_ATTRIBUTE_DEFAULTS.printHeightCm,
    printDpi: dpi != null ? Math.round(dpi) : PEN_ATTRIBUTE_DEFAULTS.printDpi,
    has3dPreview: typeof r.has3dPreview === "boolean" ? r.has3dPreview : PEN_ATTRIBUTE_DEFAULTS.has3dPreview,
  };
}

/** Attributes JSON to store for a pen (print dims rounded like the old Decimal(5,2) columns). */
export function penAttributesJson(a: PenAttributes): Prisma.InputJsonObject {
  return {
    bodyColorHex: a.bodyColorHex,
    clipColorHex: a.clipColorHex,
    printWidthCm: Math.round(a.printWidthCm * 100) / 100,
    printHeightCm: Math.round(a.printHeightCm * 100) / 100,
    printDpi: a.printDpi,
    has3dPreview: a.has3dPreview,
  };
}

