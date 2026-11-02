import { describe, expect, it } from "vitest";
import { checkArtworkSize } from "./artworkSizeCheck";
import type { FileMetaJson } from "./fileMetaFormat";

function raster(pw: number, ph: number, dpi: number | null): FileMetaJson {
  return {
    sizeBytes: 1,
    pixelWidth: pw,
    pixelHeight: ph,
    dpi,
    widthMm: dpi ? (pw / dpi) * 25.4 : null,
    heightMm: dpi ? (ph / dpi) * 25.4 : null,
    pageCount: null,
    metaStatus: "ok",
  };
}

describe("checkArtworkSize", () => {
  it("flags a 30×40 artwork ordered as 10×10", () => {
    const r = checkArtworkSize(raster(3543, 4724, 300), { widthCm: 10, heightCm: 10 });
    expect(r?.issues).toContain("larger");
    expect(r?.fileWidthCm).toBeCloseTo(30, 0);
  });

  it("accepts the right size, also turned 90°", () => {
    expect(checkArtworkSize(raster(3543, 4724, 300), { widthCm: 30, heightCm: 40 })?.issues).toEqual([]);
    expect(checkArtworkSize(raster(3543, 4724, 300), { widthCm: 40, heightCm: 30 })?.issues).toEqual([]);
  });

  it("warns about other proportions and low resolution", () => {
    expect(checkArtworkSize(raster(1181, 1181, 300), { widthCm: 10, heightCm: 20 })?.issues).toEqual(["aspect"]);
    expect(checkArtworkSize(raster(500, 500, 300), { widthCm: 20, heightCm: 20 })?.issues).toEqual(["lowres"]);
  });

  it("without dpi checks only proportions", () => {
    expect(checkArtworkSize(raster(3543, 4724, null), { widthCm: 10, heightCm: 10 })?.issues).toEqual(["aspect", "nodpi"]);
  });

  it("checks a PDF by its page size", () => {
    const pdf: FileMetaJson = { ...raster(1, 1, null), pixelWidth: null, pixelHeight: null, widthMm: 297, heightMm: 420 };
    expect(checkArtworkSize(pdf, { widthCm: 10, heightCm: 10 })?.issues).toEqual(["larger"]);
    expect(checkArtworkSize(pdf, { widthCm: 29.7, heightCm: 42 })?.issues).toEqual([]);
  });
});
