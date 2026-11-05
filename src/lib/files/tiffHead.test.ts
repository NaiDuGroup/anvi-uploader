import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { headFirstReader, isTiffHead, readTiffHead, type ByteReader } from "./tiffHead";

function readerOf(bytes: Buffer, log?: Array<[number, number]>): ByteReader {
  return async (o, l) => {
    log?.push([o, l]);
    return new Uint8Array(bytes.subarray(o, o + l));
  };
}

describe("readTiffHead", () => {
  it("reads size and dpi from the IFD with a few small reads", async () => {
    const tif = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#369" } })
      .withMetadata({ density: 150 })
      .tiff({ compression: "lzw" })
      .toBuffer();
    const reads: Array<[number, number]> = [];
    expect(isTiffHead(tif)).toBe(true);
    expect(await readTiffHead(readerOf(tif, reads))).toEqual({ width: 1200, height: 800, dpi: 150 });
    expect(reads.every(([, l]) => l < 4096)).toBe(true);
  });

  it("CMYK, no dpi written → dpi null", async () => {
    const tif = await sharp({ create: { width: 50, height: 70, channels: 3, background: "#f00" } })
      .toColourspace("cmyk")
      .tiff()
      .toBuffer();
    const r = await readTiffHead(readerOf(tif));
    expect(r?.width).toBe(50);
    expect(r?.height).toBe(70);
  });

  it("only the first bytes in memory, the rest by range", async () => {
    const tif = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#fff" } })
      .withMetadata({ density: 300 })
      .tiff({ compression: "none" })
      .toBuffer();
    const head = new Uint8Array(tif.subarray(0, 16));
    const r = await readTiffHead(headFirstReader(head, readerOf(tif)));
    expect(r).toEqual({ width: 300, height: 200, dpi: 300 });
  });

  it("not a TIFF → null", async () => {
    const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#fff" } }).png().toBuffer();
    expect(await readTiffHead(readerOf(png))).toBeNull();
  });
});
