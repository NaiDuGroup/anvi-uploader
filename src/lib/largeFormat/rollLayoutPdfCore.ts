/**
 * Roll layout PDF builder (browser + server safe — no sharp / Node-only deps).
 */

import { PDFDocument, degrees, rgb } from "pdf-lib";
import type { GroupTilePackPlacement } from "./groupTilePack";

const CM_PER_INCH = 2.54;
const PT_PER_INCH = 72;

export const ROLL_LAYOUT_MAX_EMBED_DPI = 300;
const BORDER_WIDTH_PT = 0.5;

export function cmToPt(cm: number): number {
  return (cm / CM_PER_INCH) * PT_PER_INCH;
}

export type RollLayoutAssetKind = "png" | "jpeg" | "pdf";

export interface RollLayoutPdfAssetInput {
  tileId: string;
  fileName: string;
  buffer: Uint8Array;
}

export type PreparedRaster = { kind: "png" | "jpeg"; buffer: Uint8Array };

export interface RollLayoutPdfBuildInput {
  printableWidthCm: number;
  totalAlongCm: number;
  placements: readonly GroupTilePackPlacement[];
  getAsset: (tileId: string) => Promise<RollLayoutPdfAssetInput>;
  releaseAssets?: () => void;
  /** Override raster prep (server uses sharp). Default: pass-through original bytes. */
  prepareRaster?: (
    asset: RollLayoutPdfAssetInput,
    placement: GroupTilePackPlacement,
  ) => Promise<PreparedRaster>;
}

export function extensionKind(fileName: string): RollLayoutAssetKind | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "pdf") return "pdf";
  if (ext === "png") return "png";
  if (ext === "jpg" || ext === "jpeg") return "jpeg";
  return null;
}

export function detectRasterKind(
  bytes: Uint8Array,
  fileName: string,
): "png" | "jpeg" | null {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "png";
  }
  const ext = extensionKind(fileName);
  if (ext === "png" || ext === "jpeg") return ext;
  return null;
}

/** Embed print-ready rasters as-is (no recompress). */
export async function prepareRollLayoutRasterPassThrough(
  asset: RollLayoutPdfAssetInput,
  placement: GroupTilePackPlacement,
): Promise<PreparedRaster> {
  if (placement.rotated && typeof document !== "undefined") {
    return rotateRasterWithCanvas(asset.buffer, asset.fileName);
  }
  if (placement.rotated) {
    throw new Error(`Tile ${placement.tileId} requires rotation (not supported here)`);
  }
  const kind = detectRasterKind(asset.buffer, asset.fileName);
  if (!kind) {
    throw new Error(`Unsupported raster: ${asset.fileName}`);
  }
  return { kind, buffer: asset.buffer };
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = url;
  });
}

async function rotateRasterWithCanvas(
  bytes: Uint8Array,
  fileName: string,
): Promise<PreparedRaster> {
  const mime =
    detectRasterKind(bytes, fileName) === "png" ? "image/png" : "image/jpeg";
  const url = URL.createObjectURL(
    new Blob([Uint8Array.from(bytes)], { type: mime }),
  );
  try {
    const img = await loadHtmlImage(url);
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not available");
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const outMime = mime === "image/png" ? "image/png" : "image/jpeg";
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))),
        outMime,
        outMime === "image/jpeg" ? 0.92 : undefined,
      );
    });
    const buf = new Uint8Array(await blob.arrayBuffer());
    return {
      kind: outMime === "image/png" ? "png" : "jpeg",
      buffer: buf,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function topDownCmToPdfY(pageHeightPt: number, yCm: number, heightCm: number): number {
  return pageHeightPt - cmToPt(yCm + heightCm);
}

export async function buildRollLayoutPdfBuffer(
  input: RollLayoutPdfBuildInput,
): Promise<Uint8Array> {
  const prepare =
    input.prepareRaster ?? prepareRollLayoutRasterPassThrough;

  const pageWidthPt = cmToPt(input.printableWidthCm);
  const pageHeightPt = cmToPt(input.totalAlongCm);

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

  for (const placement of input.placements) {
    const asset = await input.getAsset(placement.tileId);

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
      const prepared = await prepare(asset, placement);
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

  input.releaseAssets?.();
  return pdfDoc.save({ useObjectStreams: false });
}
