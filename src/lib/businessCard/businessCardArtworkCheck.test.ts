import { describe, expect, it } from "vitest";
import { checkBusinessCardArtwork } from "./businessCardArtworkCheck";
import { pxToCm } from "@/lib/printDimensions";

const TRIM_85x55 = { widthCm: 8.5, heightCm: 5.5 } as const;
const TRIM_90x50 = { widthCm: 9, heightCm: 5 } as const;

/** Artwork measured the way the wizard does for raster files: pixels at 300 dpi. */
function px(width: number, height: number) {
  return { widthCm: pxToCm(width), heightCm: pxToCm(height) };
}

describe("checkBusinessCardArtwork", () => {
  it("accepts the studio's real 8.5 × 5.5 artwork (1051 × 697 px at 300 dpi)", () => {
    const res = checkBusinessCardArtwork(px(1051, 697), TRIM_85x55);
    expect(res.ok).toBe(true);
    expect(res.required).toEqual({ widthCm: 8.9, heightCm: 5.9 });
  });

  it("accepts 9 × 5 artwork made at 9.4 × 5.4 cm", () => {
    expect(checkBusinessCardArtwork(px(1110, 638), TRIM_90x50).ok).toBe(true);
  });

  it("rejects a file made at the finished size as missing the bleed", () => {
    const res = checkBusinessCardArtwork(px(1004, 650), TRIM_85x55);
    expect(res).toMatchObject({ ok: false, issue: "no_bleed" });
    expect(checkBusinessCardArtwork(px(1063, 591), TRIM_90x50)).toMatchObject({
      ok: false,
      issue: "no_bleed",
    });
  });

  it("calls a high-resolution finished-size file missing the bleed too", () => {
    // 600 dpi export of 8.5 × 5.5: big in pixels, still no bleed.
    expect(checkBusinessCardArtwork(px(4016, 2598), TRIM_85x55)).toMatchObject({
      ok: false,
      issue: "no_bleed",
    });
  });

  it("accepts a higher-resolution file with the bleed", () => {
    expect(checkBusinessCardArtwork(px(2102, 1394), TRIM_85x55).ok).toBe(true);
  });

  it("flags a correctly proportioned file that is too small", () => {
    expect(checkBusinessCardArtwork(px(525, 348), TRIM_85x55)).toMatchObject({
      ok: false,
      issue: "too_small",
    });
  });

  it("does not care which way the card is turned", () => {
    expect(checkBusinessCardArtwork(px(697, 1051), TRIM_85x55).ok).toBe(true);
    expect(checkBusinessCardArtwork(px(650, 1004), TRIM_85x55)).toMatchObject({
      issue: "no_bleed",
    });
  });

  it("reports artwork for another format as wrong proportions", () => {
    // 9.4 × 5.4 artwork while 8.5 × 5.5 is selected.
    expect(checkBusinessCardArtwork(px(1110, 638), TRIM_85x55)).toMatchObject({
      ok: false,
      issue: "wrong_proportions",
    });
  });

  it("measures PDFs in centimetres directly", () => {
    expect(
      checkBusinessCardArtwork({ widthCm: 8.9, heightCm: 5.9 }, TRIM_85x55).ok,
    ).toBe(true);
    expect(
      checkBusinessCardArtwork({ widthCm: 8.5, heightCm: 5.5 }, TRIM_85x55),
    ).toMatchObject({ issue: "no_bleed" });
  });

  it("tells a finished-size square card from a small one by size alone", () => {
    const square = { widthCm: 6, heightCm: 6 };
    expect(
      checkBusinessCardArtwork({ widthCm: 6.4, heightCm: 6.4 }, square).ok,
    ).toBe(true);
    expect(checkBusinessCardArtwork(square, square)).toMatchObject({
      issue: "no_bleed",
    });
    expect(
      checkBusinessCardArtwork({ widthCm: 3, heightCm: 3 }, square),
    ).toMatchObject({ issue: "too_small" });
  });

  it("rejects an empty measurement instead of passing it", () => {
    expect(
      checkBusinessCardArtwork({ widthCm: 0, heightCm: 0 }, TRIM_85x55).ok,
    ).toBe(false);
  });
});
