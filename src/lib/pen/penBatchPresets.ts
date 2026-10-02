/**
 * Pen-batch geometry presets.
 *
 * The default jig is a 5 × 0.6 cm pen with 13.4 / 2.91 cm gaps on a 3-column
 * rack. The workshop also runs an alternate "long" pen series: 7.5 × 0.5 cm
 * with 2.9 cm horizontal / 10.6 cm vertical gaps. The operator picks a
 * preset (or dials in a custom geometry) in the pen-batch tool and this
 * module converts the cm-level values to the pixel geometry the composer
 * actually consumes.
 *
 * Columns stay fixed at 3 (physical jig) and DPI at 300 (printer software
 * expects 300 DPI in the `pHYs` chunk).
 */

import { cmToPx } from "@/lib/printDimensions";
import {
  PEN_STANDARD_GEOMETRY,
  type PenBatchGeometry,
} from "./composePenBatchPng";

/** Preset identifier used in UI chips + localStorage. */
export type PenBatchPresetId = "standard" | "long" | "custom";

/** cm-level representation shown in the UI (and persisted). */
export interface PenBatchGeometryCm {
  widthCm: number;
  heightCm: number;
  gapHCm: number;
  gapVCm: number;
}

/** Default jig: 5 × 0.6 cm with 13.4 / 2.91 cm gaps. */
export const PEN_PRESET_STANDARD: PenBatchGeometryCm = {
  widthCm: 5.0,
  heightCm: 0.6,
  gapHCm: 13.4,
  gapVCm: 2.91,
};

/** Alternate jig: long 7.5 × 0.5 cm with 2.9 / 10.6 cm gaps. */
export const PEN_PRESET_LONG: PenBatchGeometryCm = {
  widthCm: 7.5,
  heightCm: 0.5,
  gapHCm: 2.9,
  gapVCm: 10.6,
};

/**
 * Keyed catalog of named presets. `custom` isn't in here because its values
 * live in UI state (not a global constant).
 */
export const PEN_PRESETS: Record<"standard" | "long", PenBatchGeometryCm> = {
  standard: PEN_PRESET_STANDARD,
  long: PEN_PRESET_LONG,
};

/**
 * Clamp cm values to physically-sane ranges so a bad `custom` input (zero,
 * negative, 10 000 cm) can't blow up the composer or produce a GB-scale PNG.
 *
 *   * tile width:  0.1 … 20 cm
 *   * tile height: 0.1 … 20 cm
 *   * each gap:    0 … 50 cm
 */
export function clampGeometryCm(v: PenBatchGeometryCm): PenBatchGeometryCm {
  return {
    widthCm: clamp(v.widthCm, 0.1, 20),
    heightCm: clamp(v.heightCm, 0.1, 20),
    gapHCm: clamp(v.gapHCm, 0, 50),
    gapVCm: clamp(v.gapVCm, 0, 50),
  };
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Convert a cm-level preset into the pixel geometry the composer consumes.
 * Columns + DPI are inherited from {@link PEN_STANDARD_GEOMETRY}.
 */
export function geometryFromCm(v: PenBatchGeometryCm): PenBatchGeometry {
  const dpi = PEN_STANDARD_GEOMETRY.dpi;
  return {
    dpi,
    cols: PEN_STANDARD_GEOMETRY.cols,
    slotWidthPx: cmToPx(v.widthCm, dpi),
    slotHeightPx: cmToPx(v.heightCm, dpi),
    gapHPx: cmToPx(v.gapHCm, dpi),
    gapVPx: cmToPx(v.gapVCm, dpi),
  };
}

/** True iff two cm-level geometries describe the same physical layout. */
export function geometryCmEquals(
  a: PenBatchGeometryCm,
  b: PenBatchGeometryCm,
): boolean {
  // 0.005 cm = 0.05 mm — below any realistic UV printer tolerance (~0.1 mm).
  const EPS = 0.005;
  return (
    Math.abs(a.widthCm - b.widthCm) < EPS &&
    Math.abs(a.heightCm - b.heightCm) < EPS &&
    Math.abs(a.gapHCm - b.gapHCm) < EPS &&
    Math.abs(a.gapVCm - b.gapVCm) < EPS
  );
}
