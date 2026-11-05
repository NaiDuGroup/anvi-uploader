import { describe, expect, it } from "vitest";
import { snapBox, snapTargets } from "./snap";

const area = { widthMm: 210, heightMm: 96, safeMm: 4 };

describe("studio snapping", () => {
  it("sticks the box centre to the area centre", () => {
    const r = snapBox({ x: 93, y: 10, w: 20, h: 10 }, snapTargets(area, []), 2);
    expect(r.dx).toBeCloseTo(2);
    expect(r.centered).toBe(true);
    expect(r.guides.x[0]).toMatchObject({ at: 105, kind: "center" });
  });
  it("sticks to the safe zone and other layers' edges", () => {
    const t = snapTargets(area, [{ x: 50, y: 50, w: 30, h: 20 }]);
    const r = snapBox({ x: 5, y: 69, w: 10, h: 10 }, t, 1.5);
    expect(r.dx).toBeCloseTo(-1);
    expect(r.guides.x[0]!.kind).toBe("safe");
    expect(r.dy).toBeCloseTo(1);
    expect(r.guides.y.some((g) => g.kind === "layer")).toBe(true);
  });
  it("does nothing outside the threshold", () => {
    const r = snapBox({ x: 30, y: 30, w: 10, h: 10 }, snapTargets(area, []), 1);
    expect(r).toMatchObject({ dx: 0, dy: 0, centered: false });
  });
});
