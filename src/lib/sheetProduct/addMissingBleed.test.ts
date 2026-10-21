import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { addMissingBleed } from "./addMissingBleed";

/** 15 × 7 cm at 100 px/cm: red left half, blue right half. */
async function trimSizedArtwork(widthPx: number, heightPx: number): Promise<Buffer> {
  const half = Math.floor(widthPx / 2);
  return sharp({
    create: {
      width: widthPx,
      height: heightPx,
      channels: 3,
      background: { r: 0, g: 0, b: 255 },
    },
  })
    .composite([
      {
        input: {
          create: {
            width: half,
            height: heightPx,
            channels: 3,
            background: { r: 255, g: 0, b: 0 },
          },
        },
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

describe("addMissingBleed", () => {
  it("extends 15 × 7 artwork to 15.4 × 7.4 by stretching the edges", async () => {
    const input = await trimSizedArtwork(1500, 700);
    const { buffer, generated } = await addMissingBleed(
      input,
      { widthCm: 15, heightCm: 7 },
      0.2,
    );

    expect(generated).toBe(true);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(1540);
    expect(meta.height).toBe(740);

    const { data, info } = await sharp(buffer)
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixel = (x: number, y: number): number[] => {
      const i = (y * info.width + x) * info.channels;
      return [data[i]!, data[i + 1]!, data[i + 2]!];
    };
    // The new bands continue the colour next to them, not white.
    expect(pixel(0, 0)).toEqual([255, 0, 0]);
    expect(pixel(info.width - 1, info.height - 1)).toEqual([0, 0, 255]);
  });

  it("recognises portrait artwork for a landscape trim size", async () => {
    const input = await trimSizedArtwork(700, 1500);
    const { buffer, generated } = await addMissingBleed(
      input,
      { widthCm: 15, heightCm: 7 },
      0.2,
    );
    expect(generated).toBe(true);
    const meta = await sharp(buffer).metadata();
    expect(meta.width).toBe(740);
    expect(meta.height).toBe(1540);
  });

  it("leaves artwork that already carries the bleed untouched", async () => {
    const input = await trimSizedArtwork(1540, 740);
    const result = await addMissingBleed(input, { widthCm: 15, heightCm: 7 }, 0.2);
    expect(result.generated).toBe(false);
    expect(result.buffer).toBe(input);
  });

  it("leaves artwork of unrelated proportions untouched", async () => {
    const input = await trimSizedArtwork(1000, 1000);
    const result = await addMissingBleed(input, { widthCm: 15, heightCm: 7 }, 0.2);
    expect(result.generated).toBe(false);
  });
});
