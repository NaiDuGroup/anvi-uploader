import { describe, it, expect } from "vitest";
import { lfPieceFitsAcrossPrintableWidthCm } from "./lfPieceFitsPrintableWidthCm";

describe("lfPieceFitsAcrossPrintableWidthCm", () => {
  it("allows either side as cross dimension (rotation)", () => {
    expect(lfPieceFitsAcrossPrintableWidthCm(50, 132, 132)).toBe(true);
    expect(lfPieceFitsAcrossPrintableWidthCm(132, 50, 132)).toBe(true);
  });

  it("rejects when both sides exceed printable width", () => {
    expect(lfPieceFitsAcrossPrintableWidthCm(133, 134, 132)).toBe(false);
  });

  it("allows exact edge at printable width", () => {
    expect(lfPieceFitsAcrossPrintableWidthCm(132, 200, 132)).toBe(true);
  });
});
