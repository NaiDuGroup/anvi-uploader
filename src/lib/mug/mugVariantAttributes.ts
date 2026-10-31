import type { Prisma } from "@prisma/client";
import { MUG_DEFAULT_PRINT } from "@/lib/printDimensions";
import { MUG_SURFACE_DEFAULTS, parseMugSurface, type MugSurface } from "./mugSurface";
import { MUG_SHAPE_DEFAULTS, parseMugShape, type MugShape } from "./mugShape";

/** Mug-specific fields stored in `StockItem.attributes`. */
export type MugAttributes = {
  bodyColorHex: string;
  handleColorHex: string;
  /** Null: the inside follows the body colour. */
  innerColorHex: string | null;
  /** Rim lip (GLB mesh Mug_Fringe); null uses the body colour in 3D. */
  rimColorHex: string | null;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  /** When false, the editor / approval pages skip the 3D preview. */
  has3dPreview: boolean;
} & MugSurface &
  MugShape;

/** Same defaults as the legacy `mug_products` columns. */
export const MUG_ATTRIBUTE_DEFAULTS: MugAttributes = {
  bodyColorHex: "#f5f5f0",
  handleColorHex: "#a8a29e",
  innerColorHex: null,
  rimColorHex: null,
  printWidthCm: MUG_DEFAULT_PRINT.widthCm,
  printHeightCm: MUG_DEFAULT_PRINT.heightCm,
  printDpi: MUG_DEFAULT_PRINT.dpi,
  has3dPreview: true,
  ...MUG_SURFACE_DEFAULTS,
  ...MUG_SHAPE_DEFAULTS,
};

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

function positiveNumber(value: unknown): number | null {
  const n: number = typeof value === "string" ? Number(value) : (value as number);
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

/** Read mug fields from item attributes, filling gaps with catalog defaults. */
export function parseMugAttributes(raw: unknown): MugAttributes {
  const r: Record<string, unknown> =
    raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const hex = (v: unknown, fallback: string): string =>
    typeof v === "string" && HEX_RE.test(v) ? v : fallback;
  const optionalHex = (v: unknown): string | null => (typeof v === "string" && HEX_RE.test(v) ? v : null);
  const dpi: number | null = positiveNumber(r.printDpi);
  const d = MUG_ATTRIBUTE_DEFAULTS;
  return {
    bodyColorHex: hex(r.bodyColorHex, d.bodyColorHex),
    handleColorHex: hex(r.handleColorHex, d.handleColorHex),
    innerColorHex: optionalHex(r.innerColorHex),
    rimColorHex: optionalHex(r.rimColorHex),
    printWidthCm: positiveNumber(r.printWidthCm) ?? d.printWidthCm,
    printHeightCm: positiveNumber(r.printHeightCm) ?? d.printHeightCm,
    printDpi: dpi != null ? Math.round(dpi) : d.printDpi,
    has3dPreview: typeof r.has3dPreview === "boolean" ? r.has3dPreview : d.has3dPreview,
    ...parseMugSurface(r),
    ...parseMugShape(r),
  };
}

/** Attributes JSON to store for a mug (print dims rounded like the old Decimal(5,2) columns). */
export function mugAttributesJson(a: MugAttributes): Prisma.InputJsonObject {
  return {
    bodyColorHex: a.bodyColorHex,
    handleColorHex: a.handleColorHex,
    innerColorHex: a.innerColorHex,
    rimColorHex: a.rimColorHex,
    printWidthCm: Math.round(a.printWidthCm * 100) / 100,
    printHeightCm: Math.round(a.printHeightCm * 100) / 100,
    printDpi: a.printDpi,
    has3dPreview: a.has3dPreview,
    finish: a.finish,
    gradientColorHex: a.gradientColorHex,
    gradientHeightPct: a.gradientHeightPct,
    bodyHeightCm: a.bodyHeightCm,
    topDiameterCm: a.topDiameterCm,
    bottomDiameterCm: a.bottomDiameterCm,
    handleStyle: a.handleStyle,
  };
}
