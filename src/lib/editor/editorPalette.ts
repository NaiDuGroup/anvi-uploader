/**
 * Shared palette + font catalog used by the Mug and Notebook editors.
 *
 * Both editors used to define their own copies of `FONT_OPTIONS`, `COLOR_OPTIONS`
 * and `BG_COLOR_OPTIONS`. They have always been in sync but the duplication
 * meant that adding a font (or filtering swatches against the product's base
 * colour) had to be done twice. This module is the single source of truth.
 *
 * The colour helpers below expose a cheap, perceptually-weighted RGB distance
 * (good enough for "is this swatch indistinguishable from the product surface?")
 * plus a thin convenience around it. Anything below `PALETTE_MIN_DISTANCE`
 * counts as "too close" and gets hidden from the picker.
 */

export interface FontOption {
  /** Stable identifier (used as React key + analytics tag). */
  readonly id: string;
  /** Human-friendly label shown in the picker. */
  readonly label: string;
  /** CSS family name as accepted by Canvas2D's `ctx.font`. */
  readonly family: string;
  /** CSS custom property holding the next/font value (e.g. `var(--font-mug-roboto)`). */
  readonly cssVar: string;
}

/**
 * Order matters: each row in the picker shows the fonts in this sequence,
 * grouped roughly by mood (clean sans → serif → display → script).
 *
 * When you add a font here you MUST also:
 *   1. register it in `src/app/mug/layout.tsx` and `src/app/notebook/layout.tsx`
 *      via `next/font/google`;
 *   2. add the matching CSS variable to `src/app/admin/_components/MugFontLoader.tsx`
 *      so the admin order wizard can render it too.
 */
export const FONT_OPTIONS: readonly FontOption[] = [
  { id: "roboto", label: "Roboto", family: "Roboto", cssVar: "var(--font-mug-roboto)" },
  { id: "openSans", label: "Open Sans", family: "Open Sans", cssVar: "var(--font-mug-open-sans)" },
  { id: "montserrat", label: "Montserrat", family: "Montserrat", cssVar: "var(--font-mug-montserrat)" },
  { id: "oswald", label: "Oswald", family: "Oswald", cssVar: "var(--font-mug-oswald)" },
  { id: "comfortaa", label: "Comfortaa", family: "Comfortaa", cssVar: "var(--font-mug-comfortaa)" },
  { id: "playfair", label: "Playfair Display", family: "Playfair Display", cssVar: "var(--font-mug-playfair)" },
  { id: "merriweather", label: "Merriweather", family: "Merriweather", cssVar: "var(--font-mug-merriweather)" },
  { id: "lobster", label: "Lobster", family: "Lobster", cssVar: "var(--font-mug-lobster)" },
  { id: "pacifico", label: "Pacifico", family: "Pacifico", cssVar: "var(--font-mug-pacifico)" },
  { id: "caveat", label: "Caveat", family: "Caveat", cssVar: "var(--font-mug-caveat)" },
] as const;

/** Text colour swatches. The first entry is the default for new orders. */
export const TEXT_COLOR_OPTIONS = [
  "#000000",
  "#FFFFFF",
  "#B8860B",
  "#DC2626",
  "#2563EB",
  "#16A34A",
  "#9333EA",
  "#EC4899",
] as const;

/**
 * Background colour swatches. `transparent` is treated as a sentinel and is
 * never filtered out — it is always a safe fallback when every other swatch
 * collides with the product's surface colour.
 */
export const BG_COLOR_OPTIONS = [
  "transparent",
  "#FFFFFF",
  "#000000",
  "#FEF3C7",
  "#DBEAFE",
  "#DCFCE7",
  "#F3E8FF",
  "#FCE7F3",
  "#F3F4F6",
] as const;

export const TRANSPARENT_BACKGROUND = "transparent";

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

/**
 * Parse `#rgb` / `#rrggbb` (with or without the leading `#`).
 * Returns `null` for sentinel values like `"transparent"` or malformed input.
 */
export function hexToRgb(hex: string): Rgb | null {
  if (!hex) return null;
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 3 && cleaned.length !== 6) return null;
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split("")
          .map((c) => c + c)
          .join("")
      : cleaned;
  if (!/^[0-9a-fA-F]{6}$/.test(expanded)) return null;
  const num = Number.parseInt(expanded, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

/**
 * Weighted Euclidean distance in sRGB. Coefficients (2, 4, 3) approximate
 * human luminance perception while staying cheap enough to recompute on every
 * render. Range is `[0, ~441]`; `0` means identical, `~441` means black↔white.
 *
 * Anything that fails to parse (including `"transparent"`) returns `+Infinity`
 * so it's never reported as "close" to a real product colour.
 */
export function colorDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return Number.POSITIVE_INFINITY;
  const dr = ra.r - rb.r;
  const dg = ra.g - rb.g;
  const db = ra.b - rb.b;
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
}

/**
 * Below this perceptual distance two swatches look "the same" to a casual
 * viewer at A5/mug-print sizes. Calibrated against the existing palette:
 *   • white mug (#f5f5f0) hides #FFFFFF and #F3F4F6 (light gray) but keeps
 *     pastel yellow / blue / green;
 *   • black mug hides #000000 only;
 *   • red notebook hides #DC2626 (red text) and any close cousin we add later.
 *
 * If you change this value, re-eyeball the test fixtures in
 * `editorPalette.test.ts` first.
 */
export const PALETTE_MIN_DISTANCE = 70;

/**
 * Returns `true` when `color` would be effectively invisible against `base`.
 * `transparent` and any unparseable input always returns `false` — those are
 * either explicit sentinels or the fallback when no product is selected.
 */
export function isTooCloseToBase(
  color: string,
  base: string | null | undefined,
  minDistance: number = PALETTE_MIN_DISTANCE,
): boolean {
  if (!base) return false;
  if (color === TRANSPARENT_BACKGROUND) return false;
  return colorDistance(color, base) < minDistance;
}

/**
 * Filter a palette against a product surface colour, keeping `transparent`.
 * Returns the original list when `base` is missing (e.g. "Other" SKUs where
 * we don't know the physical colour and shouldn't second-guess the user).
 */
export function filterPaletteByBase(
  options: readonly string[],
  base: string | null | undefined,
  minDistance: number = PALETTE_MIN_DISTANCE,
): readonly string[] {
  if (!base) return options;
  return options.filter((c) => !isTooCloseToBase(c, base, minDistance));
}
