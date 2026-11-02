import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { parseJpegHead, parsePngHead } from "./localFileMeta";

describe("header parsers (browser, before upload)", () => {
  it("reads PNG size and dpi", async () => {
    const png = await sharp({ create: { width: 2480, height: 3508, channels: 4, background: "#0000" } })
      .withMetadata({ density: 300 })
      .png()
      .toBuffer();
    const r = parsePngHead(new Uint8Array(png));
    expect(r?.width).toBe(2480);
    expect(r?.height).toBe(3508);
    expect(r?.dpi).toBeCloseTo(300, 0);
  });

  it("reads JPEG size and dpi", async () => {
    const jpg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#369" } })
      .withMetadata({ density: 150 })
      .jpeg()
      .toBuffer();
    expect(parseJpegHead(new Uint8Array(jpg))).toEqual({ width: 1200, height: 800, dpi: 150 });
  });

  it("reads JPEG without dpi from a photo-like file", async () => {
    const jpg = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const r = parseJpegHead(new Uint8Array(jpg));
    expect(r?.width).toBe(640);
    expect(r?.height).toBe(480);
  });
});
