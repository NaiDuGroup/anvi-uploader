/**
 * Server-side raster prep for roll layout PDF (sharp). PDF assembly lives in
 * {@link rollLayoutPdfCore.ts}; workshop UI builds PDFs in the browser instead.
 */

import sharp from "sharp";
import { cmToPx } from "@/lib/printDimensions";
import {
  ROLL_LAYOUT_MAX_EMBED_DPI,
  buildRollLayoutPdfBuffer as buildRollLayoutPdfBufferCore,
  cmToPt,
  type RollLayoutPdfAssetInput,
  type RollLayoutPdfBuildInput,
} from "./rollLayoutPdfCore";

export {
  ROLL_LAYOUT_MAX_EMBED_DPI,
  cmToPt,
  type RollLayoutPdfAssetInput,
  type RollLayoutPdfBuildInput,
};

const SHARP_OPTS = { limitInputPixels: false, failOn: "none" as const };

function extensionKind(fileName: string): "png" | "jpeg" | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return null;
}

export async function prepareRollLayoutRaster(
  buffer: Buffer,
  fileName: string,
  targetWidthCm: number,
  targetHeightCm: number,
  _rotated: boolean,
  galleryWrapCm = 0,
): Promise<{ kind: "png" | "jpeg"; buffer: Buffer }> {
  if (galleryWrapCm > 0) {
    return prepareGalleryWrapRaster(
      buffer,
      fileName,
      targetWidthCm,
      targetHeightCm,
      galleryWrapCm,
    );
  }

  const maxW = cmToPx(targetWidthCm, ROLL_LAYOUT_MAX_EMBED_DPI);
  const maxH = cmToPx(targetHeightCm, ROLL_LAYOUT_MAX_EMBED_DPI);
  const meta = await sharp(buffer, SHARP_OPTS).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  const needsResize = srcW > maxW + 1 || srcH > maxH + 1;
  const format = meta.format;
  const rasterKind: "png" | "jpeg" | null =
    format === "png" ? "png" : format === "jpeg" || format === "jpg" ? "jpeg" : null;

  if (!needsResize && rasterKind) {
    return { kind: rasterKind, buffer };
  }

  const kind = extensionKind(fileName);

  let pipeline = sharp(buffer, SHARP_OPTS).rotate();

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

/**
 * Build a gallery-wrap raster for canvas: the artwork stays the centred face
 * and a `galleryWrapCm` margin of mirrored edge pixels is added on every side,
 * so the result fills the wrapped slot (`targetWidthCm × targetHeightCm`) and,
 * once stretched over the frame, the sides read as a seamless continuation.
 *
 * `target*` are the slot (wrapped) dimensions; the face is `target − 2 × wrap`.
 * Mirror amounts are derived per axis from the source pixel density so the
 * margin equals exactly `wrap` cm regardless of the source resolution. The
 * source is EXIF-normalised first so the mirror aligns with the visible edges.
 */
async function prepareGalleryWrapRaster(
  buffer: Buffer,
  fileName: string,
  targetWidthCm: number,
  targetHeightCm: number,
  galleryWrapCm: number,
): Promise<{ kind: "png" | "jpeg"; buffer: Buffer }> {
  const faceWidthCm = targetWidthCm - 2 * galleryWrapCm;
  const faceHeightCm = targetHeightCm - 2 * galleryWrapCm;
  if (faceWidthCm <= 0 || faceHeightCm <= 0) {
    // Degenerate (wrap ≥ half the slot): fall back to a plain fit.
    return prepareRollLayoutRaster(buffer, fileName, targetWidthCm, targetHeightCm, false);
  }

  // Bake EXIF rotation so pixel edges match the visible artwork edges.
  const normalized = await sharp(buffer, SHARP_OPTS).rotate().toBuffer();
  const meta = await sharp(normalized, SHARP_OPTS).metadata();
  const srcW = meta.width ?? 0;
  const srcH = meta.height ?? 0;
  if (srcW <= 0 || srcH <= 0) {
    throw new Error(`Unsupported raster for gallery wrap: ${fileName}`);
  }

  // The source may be stored turned relative to the slot; match each image
  // axis to the face dimension it represents (closest aspect wins).
  const imgAspect = srcW / srcH;
  const direct =
    Math.abs(Math.log(imgAspect / (faceWidthCm / faceHeightCm))) <=
    Math.abs(Math.log(imgAspect / (faceHeightCm / faceWidthCm)));
  const faceCmForWidth = direct ? faceWidthCm : faceHeightCm;
  const faceCmForHeight = direct ? faceHeightCm : faceWidthCm;

  const leftRightPx = Math.max(1, Math.round((srcW * galleryWrapCm) / faceCmForWidth));
  const topBottomPx = Math.max(1, Math.round((srcH * galleryWrapCm) / faceCmForHeight));

  let pipeline = sharp(normalized, SHARP_OPTS).extend({
    top: topBottomPx,
    bottom: topBottomPx,
    left: leftRightPx,
    right: leftRightPx,
    extendWith: "mirror",
  });

  // Cap the wrapped raster at 300 DPI for the slot (orientation-agnostic box).
  const maxDim = Math.max(
    cmToPx(targetWidthCm, ROLL_LAYOUT_MAX_EMBED_DPI),
    cmToPx(targetHeightCm, ROLL_LAYOUT_MAX_EMBED_DPI),
  );
  const wrappedW = srcW + 2 * leftRightPx;
  const wrappedH = srcH + 2 * topBottomPx;
  if (wrappedW > maxDim + 1 || wrappedH > maxDim + 1) {
    pipeline = pipeline.resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  const kind = extensionKind(fileName);
  const hasAlpha = meta.hasAlpha === true;
  if (hasAlpha || kind === "png") {
    return { kind: "png", buffer: await pipeline.png().toBuffer() };
  }
  return {
    kind: "jpeg",
    buffer: await pipeline.jpeg({ quality: 90 }).toBuffer(),
  };
}

export async function buildRollLayoutPdfBuffer(
  input: RollLayoutPdfBuildInput,
): Promise<Uint8Array> {
  const wrapMap = input.galleryWrapCmByTileId;
  return buildRollLayoutPdfBufferCore({
    ...input,
    prepareRaster: async (asset, placement) => {
      const prepared = await prepareRollLayoutRaster(
        Buffer.from(asset.buffer),
        asset.fileName,
        placement.widthCm,
        placement.heightCm,
        placement.rotated,
        wrapMap?.get(placement.tileId) ?? 0,
      );
      return { kind: prepared.kind, buffer: prepared.buffer };
    },
  });
}
