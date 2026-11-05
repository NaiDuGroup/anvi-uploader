import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import sharp from "sharp";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream } from "pdf-lib";
import type { GroupTilePackPlacement } from "./groupTilePack";
import { buildRollLayoutPdfBuffer, detectAssetKind } from "./rollLayoutPdfCore";
import { buildRollLayoutPdfBuffer as buildServerPdf } from "./rollLayoutPdf";

interface PdfImage {
  width: number;
  height: number;
  bpc: number;
  colorSpace: string;
  decode: number[] | null;
  pixels: Buffer;
}

async function pdfImages(bytes: Uint8Array): Promise<PdfImage[]> {
  const doc = await PDFDocument.load(bytes);
  const out: PdfImage[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const dict: PDFDict = obj.dict;
    if (dict.get(PDFName.of("Subtype"))?.toString() !== "/Image") continue;
    const num = (k: string) => (dict.get(PDFName.of(k)) as PDFNumber).asNumber();
    const cs = dict.get(PDFName.of("ColorSpace"));
    const decode = dict.get(PDFName.of("Decode"));
    out.push({
      width: num("Width"),
      height: num("Height"),
      bpc: num("BitsPerComponent"),
      colorSpace: cs instanceof PDFArray ? cs.get(0).toString() : String(cs),
      decode: decode instanceof PDFArray ? decode.asArray().map((n) => (n as PDFNumber).asNumber()) : null,
      pixels: zlib.inflateSync(Buffer.from(obj.contents)),
    });
  }
  return out;
}

function pageContent(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let out = "";
  let idx = 0;
  for (;;) {
    const s = buf.indexOf("stream", idx, "latin1");
    if (s === -1) break;
    let start = s + 6;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const e = buf.indexOf("endstream", start, "latin1");
    try {
      const text = zlib.inflateSync(buf.subarray(start, e)).toString("latin1");
      if (/\bDo\b/.test(text)) out += text;
    } catch {
      out += buf.subarray(start, e).toString("latin1");
    }
    idx = e + 9;
  }
  return out;
}

const placement = (over: Partial<GroupTilePackPlacement> = {}): GroupTilePackPlacement => ({
  tileId: "t::1",
  label: "t",
  xCm: 0.5,
  yCm: 0.5,
  widthCm: 30,
  heightCm: 20,
  rotated: false,
  ...over,
});

async function buildWith(buffer: Uint8Array, fileName = "2.tif", placements = [placement()]) {
  return buildRollLayoutPdfBuffer({
    printableWidthCm: 100,
    totalAlongCm: 100,
    placements,
    getAsset: async (tileId) => ({ tileId, fileName, buffer }),
  });
}

/** 30×20 px: red left half, blue right half. */
function rgbBase() {
  const w = 30;
  const h = 20;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (x < w / 2) raw[i] = 255;
      else raw[i + 2] = 255;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } });
}

/** Hand-written big-endian (MM) uncompressed TIFF, 2×1 px. */
function bigEndianTiff(bps: 8 | 16): Buffer {
  const w = 2;
  const h = 1;
  const px = bps === 8 ? Buffer.from([255, 0, 0, 0, 0, 255]) : Buffer.from([0xff, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0x00]);
  const entries: Array<[number, number, number, number]> = [
    [256, 3, 1, w],
    [257, 3, 1, h],
    [258, 3, 3, 0], // offset patched below
    [259, 3, 1, 1],
    [262, 3, 1, 2],
    [273, 4, 1, 0], // strip offset patched below
    [277, 3, 1, 3],
    [278, 3, 1, h],
    [279, 4, 1, px.length],
  ];
  const ifdOff = 8;
  const ifdLen = 2 + entries.length * 12 + 4;
  const bpsOff = ifdOff + ifdLen;
  const dataOff = bpsOff + 6;
  const b = Buffer.alloc(dataOff + px.length);
  b.write("MM", 0, "latin1");
  b.writeUInt16BE(42, 2);
  b.writeUInt32BE(ifdOff, 4);
  b.writeUInt16BE(entries.length, ifdOff);
  entries.forEach(([tag, type, count, value], i) => {
    const e = ifdOff + 2 + i * 12;
    b.writeUInt16BE(tag, e);
    b.writeUInt16BE(type, e + 2);
    b.writeUInt32BE(count, e + 4);
    if (tag === 258) b.writeUInt32BE(bpsOff, e + 8);
    else if (tag === 273) b.writeUInt32BE(dataOff, e + 8);
    else if (type === 3) b.writeUInt16BE(value, e + 8);
    else b.writeUInt32BE(value, e + 8);
  });
  for (let i = 0; i < 3; i++) b.writeUInt16BE(bps, bpsOff + i * 2);
  px.copy(b, dataOff);
  return b;
}

describe("TIFF detection", () => {
  it("recognises TIFF by magic bytes and by extension", async () => {
    const tif = await rgbBase().tiff().toBuffer();
    expect(detectAssetKind(tif, "noext")).toBe("tiff");
    expect(detectAssetKind(tif, "art.png")).toBe("tiff");
    const png = await rgbBase().png().toBuffer();
    expect(detectAssetKind(png, "mislabelled.tif")).toBe("png");
    expect(detectAssetKind(new Uint8Array([1, 2, 3, 4]), "x.TIFF")).toBe("tiff");
  });
});

describe("buildRollLayoutPdfBuffer with TIFF (browser path)", () => {
  const variants: Array<[string, () => Promise<Buffer>]> = [
    ["uncompressed", () => rgbBase().tiff({ compression: "none" }).toBuffer()],
    ["LZW + horizontal predictor", () => rgbBase().tiff({ compression: "lzw", predictor: "horizontal" }).toBuffer()],
    ["Deflate + predictor", () => rgbBase().tiff({ compression: "deflate", predictor: "horizontal" }).toBuffer()],
    ["PackBits", () => rgbBase().tiff({ compression: "packbits" }).toBuffer()],
    ["tiled LZW", () => rgbBase().tiff({ compression: "lzw", tile: true, tileWidth: 16, tileHeight: 16 }).toBuffer()],
  ];

  for (const [name, make] of variants) {
    it(`RGB ${name} → DeviceRGB, exact pixels`, async () => {
      const [img] = await pdfImages(await buildWith(await make()));
      expect(img).toMatchObject({ width: 30, height: 20, bpc: 8, colorSpace: "/DeviceRGB" });
      expect(img.pixels.length).toBe(30 * 20 * 3);
      expect([...img.pixels.subarray(0, 3)]).toEqual([255, 0, 0]);
      expect([...img.pixels.subarray(29 * 3, 30 * 3)]).toEqual([0, 0, 255]);
      const last = (20 * 30 - 1) * 3;
      expect([...img.pixels.subarray(last, last + 3)]).toEqual([0, 0, 255]);
    });
  }

  it("JPEG-in-TIFF → DeviceRGB (approximate colours)", async () => {
    const tif = await rgbBase().tiff({ compression: "jpeg", quality: 95 }).toBuffer();
    const [img] = await pdfImages(await buildWith(tif));
    expect(img).toMatchObject({ width: 30, height: 20, colorSpace: "/DeviceRGB" });
    expect(img.pixels[0]).toBeGreaterThan(200);
    expect(img.pixels[2]).toBeLessThan(60);
  });

  it("CMYK stays DeviceCMYK, not inverted (red = M+Y ink, no C)", async () => {
    const tif = await rgbBase().toColourspace("cmyk").tiff({ compression: "lzw" }).toBuffer();
    const meta = await sharp(tif).metadata();
    expect(meta.space).toBe("cmyk");
    const [img] = await pdfImages(await buildWith(tif));
    expect(img).toMatchObject({ width: 30, height: 20, bpc: 8, colorSpace: "/DeviceCMYK" });
    expect(img.pixels.length).toBe(30 * 20 * 4);
    const [c, m, y] = img.pixels.subarray(0, 4);
    expect(c).toBeLessThan(40);
    expect(m).toBeGreaterThan(180);
    expect(y).toBeGreaterThan(180);
  });

  it("grayscale → DeviceGray", async () => {
    const tif = await rgbBase().toColourspace("b-w").tiff({ compression: "deflate" }).toBuffer();
    const [img] = await pdfImages(await buildWith(tif));
    expect(img).toMatchObject({ width: 30, height: 20, bpc: 8, colorSpace: "/DeviceGray" });
    expect(img.pixels.length).toBe(30 * 20);
  });

  it("1-bit bilevel → DeviceGray 1 bpc", async () => {
    const tif = await rgbBase().toColourspace("b-w").tiff({ bitdepth: 1, compression: "none" }).toBuffer();
    const [img] = await pdfImages(await buildWith(tif));
    expect(img).toMatchObject({ width: 30, height: 20, bpc: 1, colorSpace: "/DeviceGray" });
  });

  it("16-bit RGB is reduced to 8-bit", async () => {
    const tif = await rgbBase().toColourspace("rgb16").tiff({ compression: "lzw", predictor: "horizontal" }).toBuffer();
    expect((await sharp(tif).metadata()).depth).toBe("ushort");
    const [img] = await pdfImages(await buildWith(tif));
    expect(img).toMatchObject({ width: 30, height: 20, bpc: 8, colorSpace: "/DeviceRGB" });
    expect(img.pixels.length).toBe(30 * 20 * 3);
    expect([...img.pixels.subarray(0, 3)]).toEqual([255, 0, 0]);
  });

  it("big-endian (MM) 8-bit and 16-bit", async () => {
    for (const bps of [8, 16] as const) {
      const [img] = await pdfImages(await buildWith(bigEndianTiff(bps)));
      expect(img).toMatchObject({ width: 2, height: 1, bpc: 8, colorSpace: "/DeviceRGB" });
      expect([...img.pixels]).toEqual([255, 0, 0, 0, 0, 255]);
    }
  });

  it("alpha is composited on white", async () => {
    const w = 4;
    const h = 2;
    const raw = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      raw[i * 4] = 255; // red
      raw[i * 4 + 3] = i < w ? 255 : 0; // top row opaque, bottom row transparent
    }
    const tif = await sharp(raw, { raw: { width: w, height: h, channels: 4 } }).tiff({ compression: "lzw" }).toBuffer();
    const [img] = await pdfImages(await buildWith(tif));
    expect(img).toMatchObject({ width: 4, height: 2, colorSpace: "/DeviceRGB" });
    expect([...img.pixels.subarray(0, 3)]).toEqual([255, 0, 0]);
    expect([...img.pixels.subarray(w * 3, w * 3 + 3)]).toEqual([255, 255, 255]);
  });

  it("copies of one file share one image XObject", async () => {
    const tif = await rgbBase().tiff().toBuffer();
    const bytes = await buildWith(tif, "2.tif", [placement(), placement({ tileId: "t::2", xCm: 40 })]);
    expect(await pdfImages(bytes)).toHaveLength(1);
    expect(pageContent(bytes).match(/\bDo\b/g)).toHaveLength(2);
  });

  it("rotates when pixels match the order orientation, not when they match the slot", async () => {
    // 30×20 px artwork; packer turned a 30×20 cm order into a 20×30 cm slot.
    const tif = await rgbBase().tiff().toBuffer();
    const turned = await buildWith(tif, "2.tif", [placement({ widthCm: 20, heightCm: 30, rotated: true })]);
    expect(pageContent(turned)).toMatch(/ 1 -1 \S+ 0 0 cm/);
    // Pixels already stored turned (20×30 px) → drawn as is.
    const stored = await rgbBase().rotate(90).tiff().toBuffer();
    const plain = await buildWith(stored, "2.tif", [placement({ widthCm: 20, heightCm: 30, rotated: true })]);
    expect(pageContent(plain)).not.toMatch(/ 1 -1 \S+ 0 0 cm/);
  });

  it("insets TIFF artwork inside a white border like PNG", async () => {
    const tif = await rgbBase().tiff().toBuffer();
    const bytes = await buildRollLayoutPdfBuffer({
      printableWidthCm: 100,
      totalAlongCm: 100,
      placements: [placement({ widthCm: 38, heightCm: 28 })],
      borderCmByTileId: new Map([["t::1", 4]]),
      getAsset: async (tileId) => ({ tileId, fileName: "2.tif", buffer: tif }),
    });
    expect(pageContent(bytes)).toContain("1 1 1 rg");
    expect(await pdfImages(bytes)).toHaveLength(1);
  });

  it("unsupported variant fails with a clear message naming the file", async () => {
    const webpTif = await rgbBase().tiff({ compression: "webp" }).toBuffer();
    await expect(buildWith(webpTif, "2.tif")).rejects.toThrow(/^Не удалось прочитать TIF: 2\.tif \(сжатие \d+ не поддерживается\)$/);
    await expect(buildWith(new Uint8Array([0x49, 0x49, 0x2a, 0, 0xff, 0xff, 0xff, 0x7f]), "broken.tif")).rejects.toThrow(
      /Не удалось прочитать TIF: broken\.tif/,
    );
  });
});

describe("server (sharp) path with TIFF", () => {
  it("converts CMYK 16-bit TIFF to PNG and builds the PDF", async () => {
    const tif = await rgbBase().toColourspace("cmyk").tiff({ compression: "lzw" }).toBuffer();
    const bytes = await buildServerPdf({
      printableWidthCm: 100,
      totalAlongCm: 100,
      placements: [placement()],
      getAsset: async (tileId) => ({ tileId, fileName: "2.tif", buffer: tif }),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
  });
});
