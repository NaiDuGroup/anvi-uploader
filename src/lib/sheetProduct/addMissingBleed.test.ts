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
  it("extends 15 × 7 artwork to 15.4 × 7.4 by continuing the picture", async () => {
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
  }, 30_000);

  it("keeps a flat edge plain instead of copying a mark that sits just inside it", async () => {
    // White 15 × 7 cm at 100 px/cm with a red cross outline 1 mm above the cut.
    const cross = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="700">
        <rect width="1500" height="700" fill="#fff"/>
        <path d="M730 608h40v30h30v40h-30v10h-40v-10h-30v-40h30z" fill="none" stroke="#f00" stroke-width="4"/>
      </svg>`,
    );
    const input = await sharp(cross).png().toBuffer();
    const { buffer } = await addMissingBleed(input, { widthCm: 15, heightCm: 7 }, 0.2);

    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    for (let y = 720; y < info.height; y++) {
      for (let x = 650; x < 900; x++) {
        const i = (y * info.width + x) * info.channels;
        expect(Math.min(data[i]!, data[i + 1]!, data[i + 2]!)).toBeGreaterThanOrEqual(250);
      }
    }
  });

  it("moves a mark at the artwork edge at least one bleed inside the cut", async () => {
    // White 15 × 7 cm at 100 px/cm with a red square touching the left edge.
    const square = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1500" height="700">
        <rect width="1500" height="700" fill="#fff"/>
        <rect x="0" y="300" width="50" height="50" fill="#f00"/>
      </svg>`,
    );
    const input = await sharp(square).png().toBuffer();
    const { buffer } = await addMissingBleed(input, { widthCm: 15, heightCm: 7 }, 0.2);

    const { data, info } = await sharp(buffer).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1540, 740]);
    const isRed = (x: number, y: number): boolean => {
      const i = (y * info.width + x) * info.channels;
      return data[i]! > 200 && data[i + 1]! < 60 && data[i + 2]! < 60;
    };
    // Shrunk by 660 / 700 and centred: the square now spans x ≈ 63–110, y ≈ 323–370,
    // while the cut is at x = 20 and the safe line one bleed further at x = 40.
    expect(isRed(66, 345)).toBe(true);
    expect(isRed(106, 345)).toBe(true);
    expect(isRed(118, 345)).toBe(false);
  }, 30_000);

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
  }, 30_000);

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
