import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cmToPx } from "@/lib/printDimensions";
import { computeBusinessCardSheetLayout } from "./businessCardSheetLayout";
import {
  BUSINESS_CARD_ARTWORK_NOT_RASTER,
  BUSINESS_CARD_SHEET_DPI,
  buildBusinessCardSheetPngs,
  businessCardBlockRectPx,
} from "./businessCardSheetPng";

const layout = computeBusinessCardSheetLayout({
  sheetWidthCm: 22.5,
  sheetHeightCm: 32,
  cardWidthCm: 9.4,
  cardHeightCm: 5.4,
});

async function redArtwork(): Promise<Buffer> {
  return sharp({
    create: {
      width: cmToPx(9.4, BUSINESS_CARD_SHEET_DPI),
      height: cmToPx(5.4, BUSINESS_CARD_SHEET_DPI),
      channels: 3,
      background: { r: 255, g: 0, b: 0 },
    },
  })
    .png()
    .toBuffer();
}

interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

async function raw(png: Buffer): Promise<RawImage> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

function pixel(img: RawImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i]!, img.data[i + 1]!, img.data[i + 2]!];
}

describe("buildBusinessCardSheetPngs", () => {
  it("renders the full sheet at 300 DPI with one cut line around the block", async () => {
    expect(layout.columns * layout.rows).toBe(12);
    const [front] = await buildBusinessCardSheetPngs({
      layout,
      sides: [{ label: "front", fileName: "card.png", buffer: await redArtwork() }],
    });
    const img = await raw(front!.png);
    expect(img.width).toBe(cmToPx(22.5, BUSINESS_CARD_SHEET_DPI));
    expect(img.height).toBe(cmToPx(32, BUSINESS_CARD_SHEET_DPI));

    const block = businessCardBlockRectPx(layout);
    const midY = block.top + Math.round(block.height / 2);
    // Outer edge of the block: grey cut line.
    expect(pixel(img, block.left + 1, midY)).toEqual([153, 153, 153]);
    // Outside the block: white sheet.
    expect(pixel(img, block.left - 5, midY)).toEqual([255, 255, 255]);

    // Seam between the first two cards: artwork only, no inner line.
    const first = layout.placements[0]!;
    const seamX = cmToPx(first.xCm + first.widthCm, BUSINESS_CARD_SHEET_DPI);
    const rowMidY = cmToPx(first.yCm + first.heightCm / 2, BUSINESS_CARD_SHEET_DPI);
    expect(pixel(img, seamX, rowMidY)).toEqual([255, 0, 0]);
    expect(pixel(img, seamX - 1, rowMidY)).toEqual([255, 0, 0]);
  });

  it("turns the reverse sheet by 180°", async () => {
    const artwork = await redArtwork();
    const [front, back] = await buildBusinessCardSheetPngs({
      layout,
      sides: [
        { label: "front", fileName: "a.png", buffer: artwork },
        { label: "back", fileName: "b.png", buffer: artwork, rotateDeg: 180 },
      ],
    });
    const expected = await raw(await sharp(front!.png).rotate(180).png().toBuffer());
    const actual = await raw(back!.png);
    expect(actual.data.equals(expected.data)).toBe(true);
  });

  it("rejects non-raster artwork", async () => {
    await expect(
      buildBusinessCardSheetPngs({
        layout,
        sides: [{ label: "front", fileName: "card.pdf", buffer: Buffer.from("%PDF-1.4") }],
      }),
    ).rejects.toThrow(BUSINESS_CARD_ARTWORK_NOT_RASTER);
  });
});

describe("buildBusinessCardSheetPngs with generated bleed", () => {
  // One upright 15 × 7 flyer (15.4 × 7.4 with bleed) on a sheet just big enough.
  const flyerLayout = computeBusinessCardSheetLayout({
    sheetWidthCm: 16,
    sheetHeightCm: 8,
    cardWidthCm: 15.4,
    cardHeightCm: 7.4,
  });

  /** Trim-sized artwork: white with a 1 mm black strip along the left edge. */
  async function trimArtworkWithLeftStrip(): Promise<Buffer> {
    const width = cmToPx(15, BUSINESS_CARD_SHEET_DPI);
    const height = cmToPx(7, BUSINESS_CARD_SHEET_DPI);
    return sharp({
      create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .composite([
        {
          input: {
            create: {
              width: cmToPx(0.1, BUSINESS_CARD_SHEET_DPI),
              height,
              channels: 3,
              background: { r: 0, g: 0, b: 0 },
            },
          },
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer();
  }

  it("keeps trim-sized flyer artwork at its size and mirrors the edge into the bleed", async () => {
    expect(flyerLayout.cardsPerSheet).toBe(1);
    expect(flyerLayout.rotated).toBe(false);
    const [front] = await buildBusinessCardSheetPngs({
      layout: flyerLayout,
      sides: [
        { label: "front", fileName: "flyer.png", buffer: await trimArtworkWithLeftStrip() },
      ],
      generateMissingBleed: { trim: { widthCm: 15, heightCm: 7 }, bleedCm: 0.2 },
    });
    const img = await raw(front!.png);
    const cell = flyerLayout.placements[0]!;
    const midY = cmToPx(cell.yCm + cell.heightCm / 2, BUSINESS_CARD_SHEET_DPI);
    const at = (offsetCm: number): [number, number, number] =>
      pixel(img, cmToPx(cell.xCm + offsetCm, BUSINESS_CARD_SHEET_DPI), midY);

    // Bleed band 0–2 mm mirrors the first 2 mm: white, then the strip.
    expect(at(0.05)).toEqual([255, 255, 255]);
    expect(at(0.15)).toEqual([0, 0, 0]);
    // The strip itself starts exactly on the trim line, not stretched over it.
    expect(at(0.25)).toEqual([0, 0, 0]);
    expect(at(0.35)).toEqual([255, 255, 255]);
  });
});
