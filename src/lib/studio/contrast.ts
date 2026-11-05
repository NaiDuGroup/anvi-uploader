/**
 * WCAG 2.x contrast for the Studio: relative luminance of an sRGB colour, the
 * contrast ratio of two colours, and the readable ink (white or navy) on a
 * background. One helper for every place that recolours text automatically
 * (the «Designul tău pe alte produse» adapter). Pure.
 */

/** Navy of the studio palette: the dark ink. */
export const INK_DARK = "#14213d";
/** The light ink. */
export const INK_LIGHT = "#ffffff";

/**
 * Below this ratio text is hard to read. 3:1 is the WCAG AA level for large
 * text; product texts are large (≥ 14 pt bold on a mug / cover), so the
 * adapter uses it (decision: AA-large, not 4.5:1, so a designer's gold on navy
 * is left alone).
 */
export const MIN_TEXT_CONTRAST = 3;

function channel(v: number): number {
  const c: number = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance (0 black … 1 white) of `#rgb` / `#rrggbb`; null when unparseable. */
export function relativeLuminance(hex: string): number | null {
  let h: string = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n: number = parseInt(h, 16);
  return 0.2126 * channel((n >> 16) & 0xff) + 0.7152 * channel((n >> 8) & 0xff) + 0.0722 * channel(n & 0xff);
}

/** WCAG contrast ratio (1 … 21); null when either colour is unparseable. */
export function contrastRatio(a: string, b: string): number | null {
  const la: number | null = relativeLuminance(a);
  const lb: number | null = relativeLuminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** White or navy text on this background, whichever has the higher WCAG contrast. */
export function readableInk(background: string): string {
  const light: number = contrastRatio(INK_LIGHT, background) ?? 0;
  const dark: number = contrastRatio(INK_DARK, background) ?? 0;
  return light > dark ? INK_LIGHT : INK_DARK;
}

/** True when `color` on `background` is below `min` (unparseable colours count as readable). */
export function isHardToRead(color: string, background: string, min: number = MIN_TEXT_CONTRAST): boolean {
  const r: number | null = contrastRatio(color, background);
  return r != null && r < min;
}

/** Same colour family (editorPalette distance) under which two colours read as one. */
const SAME_COLOUR_DISTANCE = 20;
/** Below this WCAG ratio text is gone (red) unless the hues clearly differ. */
export const TEXT_RED_RATIO = 1.5;
/** Below this ratio text is hard to read (yellow). */
export const TEXT_YELLOW_RATIO = 2;
/** Distance (editorPalette scale) from which two colours of equal lightness still read apart. */
const HUE_APART_DISTANCE = 150;
/** Distance under which two colours look alike to a casual viewer (editorPalette's own threshold). */
const LOOK_ALIKE_DISTANCE = 70;

/** editorPalette-compatible weighted RGB distance (no import: keeps this module standalone). */
function rgbDistance(a: string, b: string): number {
  const pa = parseHex(a);
  const pb = parseHex(b);
  if (!pa || !pb) return Number.POSITIVE_INFINITY;
  const [dr, dg, db] = [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]];
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

function parseHex(hex: string): [number, number, number] | null {
  let h: string = hex.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(h)) h = h.replace(/./g, (c) => c + c);
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  const n: number = parseInt(h, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

/**
 * One rule for text on whatever lies under it (product, «Fundal», a shape):
 * red when it practically disappears (same lightness and same colour family),
 * yellow when it is hard to read; null when readable.
 */
export function textContrastLevel(color: string, under: string): "red" | "yellow" | null {
  const ratio: number | null = contrastRatio(color, under);
  const d: number = rgbDistance(color, under);
  if (ratio == null || !Number.isFinite(d)) return null;
  if (d < SAME_COLOUR_DISTANCE || (ratio < TEXT_RED_RATIO && d < HUE_APART_DISTANCE)) return "red";
  if (ratio < TEXT_YELLOW_RATIO || d < LOOK_ALIKE_DISTANCE) return "yellow";
  return null;
}

/** QR modules on their background: below this ratio phones fail (red) / may fail (yellow). */
export const QR_RED_RATIO = 2;
export const QR_YELLOW_RATIO = 4.5;

/**
 * Scannability of QR modules on a background: red under 2:1, yellow under
 * 4.5:1 or when the modules are lighter than the background (an inverted code,
 * which many phone cameras do not read).
 */
export function qrContrastLevel(moduleColor: string, background: string): "red" | "yellow" | null {
  const ratio: number | null = contrastRatio(moduleColor, background);
  if (ratio == null) return null;
  if (ratio < QR_RED_RATIO) return "red";
  const lm: number = relativeLuminance(moduleColor) ?? 0;
  const lb: number = relativeLuminance(background) ?? 1;
  if (ratio < QR_YELLOW_RATIO || lm > lb) return "yellow";
  return null;
}
