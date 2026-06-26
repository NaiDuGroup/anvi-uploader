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
  /**
   * White margin (cm) printed on every side of a placement, keyed by tile id
   * (e.g. BANNER MATT → 4 cm). The placement footprint already includes this
   * margin; the artwork is drawn inset so the surrounding band stays white.
   */
  borderCmByTileId?: ReadonlyMap<string, number>;
  /**
   * Mirrored gallery-wrap margin (cm) per tile id (e.g. canvas → 4 cm). The
   * placement footprint already includes this margin and the prepared raster
   * already contains the mirrored border, so the artwork is drawn across the
   * full slot (no white band, no inset). Requires a `prepareRaster` that
   * actually mirror-extends the source (server / sharp); the pass-through
   * default would merely stretch the face over the wrapped slot.
   */
  galleryWrapCmByTileId?: ReadonlyMap<string, number>;
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

/** Embed print-ready rasters as-is (no recompress). Rotation is applied at PDF draw time. */
export async function prepareRollLayoutRasterPassThrough(
  asset: RollLayoutPdfAssetInput,
  _placement: GroupTilePackPlacement,
): Promise<PreparedRaster> {
  const kind = detectRasterKind(asset.buffer, asset.fileName);
  if (!kind) {
    throw new Error(`Unsupported raster: ${asset.fileName}`);
  }
  return { kind, buffer: asset.buffer };
}

function topDownCmToPdfY(pageHeightPt: number, yCm: number, heightCm: number): number {
  return pageHeightPt - cmToPt(yCm + heightCm);
}

const ASPECT_LOG_EPS = 0.02;

function aspectRatio(width: number, height: number): number {
  return width / height;
}

function aspectsClose(a: number, b: number): boolean {
  if (a <= 0 || b <= 0) return false;
  return Math.abs(Math.log(a / b)) <= ASPECT_LOG_EPS;
}

/**
 * Packer `rotated` swaps placement width/height to fit the roll — not always
 * "rotate file pixels". Print files are often already stored in the turned
 * orientation (e.g. order 235×115 cm but JPEG pixels are 115×235).
 */
export function shouldRotateContentForPlacement(
  pixelWidth: number,
  pixelHeight: number,
  placement: GroupTilePackPlacement,
): boolean {
  if (!placement.rotated) return false;

  const imgAspect = aspectRatio(pixelWidth, pixelHeight);
  const slotAspect = aspectRatio(placement.widthCm, placement.heightCm);
  const orderAspect = aspectRatio(placement.heightCm, placement.widthCm);

  if (aspectsClose(imgAspect, slotAspect)) return false;
  if (aspectsClose(imgAspect, orderAspect)) return true;

  return (
    Math.abs(Math.log(imgAspect / orderAspect)) <
    Math.abs(Math.log(imgAspect / slotAspect))
  );
}

function drawRotatedContent(
  draw: (
    x: number,
    y: number,
    width: number,
    height: number,
    rotate?: ReturnType<typeof degrees>,
  ) => void,
  xPt: number,
  yPt: number,
  wPt: number,
  hPt: number,
  rotateContent: boolean,
): void {
  if (rotateContent) {
    draw(xPt + wPt, yPt, hPt, wPt, degrees(90));
  } else {
    draw(xPt, yPt, wPt, hPt);
  }
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

    // Gallery wrap (canvas): the prepared raster already includes the mirrored
    // margins, so it fills the whole slot — no white band, no inset. This wins
    // over the white-border path (the two are mutually exclusive per material).
    const galleryWrapCm = input.galleryWrapCmByTileId?.get(placement.tileId) ?? 0;
    // White border (e.g. BANNER MATT): paint the full slot white, then draw the
    // artwork inset by `borderCm` on every side so the band stays blank.
    const borderCm =
      galleryWrapCm > 0 ? 0 : input.borderCmByTileId?.get(placement.tileId) ?? 0;
    const borderPt = borderCm > 0 ? cmToPt(borderCm) : 0;
    const artXPt = xPt + borderPt;
    const artYPt = yPt + borderPt;
    const artWPt = wPt - 2 * borderPt;
    const artHPt = hPt - 2 * borderPt;
    const artPlacement =
      borderPt > 0
        ? {
            ...placement,
            widthCm: placement.widthCm - 2 * borderCm,
            heightCm: placement.heightCm - 2 * borderCm,
          }
        : placement;

    if (borderPt > 0) {
      page.drawRectangle({
        x: xPt,
        y: yPt,
        width: wPt,
        height: hPt,
        color: rgb(1, 1, 1),
      });
    }

    const kind = extensionKind(asset.fileName);
    if (!kind) {
      throw new Error(`Unsupported file type: ${asset.fileName}`);
    }

    if (kind === "pdf") {
      const [embeddedPage] = await pdfDoc.embedPdf(asset.buffer, [0]);
      const rotateContent = shouldRotateContentForPlacement(
        embeddedPage.width,
        embeddedPage.height,
        artPlacement,
      );
      drawRotatedContent(
        (x, y, width, height, rotate) => {
          page.drawPage(embeddedPage, { x, y, width, height, rotate });
        },
        artXPt,
        artYPt,
        artWPt,
        artHPt,
        rotateContent,
      );
    } else {
      const prepared = await prepare(asset, placement);
      const image =
        prepared.kind === "png"
          ? await pdfDoc.embedPng(prepared.buffer)
          : await pdfDoc.embedJpg(prepared.buffer);
      const rotateContent = shouldRotateContentForPlacement(
        image.width,
        image.height,
        artPlacement,
      );
      drawRotatedContent(
        (x, y, width, height, rotate) => {
          page.drawImage(image, { x, y, width, height, rotate });
        },
        artXPt,
        artYPt,
        artWPt,
        artHPt,
        rotateContent,
      );
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
