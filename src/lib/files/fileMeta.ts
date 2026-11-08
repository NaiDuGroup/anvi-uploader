/**
 * Facts staff need to check an uploaded file: weight, pixels, the dpi written
 * in it and the physical size it prints at (raster px ÷ dpi, or the PDF page).
 * Server only: reads the file from storage once; the result is kept on `File`.
 */

import { parseJpegHead, parsePngHead } from "./localFileMeta";
import sharp from "sharp";
import { pdfPageMeta } from "./pdfPageMeta";
import { readLocalFile } from "@/lib/local-storage";
import { getObjectHead, getObjectRange, isLocalObjectStorage } from "@/lib/r2";
import { headFirstReader, isTiffHead, readTiffHead } from "./tiffHead";

/** Rasters keep their size and dpi in the header; this is enough for nearly all of them. */
const HEAD_BYTES = 2 * 1024 * 1024;
/** PDFs (and odd rasters) need the whole file; larger ones get their weight only. */
const FULL_MAX_BYTES = 120 * 1024 * 1024;
const MM_PER_INCH = 25.4;

export type FileMetaStatus = "ok" | "unsupported" | "missing";

export interface FileMeta {
  sizeBytes: number | null;
  pixelWidth: number | null;
  pixelHeight: number | null;
  dpi: number | null;
  widthMm: number | null;
  heightMm: number | null;
  pageCount: number | null;
  metaStatus: FileMetaStatus;
}

const EMPTY: Omit<FileMeta, "metaStatus"> = {
  sizeBytes: null,
  pixelWidth: null,
  pixelHeight: null,
  dpi: null,
  widthMm: null,
  heightMm: null,
  pageCount: null,
};

async function loadBytes(fileUrl: string, maxBytes: number): Promise<{ bytes: Buffer; totalSize: number } | null> {
  if (isLocalObjectStorage()) {
    const data = await readLocalFile(fileUrl);
    return data ? { bytes: data, totalSize: data.byteLength } : null;
  }
  return getObjectHead(fileUrl, maxBytes);
}

function round(n: number, step: number): number {
  return Number((Math.round(n / step) * step).toFixed(4));
}

/** Pixels, dpi and print size of a PNG / JPEG / TIFF / WebP… (throws if sharp cannot read the header). */
export async function rasterMeta(bytes: Buffer): Promise<Pick<FileMeta, "pixelWidth" | "pixelHeight" | "dpi" | "widthMm" | "heightMm">> {
  const meta = await sharp(bytes, { failOn: "none", limitInputPixels: false }).metadata();
  if (!meta.width || !meta.height) throw new Error("no raster size");
  const swap = (meta.orientation ?? 1) >= 5;
  const pixelWidth = swap ? meta.height : meta.width;
  const pixelHeight = swap ? meta.width : meta.height;
  // sharp reports 72 dpi for a PNG / JPEG that has no density at all (libvips default):
  // read those two from the header, as the browser does, so «no dpi» stays «no dpi».
  const u8 = new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = meta.format === "png" ? parsePngHead(u8) : meta.format === "jpeg" ? parseJpegHead(u8) : null;
  const density = head ? head.dpi : (meta.density ?? null);
  const dpi = density && density > 1 ? round(density, 0.01) : null;
  return {
    pixelWidth,
    pixelHeight,
    dpi,
    widthMm: dpi ? round((pixelWidth / dpi) * MM_PER_INCH, 0.1) : null,
    heightMm: dpi ? round((pixelHeight / dpi) * MM_PER_INCH, 0.1) : null,
  };
}

/** Photoshop: size from the header; dpi lives deeper in the resources, so it is left out. */
function psdMeta(bytes: Buffer): Pick<FileMeta, "pixelWidth" | "pixelHeight"> | null {
  if (bytes.length < 26 || bytes.toString("latin1", 0, 4) !== "8BPS") return null;
  return { pixelHeight: bytes.readUInt32BE(14), pixelWidth: bytes.readUInt32BE(18) };
}

/** First page size (trim box, page rotation applied) and page count. */
export async function pdfMeta(bytes: Buffer): Promise<Pick<FileMeta, "widthMm" | "heightMm" | "pageCount">> {
  return pdfPageMeta(bytes);
}

function isPdf(bytes: Buffer, fileName: string): boolean {
  return bytes.subarray(0, 5).toString("latin1") === "%PDF-" || /\.pdf$/i.test(fileName);
}

/** Read a stored file's facts. Links to outside sites have none ("unsupported"). */
export async function readFileMeta(fileUrl: string, fileName: string): Promise<FileMeta> {
  if (/^https?:\/\//i.test(fileUrl)) return { ...EMPTY, metaStatus: "unsupported" };

  const head = await loadBytes(fileUrl, HEAD_BYTES);
  if (!head) return { ...EMPTY, metaStatus: "missing" };
  const base = { ...EMPTY, sizeBytes: head.totalSize };
  const complete = head.bytes.byteLength >= head.totalSize;
  const loadFull = async (): Promise<Buffer | null> => {
    if (complete) return head.bytes;
    if (head.totalSize > FULL_MAX_BYTES) return null;
    return (await loadBytes(fileUrl, head.totalSize))?.bytes ?? null;
  };

  if (isPdf(head.bytes, fileName)) {
    try {
      const full = await loadFull();
      if (!full) return { ...base, metaStatus: "unsupported" };
      return { ...base, ...(await pdfMeta(full)), metaStatus: "ok" };
    } catch {
      return { ...base, metaStatus: "unsupported" };
    }
  }

  // TIFF: the IFD is often at the end of a huge banner — read just it by range
  // (sharp would need the whole file, which is skipped above 120 MB).
  if (isTiffHead(head.bytes)) {
    try {
      const t = await readTiffHead(
        headFirstReader(head.bytes, complete ? undefined : async (o, l) => {
          const part = await getObjectRange(fileUrl, o, l);
          return part ?? new Uint8Array(0);
        }),
      );
      if (t) {
        const dpi = t.dpi && t.dpi > 1 ? round(t.dpi, 0.01) : null;
        return {
          ...base,
          pixelWidth: t.width,
          pixelHeight: t.height,
          dpi,
          widthMm: dpi ? round((t.width / dpi) * MM_PER_INCH, 0.1) : null,
          heightMm: dpi ? round((t.height / dpi) * MM_PER_INCH, 0.1) : null,
          metaStatus: "ok",
        };
      }
    } catch {
      // fall back to sharp below
    }
  }

  const psd = psdMeta(head.bytes);
  if (psd) return { ...base, ...psd, metaStatus: "ok" };

  try {
    return { ...base, ...(await rasterMeta(head.bytes)), metaStatus: "ok" };
  } catch {
    // Header beyond the first bytes (e.g. some TIFFs) or not an image at all.
  }
  if (!complete) {
    try {
      const full = await loadFull();
      if (full) return { ...base, ...(await rasterMeta(full)), metaStatus: "ok" };
    } catch {
      // fall through
    }
  }
  return { ...base, metaStatus: "unsupported" };
}
