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
