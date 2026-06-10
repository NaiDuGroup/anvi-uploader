/**
 * Server-side raster prep for roll layout PDF (sharp). PDF assembly lives in
 * {@link rollLayoutPdfCore.ts}; workshop UI builds PDFs in the browser instead.
 */

import sharp from "sharp";
import { cmToPx } from "@/lib/printDimensions";
import type { GroupTilePackPlacement } from "./groupTilePack";
import {
  ROLL_LAYOUT_MAX_EMBED_DPI,
  buildRollLayoutPdfBuffer as buildRollLayoutPdfBufferCore,
  cmToPt,
  type RollLayoutPdfAssetInput,
  type RollLayoutPdfBuildInput,
  type PreparedRaster,
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

async function prepareRasterServer(
  asset: RollLayoutPdfAssetInput,
  placement: GroupTilePackPlacement,
): Promise<PreparedRaster> {
  const prepared = await prepareRollLayoutRaster(
    Buffer.from(asset.buffer),
    asset.fileName,
    placement.widthCm,
    placement.heightCm,
    placement.rotated,
  );
  return { kind: prepared.kind, buffer: prepared.buffer };
}

export async function buildRollLayoutPdfBuffer(
  input: RollLayoutPdfBuildInput,
): Promise<Uint8Array> {
  return buildRollLayoutPdfBufferCore({
    ...input,
    prepareRaster: prepareRasterServer,
  });
}
