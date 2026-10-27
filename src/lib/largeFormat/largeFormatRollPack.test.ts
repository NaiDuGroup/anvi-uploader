import { describe, expect, it } from "vitest";
import { computeLargeFormatRollLayout } from "./largeFormatRollPack";

describe("computeLargeFormatRollLayout", () => {
  const nominalRollWidthMeters = 1.52;

  it("50×70 printable 122 cm: Q=1 rotated, one row + 1 cm cut (0.51 m)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 1,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.calculatedLinearMeters).toBe(0.51);
    expect(r.layout.totalAlongCm).toBe(51);
    expect(r.layout.placements).toHaveLength(1);
    const p = r.layout.placements[0]!;
    expect(p.rotated).toBe(true);
    expect(p.crossCm).toBe(70);
    expect(p.alongCm).toBe(50);
    // Half the cut gap before the row.
    expect(p.yCm).toBe(0.5);
  });

  it("50×70 printable 122 cm: Q=2 one shelf, 1 cm between copies (0.71 m)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.calculatedLinearMeters).toBe(0.71);
    expect(r.layout.placements).toHaveLength(2);
    expect(r.layout.placements.every((p) => !p.rotated)).toBe(true);
    expect(r.layout.placements.map((p) => p.xCm)).toEqual([0, 51]);
  });

  it("50×70 printable 122 cm: Q=3 optimal strip DP (1.22 m)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 3,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.totalAlongCm).toBe(122);
    expect(r.layout.placements).toHaveLength(3);
  });

  it("gap 0 keeps the old edge-to-edge packing", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 50,
      printHeightCm: 70,
      quantity: 3,
      gapCm: 0,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.totalAlongCm).toBe(120);
  });

  it("two 66 cm pieces no longer share a 132 cm row (banner 66×100 ×4)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 132,
      nominalRollWidthMeters: 1.37,
      printWidthCm: 66,
      printHeightCm: 100,
      quantity: 4,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 66 + 1 + 66 = 133 > 132 → one rotated piece per row: 4 × (66 + 1).
    expect(r.layout.totalAlongCm).toBe(268);
    expect(r.layout.placements.every((p) => p.rotated)).toBe(true);
  });

  it("a piece as wide as the printable width still fits (no edge gap)", () => {
    const r = computeLargeFormatRollLayout({
      printableWidthCm: 122,
      nominalRollWidthMeters,
      printWidthCm: 122,
      printHeightCm: 200,
      quantity: 2,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.layout.totalAlongCm).toBe(2 * 201);
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
