import type { StudioLayer, StudioSurface } from "./document";

/**
 * Turning the 3D mug towards the edited part of the wrap. The label cylinder
 * maps the print's u (0 = left edge, 1 = right edge) to θ = thetaStart + u ·
 * thetaLength, θ = 0 facing +Z; rotating the mug by φ around Y moves θ to θ + φ.
 * Pure.
 */

/** Angle (rad) on the mug of a layer's centre. */
export function mugLayerTheta(layer: Pick<StudioLayer, "x" | "w">, surface: Pick<StudioSurface, "widthMm">, thetaStart: number, thetaLength: number): number {
  const u: number = Math.max(0, Math.min(1, (layer.x + layer.w / 2) / surface.widthMm));
  return thetaStart + u * thetaLength;
}

/** Mug rotation that shows angle θ to a camera at azimuth `cameraAzimuth` (rad, 0 = +Z). */
export function mugFacingRotation(theta: number, cameraAzimuth = 0): number {
  return cameraAzimuth - theta;
}

/** `to` moved by whole turns so it is the nearest to `from` (no spinning the long way round). */
export function nearestAngle(from: number, to: number): number {
  const twoPi: number = Math.PI * 2;
  let d: number = (to - from) % twoPi;
  if (d > Math.PI) d -= twoPi;
  if (d < -Math.PI) d += twoPi;
  return from + d;
}

/**
 * Smallest turn away from facing the print straight on (rad) at which the
 * handle (on the far side, −Z) shows `peekCm` past the body's silhouette:
 * (r + reach)·sin φ = r + peek. A mug without a handle needs none.
 */
export function mugHandlePeekAngle(radiusCm: number, reachCm: number, peekCm = 0.7): number {
  if (!(reachCm > 0) || !(radiusCm > 0)) return 0;
  return Math.asin(Math.min(0.95, (radiusCm + Math.min(peekCm, reachCm * 0.6)) / (radiusCm + reachCm)));
}

/**
 * The angle to face for a «Față» / opening view: θ itself when the handle
 * already shows beside the body, else turned to ±`peek` so it does (the side
 * θ leans to; straight on → the handle shows on the right).
 */
export function mugThetaWithHandle(theta: number, peek: number): number {
  if (peek <= 0) return theta;
  const twoPi: number = Math.PI * 2;
  let t: number = theta % twoPi;
  if (t > Math.PI) t -= twoPi;
  if (t < -Math.PI) t += twoPi;
  if (Math.abs(t) >= peek) return theta;
  return theta - t + (t < 0 ? -peek : peek);
}
