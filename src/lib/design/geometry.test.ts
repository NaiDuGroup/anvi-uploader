import { describe, expect, it } from "vitest";
import {
  handleWorldPosition,
  pointInRotatedRect,
  rectAxisStops,
  resizeRotatedRect,
  rotatedRectAabb,
  rotatePoint,
  rotationFromPointer,
  snapAxis,
  type Rect,
} from "./geometry";

const rect: Rect = { x: 100, y: 100, width: 200, height: 100 };

describe("rotatePoint", () => {
  it("returns the same point for zero rotation", () => {
    const p = rotatePoint({ x: 5, y: 7 }, { x: 0, y: 0 }, 0);
    expect(p).toEqual({ x: 5, y: 7 });
  });

  it("rotates 90° clockwise in screen coordinates", () => {
    const p = rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 90);
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(1);
  });
});

describe("pointInRotatedRect", () => {
  it("hits inside an unrotated rect", () => {
    expect(pointInRotatedRect({ x: 150, y: 150 }, rect, 0)).toBe(true);
    expect(pointInRotatedRect({ x: 99, y: 150 }, rect, 0)).toBe(false);
  });

  it("respects rotation", () => {
    // Rect rotated 90°: its long side becomes vertical. A point directly
    // above the centre at distance 90 is inside (half-width 100 after
    // rotation), but was outside before (half-height 50).
    const p = { x: 200, y: 60 };
    expect(pointInRotatedRect(p, rect, 0)).toBe(false);
    expect(pointInRotatedRect(p, rect, 90)).toBe(true);
  });
});

describe("rotatedRectAabb", () => {
  it("equals the rect at zero rotation", () => {
    expect(rotatedRectAabb(rect, 0)).toEqual(rect);
  });

  it("swaps extents at 90°", () => {
    const aabb = rotatedRectAabb(rect, 90);
    expect(aabb.width).toBeCloseTo(100);
    expect(aabb.height).toBeCloseTo(200);
    // Centre is preserved.
    expect(aabb.x + aabb.width / 2).toBeCloseTo(200);
    expect(aabb.y + aabb.height / 2).toBeCloseTo(150);
  });
});

describe("resizeRotatedRect", () => {
  it("dragging se corner grows the rect and keeps nw fixed", () => {
    const out = resizeRotatedRect(rect, 0, "se", { x: 400, y: 300 });
    expect(out).toEqual({ x: 100, y: 100, width: 300, height: 200 });
  });

  it("dragging e edge only changes width, w edge stays fixed", () => {
    const out = resizeRotatedRect(rect, 0, "e", { x: 350, y: 999 });
    expect(out.x).toBeCloseTo(100);
    expect(out.width).toBeCloseTo(250);
    expect(out.y).toBeCloseTo(100);
    expect(out.height).toBeCloseTo(100);
  });

  it("keepRatio preserves aspect on corner drags", () => {
    const out = resizeRotatedRect(rect, 0, "se", { x: 500, y: 220 }, { keepRatio: true });
    expect(out.width / out.height).toBeCloseTo(2);
    expect(out.x).toBeCloseTo(100);
    expect(out.y).toBeCloseTo(100);
  });

  it("enforces the minimum size", () => {
    const out = resizeRotatedRect(rect, 0, "se", { x: 101, y: 101 }, { minSize: 20 });
    expect(out.width).toBeGreaterThanOrEqual(20);
    expect(out.height).toBeGreaterThanOrEqual(20);
  });

  it("keeps the opposite handle fixed for rotated rects", () => {
    const rotation = 30;
    const anchorBefore = handleWorldPosition(rect, rotation, "nw");
    const out = resizeRotatedRect(rect, rotation, "se", { x: 420, y: 330 });
    const anchorAfter = handleWorldPosition(out, rotation, "nw");
    expect(anchorAfter.x).toBeCloseTo(anchorBefore.x, 6);
    expect(anchorAfter.y).toBeCloseTo(anchorBefore.y, 6);
  });
});

describe("rotationFromPointer", () => {
  it("returns 0 when the pointer is straight above the centre", () => {
    expect(rotationFromPointer(rect, { x: 200, y: 0 })).toBe(0);
  });

  it("returns 90 when the pointer is to the right of the centre", () => {
    expect(rotationFromPointer(rect, { x: 500, y: 150 })).toBe(90);
  });

  it("snaps angles close to a 15° multiple", () => {
    // ~46° should snap to 45°.
    const deg = rotationFromPointer(rect, { x: 200 + 100, y: 150 - 96 });
    expect(deg).toBe(45);
  });
});

describe("snapAxis", () => {
  it("returns the smallest correction within the threshold", () => {
    const result = snapAxis([98, 148, 198], [100, 200], 8);
    expect(result).not.toBeNull();
    expect(result!.delta).toBe(2);
    expect(result!.guide).toBe(100);
  });

  it("returns null when nothing is close enough", () => {
    expect(snapAxis([50], [100], 8)).toBeNull();
  });
});

describe("rectAxisStops", () => {
  it("returns edge and centre stops", () => {
    expect(rectAxisStops(rect, "x")).toEqual([100, 200, 300]);
    expect(rectAxisStops(rect, "y")).toEqual([100, 150, 200]);
  });
});
