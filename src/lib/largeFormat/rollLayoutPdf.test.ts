import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  buildRollLayoutPdfBuffer,
  cmToPt,
  prepareRollLayoutRaster,
  ROLL_LAYOUT_MAX_EMBED_DPI,
} from "./rollLayoutPdf";
import { cmToPx } from "@/lib/printDimensions";

/** 1×1 red PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("cmToPt", () => {
  it("converts centimetres to PDF points", () => {
    expect(cmToPt(2.54)).toBeCloseTo(72, 4);
    expect(cmToPt(122)).toBeCloseTo((122 / 2.54) * 72, 2);
  });
});

describe("prepareRollLayoutRaster", () => {
  it("returns a PNG buffer for tiny input", async () => {
    const out = await prepareRollLayoutRaster(
      TINY_PNG,
      "test.png",
      10,
      10,
      false,
    );
    expect(out.kind).toBe("png");
    expect(out.buffer.byteLength).toBeGreaterThan(0);
  });

  it("passes through PNG unchanged when already within 300 DPI cap", async () => {
    const out = await prepareRollLayoutRaster(
      TINY_PNG,
      "banner.png",
      10,
      10,
      false,
    );
    expect(out.kind).toBe("png");
    expect(out.buffer).toBe(TINY_PNG);
  });

  it("95×265 cm @ 300 DPI fits cap without resize (prod banner case)", () => {
    expect(cmToPx(95, ROLL_LAYOUT_MAX_EMBED_DPI)).toBe(11220);
    expect(cmToPx(265, ROLL_LAYOUT_MAX_EMBED_DPI)).toBe(31299);
    expect(11220 * 31299).toBeGreaterThan(268_402_689);
  });
});

describe("buildRollLayoutPdfBuffer", () => {
  it("produces a valid PDF with correct page dimensions", async () => {
    const printableWidthCm = 122;
    const totalAlongCm = 50;
    const bytes = await buildRollLayoutPdfBuffer({
      printableWidthCm,
      totalAlongCm,
      placements: [
        {
          tileId: "line-1::1",
          label: "#1 (1/1)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 40,
          heightCm: 30,
          rotated: false,
        },
      ],
      getAsset: async (tileId) => ({
        tileId,
        fileName: "banner.png",
        buffer: TINY_PNG,
      }),
    });

    expect(Buffer.from(bytes.subarray(0, 5)).toString("utf8")).toBe("%PDF-");

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(cmToPt(printableWidthCm), 1);
    expect(height).toBeCloseTo(cmToPt(totalAlongCm), 1);
  });

  it("places multiple tiles on one page", async () => {
    const bytes = await buildRollLayoutPdfBuffer({
      printableWidthCm: 100,
      totalAlongCm: 80,
      placements: [
        {
          tileId: "a::1",
          label: "a",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 20,
          heightCm: 30,
          rotated: false,
        },
        {
          tileId: "b::1",
          label: "b",
          xCm: 25,
          yCm: 0.5,
          widthCm: 20,
          heightCm: 30,
          rotated: false,
        },
      ],
      getAsset: async (tileId) => ({
        tileId,
        fileName: tileId.startsWith("a") ? "a.png" : "b.jpg",
        buffer: TINY_PNG,
      }),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
