import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { prepareRollLayoutRaster } from "./rollLayoutPdf";

/**
 * Builds a 20×10 px RGB PNG: the left half is white, the right half is black.
 * At 1 px/cm this maps to a 20×10 cm face, so a 4 cm wrap → 4 px per side.
 */
async function makeSplitImage(): Promise<Buffer> {
  const width = 20;
  const height = 10;
  const channels = 3;
  const raw = Buffer.alloc(width * height * channels, 0);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * channels;
      const v = x < width / 2 ? 255 : 0; // white left, black right
      raw[idx] = v;
      raw[idx + 1] = v;
      raw[idx + 2] = v;
    }
  }
  return sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
}

describe("prepareRollLayoutRaster — gallery wrap (mirror)", () => {
  it("extends the slot with a mirrored border on every side", async () => {
    const input = await makeSplitImage();
    // Slot = face (20×10) + 2 × 4 cm wrap = 28×18 cm; at 1 px/cm → 28×18 px.
    const out = await prepareRollLayoutRaster(input, "canvas.png", 28, 18, false, 4);
    expect(out.kind).toBe("png");

    const { data, info } = await sharp(out.buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(28);
    expect(info.height).toBe(18);

    const ch = info.channels;
    const at = (x: number, y: number) => {
      const idx = (y * info.width + x) * ch;
      return { r: data[idx], g: data[idx + 1], b: data[idx + 2] };
    };

    const midY = Math.floor(info.height / 2);
    // Far-left added column mirrors the white left edge of the artwork.
    expect(at(0, midY).r).toBeGreaterThan(200);
    // Far-right added column mirrors the black right edge.
    expect(at(info.width - 1, midY).r).toBeLessThan(55);
  });

  it("leaves non-canvas rasters unwrapped (wrap = 0)", async () => {
    const input = await makeSplitImage();
    const out = await prepareRollLayoutRaster(input, "banner.png", 20, 10, false, 0);
    const meta = await sharp(out.buffer).metadata();
    expect(meta.width).toBe(20);
    expect(meta.height).toBe(10);
  });
});
