/**
 * Business card imposition sheets as PNG: one image per printed side, each the
 * full sheet at 300 DPI with the card repeated across the centred grid and a
 * single grey cut line around the whole block (no lines between cards). The
 * reverse is turned 180° for duplex registration.
 */

import sharp from "sharp";
import { cmToPx } from "@/lib/printDimensions";
import {
  detectRasterKind,
  shouldRotateContentForPlacement,
} from "@/lib/largeFormat/rollLayoutPdfCore";
import { addMissingBleed, type TrimSizeCm } from "@/lib/sheetProduct/addMissingBleed";
import type { BusinessCardSheetLayout } from "./businessCardSheetLayout";

export const BUSINESS_CARD_SHEET_DPI = 300;

/** ≈ 0.75 pt at 300 DPI; grey so it reads as a cut guide, not artwork. */
const OUTLINE_WIDTH_PX = 3;
const OUTLINE_GRAY = 153;

const SHARP_OPTS = { limitInputPixels: false, failOn: "none" } as const;
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 } as const;

export const BUSINESS_CARD_ARTWORK_NOT_RASTER = "business_card_artwork_not_raster";

export interface BusinessCardSheetSide {
  /** "front" / "back" — used in file names and error messages. */
  label: string;
  fileName: string;
  buffer: Buffer;
  /**
   * Turn the finished sheet by this much. The reverse is printed at 180° so it
   * registers with the front after the press flips the sheet; the grid is
   * centred and uniform, so it maps onto itself.
   */
  rotateDeg?: 0 | 180;
}

export interface BusinessCardSheetPngInput {
  layout: BusinessCardSheetLayout;
  /** One entry per printed side, in print order. */
  sides: readonly BusinessCardSheetSide[];
  /**
   * When set, artwork made at this finished size gets its bleed generated
   * before imposition (flyers); artwork that already has it is used as-is.
   */
  generateMissingBleed?: { trim: TrimSizeCm; bleedCm: number };
}

export interface BusinessCardSheetPng {
  label: string;
  png: Buffer;
}

interface PxRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

function cmRectToPx(xCm: number, yCm: number, widthCm: number, heightCm: number): PxRect {
  const left = cmToPx(xCm, BUSINESS_CARD_SHEET_DPI);
  const top = cmToPx(yCm, BUSINESS_CARD_SHEET_DPI);
  // Edges are rounded independently so neighbouring cards share a pixel edge.
  return {
    left,
    top,
    width: cmToPx(xCm + widthCm, BUSINESS_CARD_SHEET_DPI) - left,
    height: cmToPx(yCm + heightCm, BUSINESS_CARD_SHEET_DPI) - top,
  };
}

/** Bounding box of the whole printed block — the only cut line drawn. */
export function businessCardBlockRectPx(layout: BusinessCardSheetLayout): PxRect {
  const blockWidthCm =
    layout.columns * layout.slotWidthCm + (layout.columns - 1) * layout.gapCm;
  const blockHeightCm =
    layout.rows * layout.slotHeightCm + (layout.rows - 1) * layout.gapCm;
  return cmRectToPx(layout.marginXCm, layout.marginYCm, blockWidthCm, blockHeightCm);
}

function outlineSvg(sheetWidthPx: number, sheetHeightPx: number, rect: PxRect): Buffer {
  const half = OUTLINE_WIDTH_PX / 2;
  const gray = `rgb(${OUTLINE_GRAY},${OUTLINE_GRAY},${OUTLINE_GRAY})`;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidthPx}" height="${sheetHeightPx}">` +
      `<rect x="${rect.left + half}" y="${rect.top + half}" ` +
      `width="${rect.width - OUTLINE_WIDTH_PX}" height="${rect.height - OUTLINE_WIDTH_PX}" ` +
      `fill="none" stroke="${gray}" stroke-width="${OUTLINE_WIDTH_PX}"/>` +
      `</svg>`,
  );
}

async function buildSideSheet(
  layout: BusinessCardSheetLayout,
  side: BusinessCardSheetSide,
  generateMissingBleed: BusinessCardSheetPngInput["generateMissingBleed"],
): Promise<Buffer> {
  if (!detectRasterKind(side.buffer, side.fileName)) {
    throw new Error(BUSINESS_CARD_ARTWORK_NOT_RASTER);
  }

  const artwork = generateMissingBleed
    ? (
        await addMissingBleed(
          side.buffer,
          generateMissingBleed.trim,
          generateMissingBleed.bleedCm,
        )
      ).buffer
    : side.buffer;

  // Bake EXIF orientation so the pixel axes match the visible artwork.
  const normalized = await sharp(artwork, SHARP_OPTS)
    .rotate()
    .flatten({ background: WHITE })
    .toBuffer();
  const meta = await sharp(normalized, SHARP_OPTS).metadata();
  const firstPlacement = layout.placements[0]!;
  const turnArtwork = shouldRotateContentForPlacement(
    meta.width ?? 0,
    meta.height ?? 0,
    firstPlacement,
  );

  // Rounding can make slots differ by a pixel; resize once per distinct size.
  const cardBySize = new Map<string, Promise<Buffer>>();
  const cardRaster = (width: number, height: number): Promise<Buffer> => {
    const key = `${width}x${height}`;
    let raster = cardBySize.get(key);
    if (!raster) {
      let pipeline = sharp(normalized, SHARP_OPTS);
      // Counter-clockwise, matching the PDF layouts' 90° draw rotation.
      if (turnArtwork) pipeline = pipeline.rotate(270);
      raster = pipeline.resize(width, height, { fit: "fill" }).png().toBuffer();
      cardBySize.set(key, raster);
    }
    return raster;
  };

  const sheetWidthPx = cmToPx(layout.sheetWidthCm, BUSINESS_CARD_SHEET_DPI);
  const sheetHeightPx = cmToPx(layout.sheetHeightCm, BUSINESS_CARD_SHEET_DPI);

  const cards = await Promise.all(
    layout.placements.map(async (p) => {
      const rect = cmRectToPx(p.xCm, p.yCm, p.widthCm, p.heightCm);
      return {
        input: await cardRaster(rect.width, rect.height),
        left: rect.left,
        top: rect.top,
      };
    }),
  );

  const sheet = await sharp({
    create: { width: sheetWidthPx, height: sheetHeightPx, channels: 3, background: WHITE },
  })
    .composite([
      ...cards,
      {
        input: outlineSvg(sheetWidthPx, sheetHeightPx, businessCardBlockRectPx(layout)),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();

  // Composite runs after rotate inside one pipeline, so turn in a second pass.
  const finished = side.rotateDeg === 180 ? sharp(sheet).rotate(180) : sharp(sheet);
  return finished.withMetadata({ density: BUSINESS_CARD_SHEET_DPI }).png().toBuffer();
}

export async function buildBusinessCardSheetPngs(
  input: BusinessCardSheetPngInput,
): Promise<BusinessCardSheetPng[]> {
  if (input.sides.length === 0) {
    throw new Error("business_card_layout_no_sides");
  }
  if (input.layout.cardsPerSheet === 0) {
    throw new Error("business_card_layout_card_does_not_fit");
  }

  return Promise.all(
    input.sides.map(async (side) => ({
      label: side.label,
      png: await buildSideSheet(input.layout, side, input.generateMissingBleed),
    })),
  );
}
