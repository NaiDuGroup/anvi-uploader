import { contrastRatio } from "./contrast";
import type { StudioColorFieldKey } from "./smartFields";

/**
 * Brand colours from the customer's logo (business cards: the gallery and the
 * short edit recolour every template with them). Pure: the caller hands the
 * logo's pixels (RGBA, a small downscaled copy is enough).
 *
 * - `brandColor1` — the main colour: the most frequent clearly coloured pixel
 *   group of the logo (bands, backgrounds, accents);
 * - `brandColor2` — a second colour of the logo, distinct from the first, or
 *   a lighter / darker shade of it when the logo has one colour;
 * - `brandColor3` — the dark ink for names and details: dark enough to read
 *   on white (contrast ≥ 7), from the logo's own dark colour when it has one.
 *
 * White, near white, transparent pixels are background; greys count only
 * when the logo has nothing more colourful (a black logo keeps a navy band
 * rather than a grey one).
 */

export type BrandPalette = Record<StudioColorFieldKey, string>;

const hex2 = (n: number): string => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
export const rgbHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

export function hexRgb(hex: string): [number, number, number] {
  const h: string = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** HSL of a colour: hue 0–360, saturation and lightness 0–1. */
export function hexHsl(hex: string): { h: number; s: number; l: number } {
  const [r, g, b] = hexRgb(hex).map((v) => v / 255) as [number, number, number];
  const max: number = Math.max(r, g, b);
  const min: number = Math.min(r, g, b);
  const l: number = (max + min) / 2;
  const d: number = max - min;
  if (d === 0) return { h: 0, s: 0, l };
  const s: number = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: (h * 60 + 360) % 360, s, l };
}

export function hslHex(h: number, s: number, l: number): string {
  const c: number = (1 - Math.abs(2 * l - 1)) * s;
  const x: number = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m: number = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgbHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

/** Distance of two colours (0…~442), the usual weighted RGB. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  const rm: number = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db) / 3;
}

interface Bucket {
  n: number;
  r: number;
  g: number;
  b: number;
}

/**
 * The logo's colours, most frequent first (at most `max`): pixels grouped in
 * 4-bit RGB cells, each group's average; white / transparent left out, close
 * groups merged.
 */
export function extractLogoColors(rgba: ArrayLike<number>, max = 5): string[] {
  const cells = new Map<number, Bucket>();
  let total = 0;
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const a: number = rgba[i + 3]!;
    if (a < 128) continue;
    const r: number = rgba[i]!;
    const g: number = rgba[i + 1]!;
    const b: number = rgba[i + 2]!;
    if (r > 236 && g > 236 && b > 236) continue;
    const key: number = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const c: Bucket = cells.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++;
    c.r += r;
    c.g += g;
    c.b += b;
    cells.set(key, c);
    total++;
  }
  if (total === 0) return [];
  const groups: { hex: string; n: number }[] = [...cells.values()]
    .sort((x, y) => y.n - x.n)
    .map((c) => ({ hex: rgbHex(c.r / c.n, c.g / c.n, c.b / c.n), n: c.n }));
  // Anti-aliased edges make many small cells between two colours: merge into the bigger neighbour.
  const merged: { hex: string; n: number }[] = [];
  for (const g of groups) {
    const near = merged.find((m) => colorDistance(m.hex, g.hex) < 40);
    if (near) near.n += g.n;
    else merged.push({ ...g });
  }
  return merged
    .filter((m) => m.n >= total * 0.02)
    .sort((x, y) => y.n - x.n)
    .slice(0, max)
    .map((m) => m.hex);
}

const isGrey = (hex: string): boolean => hexHsl(hex).s < 0.18 || hexHsl(hex).l < 0.1;

/** The colour made dark enough to read on white (contrast ≥ `ratio`). */
export function darkInk(hex: string, ratio = 7): string {
  const { h, s } = hexHsl(hex);
  let l: number = Math.min(hexHsl(hex).l, 0.4);
  let out: string = hslHex(h, Math.min(s, 0.7), l);
  while ((contrastRatio(out, "#ffffff") ?? 21) < ratio && l > 0.04) {
    l -= 0.03;
    out = hslHex(h, Math.min(s, 0.7), l);
  }
  return out;
}

export const DEFAULT_BRAND: BrandPalette = { brandColor1: "#14213d", brandColor2: "#c9a227", brandColor3: "#14213d" };

/**
 * The three brand colours from the logo's colours (most frequent first);
 * null when the logo is white / empty (the templates keep their own).
 */
export function brandPaletteFromColors(colors: readonly string[]): BrandPalette | null {
  if (colors.length === 0) return null;
  const vivid: string[] = colors.filter((c) => !isGrey(c));
  const darks: string[] = colors.filter((c) => (contrastRatio(c, "#ffffff") ?? 0) >= 7);
  if (vivid.length === 0) {
    // A black / grey logo: navy band, gold accent, the logo's own dark ink.
    const ink: string = darks[0] ?? darkInk(colors[0]!);
    return { brandColor1: ink, brandColor2: DEFAULT_BRAND.brandColor2, brandColor3: ink };
  }
  const c1: string = vivid[0]!;
  const other: string | undefined = vivid.slice(1).find((c) => colorDistance(c, c1) > 60);
  const { h, s, l } = hexHsl(c1);
  const c2: string = other ?? (l > 0.5 ? hslHex(h, s, Math.max(0.2, l - 0.28)) : hslHex(h, Math.min(1, s), Math.min(0.72, l + 0.25)));
  const c3: string = darks.find((c) => c !== c1) ?? darkInk(c1);
  return { brandColor1: c1, brandColor2: c2, brandColor3: c3 };
}

/** Ready colour sets of the «Culori» row (main, accent, ink). */
export const CARD_PRESET_PALETTES: readonly BrandPalette[] = [
  { brandColor1: "#14213d", brandColor2: "#c9a227", brandColor3: "#14213d" },
  { brandColor1: "#1f6b3a", brandColor2: "#9bc53d", brandColor3: "#143d24" },
  { brandColor1: "#b3263b", brandColor2: "#f2a541", brandColor3: "#3a1a20" },
  { brandColor1: "#1d5fa8", brandColor2: "#4fb3d9", brandColor3: "#102a4c" },
  { brandColor1: "#6b3fa0", brandColor2: "#e07a9b", brandColor3: "#2b1840" },
  { brandColor1: "#2b2b2b", brandColor2: "#b08d57", brandColor3: "#1d1d1f" },
];

/**
 * A colour that shifts on toner (CMYK): very bright, saturated greens, cyans
 * and blues of the screen (#00ff00, #00ffff, #0000ff, neon) print duller.
 */
export function isNeonRgb(hex: string): boolean {
  const { h, s, l } = hexHsl(hex);
  if (s < 0.85) return false;
  const [r, g, b] = hexRgb(hex);
  const peak: number = Math.max(r, g, b);
  if (peak < 215) return false;
  // Greens, cyans, blues (and violet-blues); bright magenta / orange / red print fine on toner.
  return h >= 80 && h <= 255 && l >= 0.4 && l <= 0.7;
}
