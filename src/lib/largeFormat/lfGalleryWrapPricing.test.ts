import { describe, expect, it } from "vitest";
import { computeLargeFormatRollLayout } from "./largeFormatRollPack";
import {
  LF_CANVAS_GALLERY_WRAP_CM,
  resolveGalleryWrapCm,
} from "./lfLayoutBorder";

/**
 * Contract: for canvas the entered size is the visible face, and the printed /
 * material size grows by 2 × gallery wrap per axis. Pricing and stock follow
 * the wrapped size, so `calculatedLinearMeters` must reflect face + 2 × wrap.
 *
 * Mirrors the inflation done in `resolveAdminOrderLineProducts`
 * (`src/lib/adminOrderCreateHelpers.ts`) and the wizard preview.
 */
describe("LF canvas gallery wrap — pricing follows the wrapped size", () => {
  const printableWidthCm = 102; // Panza din bumbac 1.07 m roll, ~1.02 m printable
  const nominalRollWidthMeters = 1.07;
  const faceWidthCm = 30;
  const faceHeightCm = 40;
  const quantity = 1;

  const wrapCm = resolveGalleryWrapCm("Panza din bumbac 1.07*20m");

  it("detects the 4 cm canvas wrap", () => {
    expect(wrapCm).toBe(LF_CANVAS_GALLERY_WRAP_CM);
  });

  it("consumes more roll length than the bare face (face + 2 × wrap)", () => {
    const facePack = computeLargeFormatRollLayout({
      printableWidthCm,
      nominalRollWidthMeters,
      printWidthCm: faceWidthCm,
      printHeightCm: faceHeightCm,
      quantity,
    });
    const wrappedPack = computeLargeFormatRollLayout({
      printableWidthCm,
      nominalRollWidthMeters,
      printWidthCm: faceWidthCm + 2 * wrapCm,
      printHeightCm: faceHeightCm + 2 * wrapCm,
      quantity,
    });

    expect(facePack.ok).toBe(true);
    expect(wrappedPack.ok).toBe(true);
    if (!facePack.ok || !wrappedPack.ok) return;

    // The packer rotates a single tile to minimise roll length (along = the
    // shorter side): face 30×40 → 0.30 m; wrapped 38×48 → 0.38 m.
    expect(facePack.layout.calculatedLinearMeters).toBeCloseTo(0.3, 6);
    expect(wrappedPack.layout.calculatedLinearMeters).toBeCloseTo(0.38, 6);
    expect(wrappedPack.layout.calculatedLinearMeters).toBeGreaterThan(
      facePack.layout.calculatedLinearMeters,
    );
  });
});
