/**
 * Server-side roll layout PDF builder.
 *
 * Composes a single custom-size PDF page (printable width × total length) by
 * placing source assets at packer coordinates — no flattened mega-raster.
 */

import { PDFDocument, degrees, rgb } from "pdf-lib";
import sharp from "sharp";
import { cmToPx } from "@/lib/printDimensions";
import type { GroupTilePackPlacement } from "./groupTilePack";

const CM_PER_INCH = 2.54;
const PT_PER_INCH = 72;
/** Cap embedded raster resolution to keep output size reasonable. */
export const ROLL_LAYOUT_MAX_EMBED_DPI = 300;
/** Thin cut guide stroke (PDF points). */
const BORDER_WIDTH_PT = 0.5;
/**
 * Wide-format sources (e.g. 95×265 cm @ 300 DPI ≈ 351 MP) exceed sharp's default
 * ~268 MP safety cap. We only disable it server-side for trusted order uploads.
 */
const SHARP_OPTS = { limitInputPixels: false, failOn: "none" as const };

export function cmToPt(cm: number): number {
  return (cm / CM_PER_INCH) * PT_PER_INCH;
}

export type RollLayoutAssetKind = "png" | "jpeg" | "pdf";

export interface RollLayoutPdfAssetInput {
  tileId: string;
  fileName: string;
  buffer: Buffer;
}

export interface RollLayoutPdfBuildInput {
  printableWidthCm: number;
  totalAlongCm: number;
  placements: readonly GroupTilePackPlacement[];
  assets: readonly RollLayoutPdfAssetInput[];
}

function extensionKind(fileName: string): RollLayoutAssetKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return null;
}

/**
 * Downscale (never upscale) rasters above {@link ROLL_LAYOUT_MAX_EMBED_DPI} at the
 * target physical size. PNG with alpha stays PNG; opaque rasters become JPEG.
 */
export async function prepareRollLayoutRaster(
  buffer: Buffer,
  fileName: string,
  targetWidthCm: number,
  targetHeightCm: number,
  rotated: boolean,
): Promise<{ kind: "png" | "jpeg"; buffer: Buffer }> {
  const maxW = cmToPx(targetWidthCm, ROLL_LAYOUT_MAX_EMBED_DPI);
  const maxH = cmToPx(targetHeightCm, ROLL_LAYOUT_MAX_EMBED_DPI);
  const meta = await sharp(buffer, SHARP_OPTS).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  const needsResize = srcW > maxW + 1 || srcH > maxH + 1;
  const format = meta.format;
  const rasterKind: "png" | "jpeg" | null =
    format === "png" ? "png" : format === "jpeg" || format === "jpg" ? "jpeg" : null;

  // Already print-ready @ ≤300 DPI and upright — embed original bytes (no recompress).
  if (!rotated && !needsResize && rasterKind) {
    return { kind: rasterKind, buffer };
  }

  const kind = extensionKind(fileName);

  let pipeline = sharp(buffer, SHARP_OPTS).rotate();
  if (rotated) {
    pipeline = pipeline.rotate(90);
  }

  if (needsResize) {
    pipeline = pipeline.resize(maxW, maxH, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const hasAlpha = meta.hasAlpha === true;
  if (hasAlpha || kind === "png") {
    return { kind: "png", buffer: await pipeline.png().toBuffer() };
  }
  return {
    kind: "jpeg",
    buffer: await pipeline.jpeg({ quality: 90 }).toBuffer(),
  };
}

function topDownCmToPdfY(pageHeightPt: number, yCm: number, heightCm: number): number {
  return pageHeightPt - cmToPt(yCm + heightCm);
}

export async function buildRollLayoutPdfBuffer(
  input: RollLayoutPdfBuildInput,
): Promise<Uint8Array> {
  const pageWidthPt = cmToPt(input.printableWidthCm);
  const pageHeightPt = cmToPt(input.totalAlongCm);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

  const assetByTile = new Map(input.assets.map((a) => [a.tileId, a]));

  for (const placement of input.placements) {
    const asset = assetByTile.get(placement.tileId);
    if (!asset) {
      throw new Error(`Missing asset for tile ${placement.tileId}`);
    }

    const xPt = cmToPt(placement.xCm);
    const yPt = topDownCmToPdfY(pageHeightPt, placement.yCm, placement.heightCm);
    const wPt = cmToPt(placement.widthCm);
    const hPt = cmToPt(placement.heightCm);

    const kind = extensionKind(asset.fileName);
    if (!kind) {
      throw new Error(`Unsupported file type: ${asset.fileName}`);
    }

    if (kind === "pdf") {
      const [embeddedPage] = await pdfDoc.embedPdf(asset.buffer, [0]);
      if (placement.rotated) {
        page.drawPage(embeddedPage, {
          x: xPt + wPt,
          y: yPt,
          width: hPt,
          height: wPt,
          rotate: degrees(90),
        });
      } else {
        page.drawPage(embeddedPage, {
          x: xPt,
          y: yPt,
          width: wPt,
          height: hPt,
        });
      }
    } else {
      const prepared = await prepareRollLayoutRaster(
        asset.buffer,
        asset.fileName,
        placement.widthCm,
        placement.heightCm,
        placement.rotated,
      );
      const image =
        prepared.kind === "png"
          ? await pdfDoc.embedPng(prepared.buffer)
          : await pdfDoc.embedJpg(prepared.buffer);
      page.drawImage(image, {
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
      });
    }

    page.drawRectangle({
      x: xPt,
      y: yPt,
      width: wPt,
      height: hPt,
      borderWidth: BORDER_WIDTH_PT,
      borderColor: rgb(0, 0, 0),
      borderOpacity: 1,
    });
  }

  return pdfDoc.save();
}
