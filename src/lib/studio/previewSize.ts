/**
 * Long side (px) of the live 3D texture. iPhones cap canvas memory (≈16.7 Mpx
 * per canvas and a total budget), and weak phones pay for every texture
 * upload, so phones / iOS / ≤ 4 cores get 1024 px, others 1536 px. The 300 dpi
 * print file is drawn separately at full size. Pure.
 */
export interface PreviewDevice {
  userAgent?: string;
  maxTouchPoints?: number;
  hardwareConcurrency?: number;
  viewportWidth?: number;
}

export const PREVIEW_SIDE_SMALL = 1024;
export const PREVIEW_SIDE_LARGE = 1536;

export function isIosDevice(d: PreviewDevice): boolean {
  const ua: string = d.userAgent ?? "";
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // iPadOS reports a Mac user agent with touch.
  return /Macintosh/.test(ua) && (d.maxTouchPoints ?? 0) > 1;
}

export function previewMaxSide(d: PreviewDevice): number {
  if (isIosDevice(d)) return PREVIEW_SIDE_SMALL;
  if ((d.hardwareConcurrency ?? 8) <= 4) return PREVIEW_SIDE_SMALL;
  if ((d.viewportWidth ?? 1280) < 768) return PREVIEW_SIDE_SMALL;
  return PREVIEW_SIDE_LARGE;
}

/** The current browser (SSR → small). */
export function browserPreviewMaxSide(): number {
  if (typeof navigator === "undefined" || typeof window === "undefined") return PREVIEW_SIDE_SMALL;
  return previewMaxSide({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    hardwareConcurrency: navigator.hardwareConcurrency,
    viewportWidth: window.innerWidth,
  });
}
