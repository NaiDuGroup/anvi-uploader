/**
 * File facts read in the browser from a picked `File`, before it is uploaded:
 * pixels and dpi from the PNG / JPEG header, page size of a PDF. Same shape
 * as the server's `FileMetaJson` so the same line and size check apply.
 */

import type { FileMetaJson } from "./fileMetaFormat";
import { pdfPageMeta } from "./pdfPageMeta";

const HEAD_BYTES = 2 * 1024 * 1024;
const PDF_MAX_BYTES = 150 * 1024 * 1024;

interface RasterHead {
  width: number;
  height: number;
  dpi: number | null;
}

/** PNG: IHDR size, pHYs density (pixels per metre). */
export function parsePngHead(b: Uint8Array): RasterHead | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const width = v.getUint32(16);
  const height = v.getUint32(20);
  let dpi: number | null = null;
  let p = 8;
  while (p + 8 <= b.length) {
    const len = v.getUint32(p);
    const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
    if (type === "IDAT" || type === "IEND") break;
    if (type === "pHYs" && p + 17 <= b.length && b[p + 16] === 1) {
      dpi = v.getUint32(p + 8) * 0.0254;
    }
    p += 12 + len;
  }
  return { width, height, dpi };
}

function exifResolution(v: DataView, start: number, end: number): { dpi: number | null; orientation: number } {
  let dpi: number | null = null;
  let orientation = 1;
  if (start + 8 > end) return { dpi, orientation };
  const le = v.getUint16(start) === 0x4949;
  const u16 = (o: number): number => v.getUint16(o, le);
  const u32 = (o: number): number => v.getUint32(o, le);
  const ifd = start + u32(start + 4);
  if (ifd + 2 > end) return { dpi, orientation };
  let x: number | null = null;
  let unit = 2;
  const n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const e = ifd + 2 + i * 12;
    if (e + 12 > end) break;
    const tag = u16(e);
    if (tag === 0x0112) orientation = u16(e + 8);
    else if (tag === 0x0128) unit = u16(e + 8);
    else if (tag === 0x011a) {
      const off = start + u32(e + 8);
      if (off + 8 <= end) {
        const den = u32(off + 4);
        x = den ? u32(off) / den : null;
      }
    }
  }
  if (x && x > 1) dpi = unit === 3 ? x * 2.54 : x;
  return { dpi, orientation };
}

/** JPEG: SOF size, JFIF or EXIF density, EXIF orientation. */
export function parseJpegHead(b: Uint8Array): RasterHead | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let jfifDpi: number | null = null;
  let exif: { dpi: number | null; orientation: number } = { dpi: null, orientation: 1 };
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = b[p + 1];
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
      p += marker === 0xff ? 1 : 2;
      continue;
    }
    const len = v.getUint16(p + 2);
    const seg = p + 4;
    if (marker === 0xe0 && b[seg] === 0x4a && b[seg + 1] === 0x46 && b[seg + 2] === 0x49 && b[seg + 3] === 0x46) {
      const units = b[seg + 7];
      const xd = v.getUint16(seg + 8);
      if (xd > 1) jfifDpi = units === 1 ? xd : units === 2 ? xd * 2.54 : null;
    } else if (marker === 0xe1 && b[seg] === 0x45 && b[seg + 1] === 0x78 && b[seg + 2] === 0x69 && b[seg + 3] === 0x66) {
      exif = exifResolution(v, seg + 6, Math.min(b.length, p + 2 + len));
    } else if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      let height = v.getUint16(seg + 1);
      let width = v.getUint16(seg + 3);
      if (exif.orientation >= 5) [width, height] = [height, width];
      return { width, height, dpi: exif.dpi ?? jfifDpi };
    } else if (marker === 0xda) {
      break;
    }
    p += 2 + len;
  }
  return null;
}

async function bitmapSize(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bmp = await createImageBitmap(file);
    const size = { width: bmp.width, height: bmp.height };
    bmp.close();
    return size;
  } catch {
    return null;
  }
}

function round(n: number, step: number): number {
  return Number((Math.round(n / step) * step).toFixed(4));
}

/** Facts of a picked file; `metaStatus: "unsupported"` = weight only. */
export async function readLocalFileMeta(file: File): Promise<FileMetaJson> {
  const base: FileMetaJson = {
    sizeBytes: file.size,
    pixelWidth: null,
    pixelHeight: null,
    dpi: null,
    widthMm: null,
    heightMm: null,
    pageCount: null,
    metaStatus: "unsupported",
  };
  const head = new Uint8Array(await file.slice(0, HEAD_BYTES).arrayBuffer());
  const isPdf = String.fromCharCode(...head.subarray(0, 5)) === "%PDF-" || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > PDF_MAX_BYTES) return base;
    try {
      return { ...base, ...(await pdfPageMeta(await file.arrayBuffer())), metaStatus: "ok" };
    } catch {
      return base;
    }
  }

  let r: RasterHead | null = parsePngHead(head) ?? parseJpegHead(head);
  if (!r && /^image\//.test(file.type)) {
    const s = await bitmapSize(file);
    if (s) r = { ...s, dpi: null };
  }
  if (!r) return base;
  const dpi = r.dpi && r.dpi > 1 ? round(r.dpi, 0.01) : null;
  return {
    ...base,
    pixelWidth: r.width,
    pixelHeight: r.height,
    dpi,
    widthMm: dpi ? round((r.width / dpi) * 25.4, 0.1) : null,
    heightMm: dpi ? round((r.height / dpi) * 25.4, 0.1) : null,
    metaStatus: "ok",
  };
}
