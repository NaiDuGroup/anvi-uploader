import { describe, expect, it } from "vitest";
import { computeLargeFormatRollLayout } from "./largeFormatRollPack";

describe("computeLargeFormatRollLayout", () => {
  const nominalRollWidthMeters = 1.52;

  it("50×70 printable 122 cm: Q=1 uses rotated shorter advance (0.5 m)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.calculatedLinearMeters).toBe(0.5);
    expect(r.layout.totalAlongCm).toBe(50);
    expect(r.layout.placements).toHaveLength(1);
    const p = r.layout.placements[0]!;
    expect(p.rotated).toBe(true);
    expect(p.crossCm).toBe(70);
    expect(p.alongCm).toBe(50);
  });

  it("50×70 printable 122 cm: Q=2 is one shelf two copies across (0.7 m)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.calculatedLinearMeters).toBe(0.7);
    expect(r.layout.placements).toHaveLength(2);
    expect(r.layout.placements.every((p) => !p.rotated)).toBe(true);
  });

  it("50×70 printable 122 cm: Q=3 optimal strip DP (1.2 m)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.calculatedLinearMeters).toBe(1.2);
    expect(r.layout.totalAlongCm).toBe(120);
    expect(r.layout.placements).toHaveLength(3);
  });

  it("returns does_not_fit when neither orientation crosses printable width", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 40,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 1,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("does_not_fit");
  });

  it("returns quantity_too_large above maxQuantity cap", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 1000,
      nominalRollWidthMeters,
      printWidthCm: 10,
      printHeightCm: 10,
      quantity: 600,
      maxQuantity: 500,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe("quantity_too_large");
  });

  it("square uses single orientation without duplicate placements logic errors", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 100,
      nominalRollWidthMeters,
      printWidthCm: 30,
      printHeightCm: 30,
      quantity: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.orientationsUsed).toHaveLength(1);
  });
});
