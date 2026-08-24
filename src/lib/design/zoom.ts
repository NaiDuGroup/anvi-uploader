/** Preview zoom for the Design Studio editor. Export always stays at scale 1. */

export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 1.15;
export const ZOOM_FIT_PADDING_PX = 48;

export function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, scale));
}

export function fitScale(
  docW: number,
  docH: number,
  viewW: number,
  viewH: number,
  padding: number = ZOOM_FIT_PADDING_PX,
): number {
  if (docW <= 0 || docH <= 0 || viewW <= 0 || viewH <= 0) return 0.25;
  const availW = Math.max(1, viewW - padding);
  const availH = Math.max(1, viewH - padding);
  return clampScale(Math.min(availW / docW, availH / docH));
}

export function stepScale(scale: number, direction: 1 | -1): number {
  const factor = direction === 1 ? ZOOM_STEP : 1 / ZOOM_STEP;
  return clampScale(scale * factor);
}

export function scalePercent(scale: number): number {
  return Math.round(clampScale(scale) * 100);
}
