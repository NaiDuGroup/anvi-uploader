/**
 * Workshop DTF film: artwork outlines → tight nesting → print PDF with a white
 * spot channel, plus a small preview image of the same layout. Server only (sharp).
 *
 * - Transparent margins of a PNG are cut off and its real outline is nested,
 *   so canvases may overlap as long as the ink keeps `layoutGapMm` apart.
 * - No cut lines: the film is cut by hand around each picture.
 * - White underbase: a separate spot colour (`DTF_WHITE_SPOT_NAME`) at 100 %
 *   under every pixel at least half opaque, shrunk by `whiteChokeMm`. Colour
 *   is drawn on top with overprint so it does not knock the white out.
 * - Photos without transparency and vector PDFs are nested as rectangles with
 *   white under the whole rectangle.
 */

import sharp from "sharp";
import {
  PDFDocument,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  type PDFEmbeddedPage,
  type PDFImage,
  type PDFPage,
  type PDFRef,
  concatTransformationMatrix,
  degrees,
  drawObject,
  fill,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  setGraphicsState,
} from "pdf-lib";
import { cmToPt } from "@/lib/largeFormat/rollLayoutPdfCore";
import {
  NEST_CELL_CM,
  nestShapes,
  solidShape,
  type NestItem,
  type NestRotation,
  type NestShape,
} from "./dtfFilmNest";

/** Name of the white spot channel the RIP reads as white ink. */
export const DTF_WHITE_SPOT_NAME = "White";

const SHARP_OPTS = { limitInputPixels: false, failOn: "none" as const };
const MAX_DPI = 300;
/** A cell counts as ink from ~1 % average coverage (catches thin lines). */
const INK_ALPHA_MIN = 3;
/** White goes under pixels at least this opaque (0–255). */
const WHITE_ALPHA_MIN = 128;
const PREVIEW_PX_PER_CM = 20;
const PREVIEW_MAX_HEIGHT_PX = 6000;

export interface DtfFilmTransferInput {
  tileId: string;
  fileId: string;
  widthCm: number;
  heightCm: number;
}

export interface DtfFilmFile {
  fileName: string;
  buffer: Buffer;
}

export type DtfFilmUnplacedReason = "too_wide" | "empty" | "unreadable";

interface CropPx {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** One artwork at one declared size: its outline and how to cut it out of the file. */
interface ArtShape {
  key: string;
  fileId: string;
  kind: "raster" | "pdf";
  shape: NestShape;
  /** Raster crop to the inked area; null = whole file. */
  crop: CropPx | null;
  /** Printed size of the cropped artwork (unrotated). */
  widthCm: number;
  heightCm: number;
}

export interface DtfFilmPlacement {
  tileId: string;
  shapeKey: string;
  xCm: number;
  yCm: number;
  /** Rotated size on the film. */
  widthCm: number;
  heightCm: number;
  rotation: NestRotation;
}

export interface DtfFilmJob {
  filmWidthCm: number;
  lengthCm: number;
  placements: DtfFilmPlacement[];
  unplaced: { tileId: string; reason: DtfFilmUnplacedReason }[];
  /** Vector PDFs among the placed artworks (nested and underlaid as rectangles). */
  vectorPdfCount: number;
  shapes: Map<string, ArtShape>;
  files: Map<string, DtfFilmFile>;
  whiteChokeMm: number;
}

function isPdf(file: DtfFilmFile): boolean {
  return file.buffer.subarray(0, 5).toString("latin1") === "%PDF-" || /\.pdf$/i.test(file.fileName);
}

/** Read the raster upright (EXIF applied) as raw RGBA. */
async function readUprightRgba(buffer: Buffer): Promise<{ data: Buffer; width: number; height: number; hasAlpha: boolean }> {
  const meta = await sharp(buffer, SHARP_OPTS).metadata();
  const { data, info } = await sharp(buffer, SHARP_OPTS)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, hasAlpha: meta.hasAlpha === true };
}

async function analyzeRaster(
  key: string,
  fileId: string,
  buffer: Buffer,
  widthCm: number,
  heightCm: number,
): Promise<ArtShape | "empty"> {
  const gridW = Math.max(1, Math.round(widthCm / NEST_CELL_CM));
  const gridH = Math.max(1, Math.round(heightCm / NEST_CELL_CM));
  const meta = await sharp(buffer, SHARP_OPTS).metadata();
  if (meta.hasAlpha !== true) {
    return { key, fileId, kind: "raster", shape: solidShape(gridW, gridH), crop: null, widthCm, heightCm };
  }

  const { data, info } = await sharp(buffer, SHARP_OPTS)
    .rotate()
    .ensureAlpha()
    .resize(gridW, gridH, { fit: "fill", kernel: "linear" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  let x0 = gridW;
  let y0 = gridH;
  let x1 = -1;
  let y1 = -1;
  const grid = new Uint8Array(gridW * gridH);
  for (let y = 0; y < gridH; y++) {
    for (let x = 0; x < gridW; x++) {
      if (data[(y * gridW + x) * ch + ch - 1] < INK_ALPHA_MIN) continue;
      grid[y * gridW + x] = 1;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return "empty";

  const w = x1 - x0 + 1;
  const h = y1 - y0 + 1;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) cells.set(grid.subarray((y0 + y) * gridW + x0, (y0 + y) * gridW + x0 + w), y * w);

  // Upright pixel size (EXIF orientations 5–8 swap the axes).
  const swap = (meta.orientation ?? 1) >= 5;
  const srcW = (swap ? meta.height : meta.width) ?? 1;
  const srcH = (swap ? meta.width : meta.height) ?? 1;
  const left = Math.floor((x0 / gridW) * srcW);
  const top = Math.floor((y0 / gridH) * srcH);
  const right = Math.min(srcW, Math.ceil(((x1 + 1) / gridW) * srcW));
  const bottom = Math.min(srcH, Math.ceil(((y1 + 1) / gridH) * srcH));
  const crop: CropPx = { left, top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };

  return {
    key,
    fileId,
    kind: "raster",
    shape: { widthCells: w, heightCells: h, cells },
    crop,
    widthCm: (crop.width / srcW) * widthCm,
    heightCm: (crop.height / srcH) * heightCm,
  };
}

/** Load the artworks, find their outlines and nest every transfer on the film. */
export async function planDtfFilm(params: {
  transfers: readonly DtfFilmTransferInput[];
  filmWidthCm: number;
  layoutGapMm: number;
  whiteChokeMm: number;
  loadFile: (fileId: string) => Promise<DtfFilmFile | null>;
}): Promise<DtfFilmJob> {
  const files = new Map<string, DtfFilmFile>();
  const shapes = new Map<string, ArtShape>();
  const unplaced: DtfFilmJob["unplaced"] = [];
  const items: NestItem[] = [];
  const badKeys = new Map<string, DtfFilmUnplacedReason>();

  for (const t of params.transfers) {
    const key = `${t.fileId}@${t.widthCm}x${t.heightCm}`;
    if (!shapes.has(key) && !badKeys.has(key)) {
      let file = files.get(t.fileId) ?? null;
      if (!file) {
        file = await params.loadFile(t.fileId);
        if (file) files.set(t.fileId, file);
      }
      if (!file) {
        badKeys.set(key, "unreadable");
      } else if (isPdf(file)) {
        const gw = Math.max(1, Math.round(t.widthCm / NEST_CELL_CM));
        const gh = Math.max(1, Math.round(t.heightCm / NEST_CELL_CM));
        shapes.set(key, {
          key,
          fileId: t.fileId,
          kind: "pdf",
          shape: solidShape(gw, gh),
          crop: null,
          widthCm: t.widthCm,
          heightCm: t.heightCm,
        });
      } else {
        try {
          const art = await analyzeRaster(key, t.fileId, file.buffer, t.widthCm, t.heightCm);
          if (art === "empty") badKeys.set(key, "empty");
          else shapes.set(key, art);
        } catch {
          badKeys.set(key, "unreadable");
        }
      }
    }

    const bad = badKeys.get(key);
    if (bad) {
      unplaced.push({ tileId: t.tileId, reason: bad });
      continue;
    }
    const art = shapes.get(key)!;
    items.push({
      id: t.tileId,
      shapeKey: key,
      shape: art.shape,
      // A rectangle looks the same at 180°; a vector page is only drawn upright or turned once.
      rotations: art.kind === "raster" && art.crop ? [0, 90, 180, 270] : [0, 90],
    });
  }

  const filmCells = Math.floor(params.filmWidthCm / NEST_CELL_CM + 1e-6);
  const gapCells = Math.round(params.layoutGapMm / 10 / NEST_CELL_CM);
  const nest = nestShapes(items, filmCells, gapCells);
  for (const id of nest.unplacedIds) unplaced.push({ tileId: id, reason: "too_wide" });

  const keyById = new Map(items.map((i) => [i.id, i.shapeKey]));
  const placements: DtfFilmPlacement[] = nest.placements.map((p) => {
    const art = shapes.get(keyById.get(p.id)!)!;
    const turned = p.rotation === 90 || p.rotation === 270;
    return {
      tileId: p.id,
      shapeKey: art.key,
      xCm: p.xCells * NEST_CELL_CM,
      yCm: p.yCells * NEST_CELL_CM,
      widthCm: turned ? art.heightCm : art.widthCm,
      heightCm: turned ? art.widthCm : art.heightCm,
      rotation: p.rotation,
    };
  });

  const placedKeys = new Set(placements.map((p) => p.shapeKey));
  const vectorPdfCount = [...placedKeys].filter((k) => shapes.get(k)?.kind === "pdf").length;
  const lengthCm = placements.reduce((m, p) => Math.max(m, p.yCm + p.heightCm), 0);

  return {
    filmWidthCm: params.filmWidthCm,
    lengthCm,
    placements,
    unplaced,
    vectorPdfCount,
    shapes,
    files,
    whiteChokeMm: params.whiteChokeMm,
  };
}

interface RenderedArt {
  /** RGBA, upright on the film. */
  rgba: Buffer;
  width: number;
  height: number;
  hasAlpha: boolean;
}

/** Cut the artwork to its inked area, turn it, and cap it at `maxPxPerCm`. */
async function renderArt(art: ArtShape, file: DtfFilmFile, rotation: NestRotation, maxPxPerCm: number): Promise<RenderedArt> {
  const upright = await readUprightRgba(file.buffer);
  let img = sharp(upright.data, { raw: { width: upright.width, height: upright.height, channels: 4 }, ...SHARP_OPTS });
  if (art.crop) img = img.extract(art.crop);
  const cropped = await img.raw().toBuffer({ resolveWithObject: true });

  const turned = rotation === 90 || rotation === 270;
  const outWcm = turned ? art.heightCm : art.widthCm;
  const outHcm = turned ? art.widthCm : art.heightCm;
  let pipeline = sharp(cropped.data, {
    raw: { width: cropped.info.width, height: cropped.info.height, channels: 4 },
    ...SHARP_OPTS,
  });
  if (rotation !== 0) pipeline = pipeline.rotate(rotation);
  const { data, info } = await pipeline
    .resize(Math.max(1, Math.round(outWcm * maxPxPerCm)), Math.max(1, Math.round(outHcm * maxPxPerCm)), {
      fit: "fill",
      withoutEnlargement: true,
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height, hasAlpha: upright.hasAlpha };
}

/** Square erosion of a 0/1 mask by `radius` px (separable min filter). */
export function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1;
      for (let d = -radius; d <= radius && v; d++) {
        const xx = x + d;
        if (xx < 0 || xx >= width || !mask[y * width + xx]) v = 0;
      }
      tmp[y * width + x] = v;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 1;
      for (let d = -radius; d <= radius && v; d++) {
        const yy = y + d;
        if (yy < 0 || yy >= height || !tmp[yy * width + x]) v = 0;
      }
      out[y * width + x] = v;
    }
  }
  return out;
}

/** 1-bit rows (MSB first), 1 = white ink. */
function packBits(mask: Uint8Array, width: number, height: number): Uint8Array {
  const rowBytes = Math.ceil(width / 8);
  const out = new Uint8Array(rowBytes * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x]) out[y * rowBytes + (x >> 3)] |= 0x80 >> (x & 7);
    }
  }
  return out;
}

function whiteMask(art: RenderedArt, chokePx: number): Uint8Array {
  const n = art.width * art.height;
  const mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) mask[i] = art.rgba[i * 4 + 3] >= WHITE_ALPHA_MIN ? 1 : 0;
  return erodeMask(mask, art.width, art.height, chokePx);
}

function pdfY(pageHeightPt: number, yCm: number, heightCm: number): number {
  return pageHeightPt - cmToPt(yCm + heightCm);
}

function addWhiteColorSpace(doc: PDFDocument, page: PDFPage, spotName: string): PDFName {
  const ctx = doc.context;
  const tint = ctx.register(ctx.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 0, 0, 0], N: 1 }));
  const cs = ctx.register(ctx.obj([PDFName.of("Separation"), PDFName.of(spotName), PDFName.of("DeviceCMYK"), tint]));
  page.node.normalize();
  const resources = page.node.Resources()!;
  const name = PDFName.of("CsWhite");
  resources.set(PDFName.of("ColorSpace"), ctx.obj({ CsWhite: cs }));
  return name;
}

/** Print PDF: film-wide page, white spot channel under every artwork, colour overprinted. */
export async function buildDtfFilmPdf(job: DtfFilmJob, spotName: string = DTF_WHITE_SPOT_NAME): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const pageW = cmToPt(job.filmWidthCm);
  const pageH = cmToPt(Math.max(job.lengthCm, 0.1));
  const page = doc.addPage([pageW, pageH]);
  const ctx = doc.context;
  const csWhite = addWhiteColorSpace(doc, page, spotName);
  const overprint = page.node.newExtGState(
    "GsOverprint",
    ctx.obj({ Type: "ExtGState", OP: true, op: true, OPM: 1 }),
  );

  const maxPxPerCm = MAX_DPI / 2.54;
  const rasterCache = new Map<string, { image: PDFImage; stencil: PDFName }>();
  const pdfPages = new Map<string, PDFEmbeddedPage>();

  const setWhite = [
    PDFOperator.of(PDFOperatorNames.NonStrokingColorspace, [csWhite]),
    PDFOperator.of(PDFOperatorNames.NonStrokingColorN, [PDFNumber.of(1)]),
  ];

  // Pass 1 — white under everything (first, so colour can overprint it).
  for (const p of job.placements) {
    const art = job.shapes.get(p.shapeKey)!;
    const file = job.files.get(art.fileId)!;
    const x = cmToPt(p.xCm);
    const y = pdfY(pageH, p.yCm, p.heightCm);
    const w = cmToPt(p.widthCm);
    const h = cmToPt(p.heightCm);

    if (art.kind === "pdf") {
      if (!pdfPages.has(art.key)) {
        const [embedded] = await doc.embedPdf(file.buffer, [0]);
        pdfPages.set(art.key, embedded);
      }
      const choke = cmToPt(job.whiteChokeMm / 10);
      page.pushOperators(
        pushGraphicsState(),
        ...setWhite,
        rectangle(x + choke, y + choke, Math.max(0, w - 2 * choke), Math.max(0, h - 2 * choke)),
        fill(),
        popGraphicsState(),
      );
      continue;
    }

    const cacheKey = `${art.key}#${p.rotation}`;
    let cached = rasterCache.get(cacheKey);
    if (!cached) {
      const r = await renderArt(art, file, p.rotation, maxPxPerCm);
      const pxPerCm = r.width / p.widthCm;
      const chokePx = Math.round((job.whiteChokeMm / 10) * pxPerCm);
      const mask = whiteMask(r, chokePx);
      const stencilRef: PDFRef = ctx.register(
        ctx.flateStream(packBits(mask, r.width, r.height), {
          Type: "XObject",
          Subtype: "Image",
          Width: r.width,
          Height: r.height,
          ImageMask: true,
          BitsPerComponent: 1,
          Decode: [1, 0],
        }),
      );
      const stencil = page.node.newXObject("WhiteMask", stencilRef);
      const sh = sharp(r.rgba, { raw: { width: r.width, height: r.height, channels: 4 } });
      const image = r.hasAlpha
        ? await doc.embedPng(await sh.png().toBuffer())
        : await doc.embedJpg(await sh.removeAlpha().jpeg({ quality: 92 }).toBuffer());
      cached = { image, stencil };
      rasterCache.set(cacheKey, cached);
    }
    page.pushOperators(
      pushGraphicsState(),
      ...setWhite,
      concatTransformationMatrix(w, 0, 0, h, x, y),
      drawObject(cached.stencil),
      popGraphicsState(),
    );
  }

  // Pass 2 — colour, overprinting the white.
  page.pushOperators(pushGraphicsState(), setGraphicsState(overprint));
  for (const p of job.placements) {
    const art = job.shapes.get(p.shapeKey)!;
    const x = cmToPt(p.xCm);
    const y = pdfY(pageH, p.yCm, p.heightCm);
    const w = cmToPt(p.widthCm);
    const h = cmToPt(p.heightCm);
    if (art.kind === "pdf") {
      const embedded = pdfPages.get(art.key)!;
      if (p.rotation === 90) {
        page.drawPage(embedded, { x: x + w, y, width: h, height: w, rotate: degrees(90) });
      } else {
        page.drawPage(embedded, { x, y, width: w, height: h });
      }
      continue;
    }
    const cached = rasterCache.get(`${art.key}#${p.rotation}`)!;
    page.drawImage(cached.image, { x, y, width: w, height: h });
  }
  page.pushOperators(popGraphicsState());

  return doc.save({ useObjectStreams: false });
}

/** Preview of the film (artwork as it will be printed, grey = bare film). */
export async function buildDtfFilmPreview(job: DtfFilmJob): Promise<Buffer> {
  const pxPerCm = Math.min(PREVIEW_PX_PER_CM, PREVIEW_MAX_HEIGHT_PX / Math.max(job.lengthCm, 1));
  const width = Math.max(1, Math.round(job.filmWidthCm * pxPerCm));
  const height = Math.max(1, Math.round(Math.max(job.lengthCm, 1) * pxPerCm));
  const cache = new Map<string, Buffer>();
  const layers: sharp.OverlayOptions[] = [];

  for (const p of job.placements) {
    const art = job.shapes.get(p.shapeKey)!;
    const left = Math.min(width - 1, Math.round(p.xCm * pxPerCm));
    const top = Math.min(height - 1, Math.round(p.yCm * pxPerCm));
    const w = Math.max(1, Math.min(width - left, Math.round(p.widthCm * pxPerCm)));
    const h = Math.max(1, Math.min(height - top, Math.round(p.heightCm * pxPerCm)));
    const cacheKey = `${art.key}#${p.rotation}#${w}x${h}`;
    let input = cache.get(cacheKey);
    if (!input) {
      if (art.kind === "pdf") {
        input = await sharp({ create: { width: w, height: h, channels: 4, background: { r: 245, g: 208, b: 254, alpha: 1 } } })
          .png()
          .toBuffer();
      } else {
        const r = await renderArt(art, job.files.get(art.fileId)!, p.rotation, pxPerCm);
        input = await sharp(r.rgba, { raw: { width: r.width, height: r.height, channels: 4 } })
          .resize(w, h, { fit: "fill" })
          .png()
          .toBuffer();
      }
      cache.set(cacheKey, input);
    }
    layers.push({ input, left, top });
  }

  return sharp({ create: { width, height, channels: 4, background: { r: 229, g: 231, b: 235, alpha: 1 } } })
    .composite(layers)
    .webp({ quality: 82 })
    .toBuffer();
}
