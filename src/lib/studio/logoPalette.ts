import { brandPaletteFromColors, extractLogoColors, logoLook, type BrandPalette, type LogoLook } from "./palette";

/**
 * The brand colours of an uploaded logo (browser part of `palette.ts`): the
 * decoded picture drawn small (≤ 96 px), its pixels → the logo's colours →
 * the three brand colours.
 */

/** Size of the small copy the colours are read from (aspect kept, long side ≤ `max`, never 0). */
export function logoSampleSize(w: number, h: number, max = 96): { w: number; h: number } {
  if (!(w > 0) || !(h > 0)) return { w: 1, h: 1 };
  const k: number = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** Brand colours of a decoded logo; null when it has no colour (white / transparent) or cannot be read. */
export function logoPaletteFromImage(img: CanvasImageSource, naturalW: number, naturalH: number): BrandPalette | null {
  try {
    const { w, h } = logoSampleSize(naturalW, naturalH);
    const c: HTMLCanvasElement = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data: Uint8ClampedArray = ctx.getImageData(0, 0, w, h).data;
    return brandPaletteFromColors(extractLogoColors(data));
  } catch {
    return null;
  }
}

/** Colours and own background of a decoded logo (the card puts it on a white plate where it would melt into a band); null when it cannot be read. */
export function logoLookFromImage(img: CanvasImageSource, naturalW: number, naturalH: number): LogoLook | null {
  try {
    const { w, h } = logoSampleSize(naturalW, naturalH);
    const c: HTMLCanvasElement = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return logoLook(ctx.getImageData(0, 0, w, h).data, w, h);
  } catch {
    return null;
  }
}
