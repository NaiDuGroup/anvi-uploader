import { describe, expect, it } from "vitest";
import { contentAwareFill, type RgbImage } from "./contentAwareFill";

type Rgb = readonly [number, number, number];

const RED: Rgb = [220, 30, 30];
const BLUE: Rgb = [30, 60, 220];

/** Canvas with a known centre `paint(x, y)` and an unknown band of `band` px around it. */
function bandedCanvas(
  innerW: number,
  innerH: number,
  band: number,
  paint: (x: number, y: number) => Rgb,
): { image: RgbImage; known: Uint8Array } {
  const width = innerW + 2 * band;
  const height = innerH + 2 * band;
  const data = new Uint8Array(width * height * 3);
  const known = new Uint8Array(width * height);
  for (let y = 0; y < innerH; y++) {
    for (let x = 0; x < innerW; x++) {
      const i = (y + band) * width + x + band;
      data.set(paint(x, y), i * 3);
      known[i] = 1;
    }
  }
  return { image: { width, height, data }, known };
}

function pixelAt(image: RgbImage, x: number, y: number): number[] {
  const i = (y * image.width + x) * 3;
  return Array.from(image.data.subarray(i, i + 3));
}

/** Voting averages overlapping patches, so allow a few levels of drift. */
function expectClose(actual: number[], expected: Rgb): void {
  actual.forEach((value, c) => expect(Math.abs(value - expected[c]!)).toBeLessThanOrEqual(8));
}

describe("contentAwareFill", () => {
  it("carries horizontal stripes into the side bands at the same height", () => {
    const stripe = (y: number): Rgb => (Math.floor(y / 12) % 2 === 0 ? RED : BLUE);
    const band = 8;
    const { image, known } = bandedCanvas(80, 72, band, (_x, y) => stripe(y));

    expect(contentAwareFill(image, known, { sourceDepth: 12 })).toBe(true);

    for (let y = band; y < band + 72; y++) {
      // Rows near a stripe boundary may blend; check stripe interiors.
      const row = y - band;
      if (row % 12 < 3 || row % 12 > 8) continue;
      expectClose(pixelAt(image, 0, y), stripe(row));
      expectClose(pixelAt(image, image.width - 1, y), stripe(row));
    }
  });

  it("leaves known pixels untouched", () => {
    const paint = (x: number, y: number): Rgb => [(x * 7) % 256, (y * 11) % 256, (x + y) % 256];
    const { image, known } = bandedCanvas(40, 30, 6, paint);
    const before = Uint8Array.from(image.data);

    expect(contentAwareFill(image, known)).toBe(true);

    for (let i = 0; i < known.length; i++) {
      if (!known[i]) continue;
      expect(image.data.subarray(i * 3, i * 3 + 3)).toEqual(before.subarray(i * 3, i * 3 + 3));
    }
  });

  it("fills a uniform picture with the same colour everywhere", () => {
    const { image, known } = bandedCanvas(30, 30, 5, () => RED);

    expect(contentAwareFill(image, known)).toBe(true);

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        expect(pixelAt(image, x, y)).toEqual([...RED]);
      }
    }
  });

  it("gives up when nothing large enough to sample is known", () => {
    const { image, known } = bandedCanvas(3, 3, 4, () => RED);
    expect(contentAwareFill(image, known)).toBe(false);
  });
});
