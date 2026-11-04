import { PDFDocument, rgb } from "pdf-lib";
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

  it("rejects artwork that is neither PDF nor raster", async () => {
    await expect(
      buildBusinessCardSheetPngs({
        layout,
        sides: [{ label: "front", fileName: "card.cdr", buffer: Buffer.from("RIFF0000CDR") }],
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

  it("shrinks trim-sized flyer artwork into the safe zone and continues the edge outwards", async () => {
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

    // 15 × 7 cm shrinks by (7 − 0.4) / 7 and sits centred in 15.4 × 7.4 cm, so
    // the strip starts ≈ 6.3 mm from the cell edge and is ≈ 0.94 mm wide.
    // Everything outside it continues the strip, never the white beyond it.
    const isDark = (rgb: [number, number, number]): boolean => rgb.every((c) => c < 64);
    expect(isDark(at(0.1))).toBe(true);
    expect(isDark(at(0.4))).toBe(true);
    expect(at(0.67)).toEqual([0, 0, 0]);
    expect(at(0.85)).toEqual([255, 255, 255]);
  }, 30_000);
});

/** 15 × 7 cm PDF page filled red. */
async function redFlyerPdf(): Promise<Buffer> {
  const ptPerCm = 72 / 2.54;
  const doc = await PDFDocument.create();
  const page = doc.addPage([15 * ptPerCm, 7 * ptPerCm]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
    color: rgb(1, 0, 0),
  });
  return Buffer.from(await doc.save());
}

describe("buildBusinessCardSheetPngs with PDF artwork", () => {
  it("rasterises a trim-sized flyer PDF and fills the sheet cell", async () => {
    const flyerLayout = computeBusinessCardSheetLayout({
      sheetWidthCm: 16,
      sheetHeightCm: 8,
      cardWidthCm: 15.4,
      cardHeightCm: 7.4,
    });
    const [front] = await buildBusinessCardSheetPngs({
      layout: flyerLayout,
      sides: [{ label: "front", fileName: "flyer.pdf", buffer: await redFlyerPdf() }],
      generateMissingBleed: { trim: { widthCm: 15, heightCm: 7 }, bleedCm: 0.2 },
    });
    const img = await raw(front!.png);
    const cell = flyerLayout.placements[0]!;
    const midY = cmToPx(cell.yCm + cell.heightCm / 2, BUSINESS_CARD_SHEET_DPI);
    // Inside the generated bleed band and in the middle: the artwork colour.
    expect(pixel(img, cmToPx(cell.xCm + 0.1, BUSINESS_CARD_SHEET_DPI), midY)).toEqual([255, 0, 0]);
    expect(
      pixel(img, cmToPx(cell.xCm + cell.widthCm / 2, BUSINESS_CARD_SHEET_DPI), midY),
    ).toEqual([255, 0, 0]);
  });
});

describe("buildBusinessCardSheetPngs — artwork fit (storefront cards)", { timeout: 60_000 }, () => {
  /** Square artwork: top half red, bottom half blue. */
  async function squareArtwork(): Promise<Buffer> {
    const size = 600;
    const half = await sharp({ create: { width: size, height: size / 2, channels: 3, background: { r: 0, g: 0, b: 255 } } })
      .png()
      .toBuffer();
    return sharp({ create: { width: size, height: size, channels: 3, background: { r: 255, g: 0, b: 0 } } })
      .composite([{ input: half, left: 0, top: size / 2 }])
      .png()
      .toBuffer();
  }

  /** Pixel at (fx, fy) of the first card slot, as fractions of the slot. */
  const sheets = new Map<string, Promise<RawImage>>();
  async function slotPixel(fit: "fill" | "cover" | "contain", fx: number, fy: number) {
    if (!sheets.has(fit)) {
      sheets.set(
        fit,
        squareArtwork()
          .then((buffer) =>
            buildBusinessCardSheetPngs({ layout, sides: [{ label: "front", fileName: "square.png", buffer }], artworkFit: fit }),
          )
          .then(([front]) => raw(front!.png)),
      );
    }
    const img = await sheets.get(fit)!;
    const p = layout.placements[0]!;
    const x = cmToPx(p.xCm + p.widthCm * fx, BUSINESS_CARD_SHEET_DPI);
    const y = cmToPx(p.yCm + p.heightCm * fy, BUSINESS_CARD_SHEET_DPI);
    return pixel(img, x, y);
  }

  it("the 94×54 card sits turned in its slot on A4+", () => {
    expect(layout.rotated).toBe(true);
  });

  it("cover: the square face turns with the card and fills it (top of the art = one long edge of the slot)", async () => {
    // Turned counter-clockwise: the art's top (red) is on the slot's left, its bottom (blue) on the right.
    expect(await slotPixel("cover", 0.1, 0.5)).toEqual([255, 0, 0]);
    expect(await slotPixel("cover", 0.9, 0.5)).toEqual([0, 0, 255]);
    // Filled to the card's ends (cropped, not white).
    const end = await slotPixel("cover", 0.25, 0.02);
    expect(end).toEqual([255, 0, 0]);
  });

  it("contain: the whole square inside the card with white margins at the card's ends", async () => {
    expect(await slotPixel("contain", 0.25, 0.05)).toEqual([255, 255, 255]);
    expect(await slotPixel("contain", 0.75, 0.95)).toEqual([255, 255, 255]);
    expect(await slotPixel("contain", 0.1, 0.5)).toEqual([255, 0, 0]);
    expect(await slotPixel("contain", 0.9, 0.5)).toEqual([0, 0, 255]);
  });

  it("fill (studio lines, default) stays as before: stretched over the slot, not turned", async () => {
    expect(await slotPixel("fill", 0.5, 0.1)).toEqual([255, 0, 0]);
    expect(await slotPixel("fill", 0.5, 0.9)).toEqual([0, 0, 255]);
  });
});
