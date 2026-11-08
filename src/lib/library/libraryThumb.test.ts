import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { renderThumb, THUMB_MAX_PX } = await import("./libraryThumb");

const PT_PER_CM = 72 / 2.54;

/** A 300 × 100 cm banner page, blue — far bigger than any thumbnail. */
async function bannerPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([300 * PT_PER_CM, 100 * PT_PER_CM]);
  page.drawRectangle({ x: 0, y: 0, width: page.getWidth(), height: page.getHeight(), color: rgb(0, 0, 1) });
  doc.addPage([10, 10]);
  return Buffer.from(await doc.save());
}

describe("renderThumb", () => {
  it("renders the first PDF page fitted into the thumbnail box", async () => {
    const webp = await renderThumb(await bannerPdf(), "pdf");
    const { data, info } = await sharp(webp).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    expect((await sharp(webp).metadata()).format).toBe("webp");
    expect(info.width).toBe(THUMB_MAX_PX);
    expect(info.height).toBe(160);
    const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    expect(data[i + 2]).toBeGreaterThan(200);
    expect(data[i]).toBeLessThan(40);
  });

  it("scales rasters (TIF too) down, never up, on a white background", async () => {
    const tif = await sharp({ create: { width: 2000, height: 1000, channels: 3, background: "#00ff00" } }).tiff().toBuffer();
    const big = await sharp(await renderThumb(tif, "raster")).metadata();
    expect([big.width, big.height]).toEqual([THUMB_MAX_PX, 240]);

    const clear = await sharp({ create: { width: 40, height: 20, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .png()
      .toBuffer();
    const flat = await sharp(await renderThumb(clear, "raster")).raw().toBuffer();
    expect(flat[0]).toBeGreaterThan(250); // transparent → white

    const small = await sharp({ create: { width: 100, height: 50, channels: 3, background: "#ff0000" } }).png().toBuffer();
    const meta = await sharp(await renderThumb(small, "raster")).metadata();
    expect([meta.width, meta.height]).toEqual([100, 50]);
  });

  it("throws on a broken PDF", async () => {
    await expect(renderThumb(Buffer.from("%PDF-1.4 broken"), "pdf")).rejects.toThrow();
  });
});
