import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";

/** Inflate every FlateDecode stream and concatenate the decoded text. */
function decodePdfStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let out = "";
  let idx = 0;
  for (;;) {
    const sIdx = buf.indexOf("stream", idx, "latin1");
    if (sIdx === -1) break;
    let dataStart = sIdx + "stream".length;
    if (buf[dataStart] === 0x0d) dataStart++;
    if (buf[dataStart] === 0x0a) dataStart++;
    const eIdx = buf.indexOf("endstream", dataStart, "latin1");
    if (eIdx === -1) break;
    const chunk = buf.subarray(dataStart, eIdx);
    try {
      out += zlib.inflateSync(chunk).toString("latin1");
    } catch {
      out += chunk.toString("latin1");
    }
    idx = eIdx + "endstream".length;
  }
  return out;
}
import {
  buildRollLayoutPdfBuffer,
  cmToPt,
  shouldRotateContentForPlacement,
} from "./rollLayoutPdfCore";
import {
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

describe("shouldRotateContentForPlacement", () => {
  const rotatedPlacement = {
    tileId: "a::1",
    label: "a",
    xCm: 0.5,
    yCm: 0.5,
    widthCm: 115,
    heightCm: 235,
    rotated: true,
  };

  it("does not rotate when pixels already match the placement slot (prod banner)", () => {
    expect(
      shouldRotateContentForPlacement(13583, 27756, rotatedPlacement),
    ).toBe(false);
  });

  it("rotates when pixels match the original order orientation", () => {
    expect(
      shouldRotateContentForPlacement(27756, 13583, rotatedPlacement),
    ).toBe(true);
  });

  it("never rotates when placement is natural", () => {
    expect(
      shouldRotateContentForPlacement(
        27756,
        13583,
        { ...rotatedPlacement, widthCm: 235, heightCm: 115, rotated: false },
      ),
    ).toBe(false);
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

  it("builds PDF with rotated raster without re-encoding image", async () => {
    const bytes = await buildRollLayoutPdfBuffer({
      printableWidthCm: 132,
      totalAlongCm: 250,
      placements: [
        {
          tileId: "line-1::1",
          label: "#1",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 115,
          heightCm: 235,
          rotated: true,
        },
      ],
      getAsset: async (tileId) => ({
        tileId,
        fileName: "banner.jpg",
        buffer: TINY_PNG,
      }),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });

  it("draws a white border and insets artwork for BANNER MATT tiles", async () => {
    const borderCm = 4;
    // Footprint includes the 4 cm border on each side (40×30 artwork → 48×38).
    const bytes = await buildRollLayoutPdfBuffer({
      printableWidthCm: 132,
      totalAlongCm: 50,
      placements: [
        {
          tileId: "line-1::1",
          label: "#1 (1/1)",
          xCm: 0.5,
          yCm: 0.5,
          widthCm: 48,
          heightCm: 38,
          rotated: false,
        },
      ],
      borderCmByTileId: new Map([["line-1::1", borderCm]]),
      getAsset: async (tileId) => ({
        tileId,
        fileName: "banner.png",
        buffer: TINY_PNG,
      }),
    });

    expect(Buffer.from(bytes.subarray(0, 5)).toString("utf8")).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    // A white fill (rg 1 1 1) is emitted for the border background.
    const content = decodePdfStreams(bytes);
    expect(content).toContain("1 1 1 rg");
  });

  it("emits no white border fill when no tile has a border", async () => {
    const bytes = await buildRollLayoutPdfBuffer({
      printableWidthCm: 122,
      totalAlongCm: 50,
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
    const content = decodePdfStreams(bytes);
    expect(content).not.toContain("1 1 1 rg");
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
