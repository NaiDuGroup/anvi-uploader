import { describe, expect, it } from "vitest";
import {
  ZOOM_MAX,
  ZOOM_MIN,
  clampScale,
  fitScale,
  scalePercent,
  stepScale,
} from "./zoom";

describe("clampScale", () => {
  it("clamps to 10%–200%", () => {
    expect(clampScale(0.01)).toBe(ZOOM_MIN);
    expect(clampScale(4)).toBe(ZOOM_MAX);
    expect(clampScale(0.42)).toBe(0.42);
  });

  it("treats non-finite values as the minimum", () => {
    expect(clampScale(Number.NaN)).toBe(ZOOM_MIN);
    expect(clampScale(Number.POSITIVE_INFINITY)).toBe(ZOOM_MIN);
  });
});

describe("fitScale", () => {
  it("fits a tall A5-like page into a short viewport", () => {
    const scale = fitScale(1748, 2480, 800, 600, 48);
    expect(scale).toBeCloseTo((600 - 48) / 2480);
    expect(1748 * scale).toBeLessThanOrEqual(800);
    expect(2480 * scale).toBeLessThanOrEqual(600);
  });

  it("fits a wide page by width", () => {
    const scale = fitScale(2000, 400, 500, 800, 48);
    expect(scale).toBeCloseTo((500 - 48) / 2000);
  });

  it("returns a safe fallback for invalid sizes", () => {
    expect(fitScale(0, 100, 400, 400)).toBe(0.25);
    expect(fitScale(100, 100, 0, 400)).toBe(0.25);
  });

  it("does not exceed the zoom ceiling", () => {
    expect(fitScale(100, 100, 2000, 2000)).toBe(ZOOM_MAX);
  });
});

describe("stepScale", () => {
  it("zooms in and out by ×1.15", () => {
    expect(stepScale(1, 1)).toBeCloseTo(1.15);
    expect(stepScale(1.15, -1)).toBeCloseTo(1);
  });

  it("stops at the clamp bounds", () => {
    expect(stepScale(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(stepScale(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
  });
});

describe("scalePercent", () => {
  it("rounds to a whole percent", () => {
    expect(scalePercent(0.423)).toBe(42);
    expect(scalePercent(1)).toBe(100);
  });
});
