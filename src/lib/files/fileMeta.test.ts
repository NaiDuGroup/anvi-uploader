import sharp from "sharp";
import { deflateSync } from "node:zlib";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { pdfMeta, rasterMeta } from "./fileMeta";
import { formatFileMeta, type FileMetaText } from "./fileMetaFormat";
import { ru } from "@/lib/i18n/ru";

const RU: FileMetaText = ru.fileMeta;

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const byte of buf) {
    c ^= byte;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return ~c;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

function canvasLikePng(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA, like canvas.toBlob
  const raw = Buffer.alloc((width * 4 + 1) * height);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("rasterMeta", () => {
  it("reads pixels and dpi and converts them to a print size", async () => {
    const png = await sharp({ create: { width: 2480, height: 3508, channels: 3, background: "#fff" } })
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();
    expect(await rasterMeta(png)).toEqual({ pixelWidth: 2480, pixelHeight: 3508, dpi: 300, widthMm: 210, heightMm: 297 });
  });

  it("works from the first bytes of a JPEG only", async () => {
    const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#369" } })
      .withMetadata({ density: 150 })
      .jpeg()
      .toBuffer();
    const m = await rasterMeta(jpg.subarray(0, 2048));
    expect(m).toMatchObject({ pixelWidth: 1200, pixelHeight: 800, dpi: 150, widthMm: 203.2 });
  });

  it("a PNG with no density has no dpi (sharp would say 72) — the same as the order form reads it", async () => {
    // A browser canvas export (IHDR, IDAT, IEND — no pHYs): libvips reports 72 dpi for such files.
    const png = canvasLikePng(1713, 2480);
    expect(await rasterMeta(png)).toEqual({ pixelWidth: 1713, pixelHeight: 2480, dpi: null, widthMm: null, heightMm: null });
  });
});

describe("pdfMeta", () => {
  it("gives the first page size in mm and the page count", async () => {
    const doc = await PDFDocument.create();
    doc.addPage([595.28, 841.89]);
    doc.addPage([595.28, 841.89]);
    expect(await pdfMeta(Buffer.from(await doc.save()))).toEqual({ widthMm: 210, heightMm: 297, pageCount: 2 });
  });
});

describe("formatFileMeta", () => {
  const base = { sizeBytes: 4.3 * 1024 * 1024, pageCount: null, metaStatus: "ok" };
  it("shows print size, dpi, pixels and weight", () => {
    expect(
      formatFileMeta({ ...base, pixelWidth: 2480, pixelHeight: 3508, dpi: 300, widthMm: 210, heightMm: 297 }, RU, "ru"),
    ).toBe("21×29,7 см · 300 dpi · 2480×3508 px · 4,3 МБ");
  });
  it("shows the 300 dpi size when the file has no dpi", () => {
    expect(
      formatFileMeta({ ...base, pixelWidth: 2480, pixelHeight: 3508, dpi: null, widthMm: null, heightMm: null }, RU, "ru"),
    ).toBe("dpi не указан · 21×29,7 см при 300 dpi · 2480×3508 px · 4,3 МБ");
  });
  it("says when the file has expired from storage", () => {
    expect(
      formatFileMeta({ ...base, sizeBytes: null, pixelWidth: null, pixelHeight: null, dpi: null, widthMm: null, heightMm: null, metaStatus: "missing" }, RU, "ru"),
    ).toBe("файла уже нет в хранилище");
  });
});
