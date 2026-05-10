/**
 * Conversion helpers between centimetres and pixels for the print layout system.
 *
 *   px = round(cm * dpi / 2.54)
 *
 * `MugProduct` / `NotebookProduct` rows store print area in cm at a given DPI.
 * Renderers and uploaders need pixel sizes; everything goes through these
 * helpers so the rounding rule stays in one place.
 */

export const DEFAULT_DPI = 300;
const CM_PER_INCH = 2.54;

/** Allowed DPI presets surfaced in the catalog form. */
export const DPI_PRESETS = [150, 300, 600] as const;
export type Dpi = (typeof DPI_PRESETS)[number];

export function cmToPx(cm: number, dpi: number = DEFAULT_DPI): number {
  return Math.round((cm * dpi) / CM_PER_INCH);
}

export function pxToCm(px: number, dpi: number = DEFAULT_DPI): number {
  return (px * CM_PER_INCH) / dpi;
}

export interface PrintSizeCm {
  /** Width in centimetres (e.g. 21.0 for legacy mug). */
  widthCm: number;
  /** Height in centimetres. */
  heightCm: number;
  /** DPI used to convert to pixels (default: 300). */
  dpi: number;
}

export interface PrintSizePx {
  width: number;
  height: number;
}

/**
 * Compute the pixel canvas size from a product-shaped object. Tolerates Prisma
 * `Decimal` instances (which serialise to string in JSON) and number columns.
 */
export function pxFromProduct(p: {
  printWidthCm: number | string | { toString(): string };
  printHeightCm: number | string | { toString(): string };
  printDpi: number;
}): PrintSizePx {
  const w = toNumber(p.printWidthCm);
  const h = toNumber(p.printHeightCm);
  return { width: cmToPx(w, p.printDpi), height: cmToPx(h, p.printDpi) };
}

/** Same as {@link pxFromProduct} but returns the underlying cm/dpi triplet too. */
export function printSizeFromProduct(p: {
  printWidthCm: number | string | { toString(): string };
  printHeightCm: number | string | { toString(): string };
  printDpi: number;
}): PrintSizeCm & { px: PrintSizePx } {
  const widthCm = toNumber(p.printWidthCm);
  const heightCm = toNumber(p.printHeightCm);
  return {
    widthCm,
    heightCm,
    dpi: p.printDpi,
    px: { width: cmToPx(widthCm, p.printDpi), height: cmToPx(heightCm, p.printDpi) },
  };
}

function toNumber(value: number | string | { toString(): string }): number {
  if (typeof value === "number") return value;
  return Number(value.toString());
}

/** Defaults for the legacy mug body — keep in sync with `mug_products` defaults. */
export const MUG_DEFAULT_PRINT: PrintSizeCm = {
  widthCm: 21.0,
  heightCm: 9.6,
  dpi: DEFAULT_DPI,
};

/** Defaults for A5 hardcover notebook — keep in sync with `notebook_products` defaults. */
export const NOTEBOOK_DEFAULT_PRINT: PrintSizeCm = {
  widthCm: 14.0,
  heightCm: 21.4,
  dpi: DEFAULT_DPI,
};

/** Reasonable limits for catalog inputs — width/height bounded to a tabletop product range. */
export const PRINT_DIMENSION_LIMITS = {
  minCm: 1,
  maxCm: 60,
} as const;

export const DEFAULT_HAS_3D_PREVIEW = true;
