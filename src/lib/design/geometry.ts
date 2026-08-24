/**
 * Pure geometry helpers for the Design Studio editor: rotated-rectangle
 * hit-testing, resize-with-anchor math, and axis snapping. No DOM access —
 * everything is unit-testable.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

export type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export const RESIZE_HANDLES: readonly ResizeHandle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

const DEG_TO_RAD = Math.PI / 180;

export function rectCenter(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** Rotate `p` around `origin` by `deg` degrees (screen coords, y-down). */
export function rotatePoint(p: Point, origin: Point, deg: number): Point {
  if (deg === 0) return { x: p.x, y: p.y };
  const rad = deg * DEG_TO_RAD;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/** World point → coordinates local to the rect (origin at rect centre, unrotated). */
export function worldToLocal(p: Point, rect: Rect, rotationDeg: number): Point {
  const c = rectCenter(rect);
  const unrotated = rotatePoint(p, c, -rotationDeg);
  return { x: unrotated.x - c.x, y: unrotated.y - c.y };
}

/** Is a world-space point inside the rotated rectangle? */
export function pointInRotatedRect(
  p: Point,
  rect: Rect,
  rotationDeg: number,
): boolean {
  const local = worldToLocal(p, rect, rotationDeg);
  return (
    Math.abs(local.x) <= rect.width / 2 && Math.abs(local.y) <= rect.height / 2
  );
}

/** The four world-space corners of a rotated rect (nw, ne, se, sw order). */
export function rotatedRectCorners(rect: Rect, rotationDeg: number): Point[] {
  const c = rectCenter(rect);
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  const locals: Point[] = [
    { x: c.x - hw, y: c.y - hh },
    { x: c.x + hw, y: c.y - hh },
    { x: c.x + hw, y: c.y + hh },
    { x: c.x - hw, y: c.y + hh },
  ];
  return locals.map((p) => rotatePoint(p, c, rotationDeg));
}

/** Axis-aligned bounding box of a rotated rect. */
export function rotatedRectAabb(rect: Rect, rotationDeg: number): Rect {
  if (rotationDeg === 0) return { ...rect };
  const corners = rotatedRectCorners(rect, rotationDeg);
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX,
    y: minY,
    width: Math.max(...xs) - minX,
    height: Math.max(...ys) - minY,
  };
}

/** Local (centre-relative, unrotated) offset of a resize handle. */
function handleLocalOffset(handle: ResizeHandle, rect: Rect): Point {
  const hw = rect.width / 2;
  const hh = rect.height / 2;
  switch (handle) {
    case "nw":
      return { x: -hw, y: -hh };
    case "n":
      return { x: 0, y: -hh };
    case "ne":
      return { x: hw, y: -hh };
    case "e":
      return { x: hw, y: 0 };
    case "se":
      return { x: hw, y: hh };
    case "s":
      return { x: 0, y: hh };
    case "sw":
      return { x: -hw, y: hh };
    case "w":
      return { x: -hw, y: 0 };
  }
}

const OPPOSITE_HANDLE: Record<ResizeHandle, ResizeHandle> = {
  nw: "se",
  n: "s",
  ne: "sw",
  e: "w",
  se: "nw",
  s: "n",
  sw: "ne",
  w: "e",
};

/** World-space position of a resize handle on a rotated rect. */
export function handleWorldPosition(
  rect: Rect,
  rotationDeg: number,
  handle: ResizeHandle,
): Point {
  const c = rectCenter(rect);
  const local = handleLocalOffset(handle, rect);
  return rotatePoint({ x: c.x + local.x, y: c.y + local.y }, c, rotationDeg);
}

export interface ResizeOptions {
  /** Preserve width/height ratio (corner handles only). */
  keepRatio?: boolean;
  minSize?: number;
}

/**
 * Resize a (possibly rotated) rect by dragging `handle` to `pointerWorld`.
 * The opposite handle stays fixed in world space, which is what users expect
 * from every design tool. Returns the new unrotated rect (same rotation).
 */
export function resizeRotatedRect(
  rect: Rect,
  rotationDeg: number,
  handle: ResizeHandle,
  pointerWorld: Point,
  options: ResizeOptions = {},
): Rect {
  const minSize = options.minSize ?? 8;
  const anchorWorld = handleWorldPosition(rect, rotationDeg, OPPOSITE_HANDLE[handle]);

  // Pointer in the rect's local (unrotated) frame relative to the anchor.
  const c = rectCenter(rect);
  const localPointer = rotatePoint(pointerWorld, c, -rotationDeg);
  const localAnchor = rotatePoint(anchorWorld, c, -rotationDeg);

  const isCorner = handle.length === 2;
  const affectsX = handle.includes("e") || handle.includes("w");
  const affectsY = handle.includes("n") || handle.includes("s");

  let width = rect.width;
  let height = rect.height;

  if (affectsX) width = Math.max(minSize, Math.abs(localPointer.x - localAnchor.x));
  if (affectsY) height = Math.max(minSize, Math.abs(localPointer.y - localAnchor.y));

  if (isCorner && options.keepRatio && rect.width > 0 && rect.height > 0) {
    const ratio = rect.width / rect.height;
    if (width / rect.width >= height / rect.height) {
      height = Math.max(minSize, width / ratio);
    } else {
      width = Math.max(minSize, height * ratio);
    }
  }

  // New centre in the local frame: offset from the anchor towards the pointer
  // side by half the new size on affected axes; unchanged on locked axes.
  const dirX = handle.includes("w") ? -1 : handle.includes("e") ? 1 : 0;
  const dirY = handle.includes("n") ? -1 : handle.includes("s") ? 1 : 0;

  const localCenter = {
    x: affectsX ? localAnchor.x + dirX * (width / 2) : localAnchor.x + (c.x - localAnchor.x),
    y: affectsY ? localAnchor.y + dirY * (height / 2) : localAnchor.y + (c.y - localAnchor.y),
  };

  // Edge handles keep the other axis' centre coordinate.
  if (!affectsX) localCenter.x = c.x;
  if (!affectsY) localCenter.y = c.y;

  const newCenter = rotatePoint(localCenter, c, rotationDeg);

  return {
    x: newCenter.x - width / 2,
    y: newCenter.y - height / 2,
    width,
    height,
  };
}

/**
 * Rotation from dragging the rotate handle: angle between the rect centre and
 * the pointer, with 0° pointing up. Snaps to multiples of 15° when within
 * `snapToleranceDeg`.
 */
export function rotationFromPointer(
  rect: Rect,
  pointerWorld: Point,
  snapToleranceDeg: number = 4,
): number {
  const c = rectCenter(rect);
  const rad = Math.atan2(pointerWorld.y - c.y, pointerWorld.x - c.x);
  let deg = rad / DEG_TO_RAD + 90;
  deg = ((deg % 360) + 360) % 360;
  if (deg > 180) deg -= 360;

  const nearest = Math.round(deg / 15) * 15;
  if (Math.abs(deg - nearest) <= snapToleranceDeg) {
    deg = nearest === -180 ? 180 : nearest;
  }
  return deg;
}

// ---------------------------------------------------------------------------
// Snapping
// ---------------------------------------------------------------------------

export interface SnapResult {
  /** Adjustment to add to the proposed position. */
  delta: number;
  /** The guide line coordinate that was snapped to. */
  guide: number;
}

/**
 * Snap one axis: `candidates` are the moving box's notable coordinates
 * (edges + centre) at the proposed position; `targets` are static guide
 * coordinates (canvas edges/centre, other elements' edges/centres). Returns
 * the smallest correction within `threshold`, or `null`.
 */
export function snapAxis(
  candidates: readonly number[],
  targets: readonly number[],
  threshold: number,
): SnapResult | null {
  let best: SnapResult | null = null;
  for (const candidate of candidates) {
    for (const target of targets) {
      const delta = target - candidate;
      if (Math.abs(delta) <= threshold && (best === null || Math.abs(delta) < Math.abs(best.delta))) {
        best = { delta, guide: target };
      }
    }
  }
  return best;
}

/** Edge + centre coordinates of a rect along one axis. */
export function rectAxisStops(rect: Rect, axis: "x" | "y"): number[] {
  if (axis === "x") return [rect.x, rect.x + rect.width / 2, rect.x + rect.width];
  return [rect.y, rect.y + rect.height / 2, rect.y + rect.height];
}
