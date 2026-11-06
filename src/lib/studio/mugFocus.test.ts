import { describe, expect, it } from "vitest";
import { mugFacingRotation, mugHandlePeekAngle, mugThetaWithHandle } from "./mugFocus";

/** x of the handle tip (handle at −Z, reach from the axis `d`) after turning to face θ (camera on +Z). */
const handleX = (theta: number, d: number) => -d * Math.sin(mugFacingRotation(theta, 0));

describe("«Față» keeps the handle in sight", () => {
  it("BUKS (Ø 8.8, classic handle) and a standard Ø 8.2 mug: the handle shows ≥ 0.6 cm past the wall", () => {
    for (const r of [4.4, 4.1]) {
      const reach = 3.85;
      const peek = mugHandlePeekAngle(r, reach);
      const front = mugThetaWithHandle(0, peek);
      expect(handleX(front, r + reach) - r).toBeGreaterThan(0.6);
      // Straight on the handle would hide behind the body.
      expect(Math.abs(handleX(0, r + reach))).toBeLessThan(r);
    }
  });
  it("leaves views where the handle already shows (Stânga / Dreapta) and handle-less mugs alone", () => {
    const peek = mugHandlePeekAngle(4.4, 3.85);
    expect(mugThetaWithHandle(-1.6, peek)).toBe(-1.6);
    expect(mugThetaWithHandle(1.6, peek)).toBe(1.6);
    expect(mugThetaWithHandle(-0.1, peek)).toBeCloseTo(-peek);
    expect(mugThetaWithHandle(0.2, 0)).toBe(0.2);
    expect(mugHandlePeekAngle(4.4, 0)).toBe(0);
  });
});
