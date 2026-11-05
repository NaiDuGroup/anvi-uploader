/**
 * TIFF → PDF image XObject, decoded in JS (browser + server safe).
 *
 * Wide-format clients send banner TIFFs of tens of megapixels — far beyond what
 * a Safari canvas can hold — so the pixels never go through canvas: the TIFF is
 * decoded with UTIF, reduced in place to 8-bit samples without alpha, deflated
 * and written as a raw `/Subtype /Image` stream. CMYK stays DeviceCMYK.
 *
 * Loaded lazily by {@link rollLayoutPdfCore.ts} only when a TIFF is met.
 */

import * as UTIF from "utif2";
import { zlibSync } from "fflate";
import { PDFHexString, PDFName, type PDFDocument, type PDFRef } from "pdf-lib";
import { isTiffBytes } from "./rollLayoutPdfCore";

export interface TiffPdfImage {
  ref: PDFRef;
  width: number;
  height: number;
}

type Ifd = UTIF.IFD;

const COMPRESSION_OK = new Set([
  1, // none
  5, // LZW
  6, // old-style JPEG
  7, // JPEG
  8, // Deflate (Adobe)
  32946, // Deflate (old)
  32773, // PackBits
]);

/** Photometric → number of colour samples before any extra (alpha / spot) samples. */
const PHOTOMETRIC_CHANNELS: Record<number, number> = {
  0: 1, // WhiteIsZero
  1: 1, // BlackIsZero
  2: 3, // RGB
  3: 1, // Palette
  5: 4, // Separated (CMYK)
  6: 3, // YCbCr (only with JPEG — decoded to RGB)
};

class TiffReadError extends Error {}

function fail(reason: string): never {
  throw new TiffReadError(reason);
}

function tag(ifd: Ifd, id: number): number[] | undefined {
  const v = ifd[`t${id}`];
  return Array.isArray(v) ? (v as number[]) : undefined;
}

function first(ifd: Ifd, id: number, fallback: number): number {
  const v = tag(ifd, id);
  return v && typeof v[0] === "number" ? v[0] : fallback;
}

/** UTIF copies a Uint8Array argument; hand it the underlying ArrayBuffer when that is the whole file. */
function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength && bytes.buffer instanceof ArrayBuffer) {
    return bytes.buffer;
  }
  return bytes.slice().buffer;
}

function isBigTiff(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2b && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2b)
  );
}

/** The full-resolution composite: first IFD that is not a reduced-size preview. */
function pickMainIfd(ifds: Ifd[]): Ifd {
  const images = ifds.filter((d) => tag(d, 256) && tag(d, 257));
  if (images.length === 0) fail("нет изображения в файле");
  return images.find((d) => (first(d, 254, 0) & 1) === 0) ?? images[0];
}

interface Layout {
  width: number;
  height: number;
  bps: number;
  spp: number;
  colorChannels: number;
  photometric: number;
  compression: number;
  /** Index of the transparency sample among the extra samples (−1 = none). */
  alphaIndex: number;
  associatedAlpha: boolean;
}

function validate(ifd: Ifd): Layout {
  const width = first(ifd, 256, 0);
  const height = first(ifd, 257, 0);
  if (width <= 0 || height <= 0) fail("неверный размер изображения");

  const compression = first(ifd, 259, 1);
  if (!COMPRESSION_OK.has(compression)) fail(`сжатие ${compression} не поддерживается`);

  const photometric = first(ifd, 262, -1);
  const colorChannels = PHOTOMETRIC_CHANNELS[photometric];
  if (colorChannels == null) {
    fail(photometric === 8 || photometric === 9 || photometric === 10 ? "Lab не поддерживается" : `цветовая модель ${photometric} не поддерживается`);
  }
  if (photometric === 5) {
    const inkSet = first(ifd, 332, 1);
    const inks = first(ifd, 334, 4);
    if (inkSet !== 1 || inks !== 4) fail("многоканальный (не CMYK) файл не поддерживается");
  }

  const spp = first(ifd, 277, 1);
  const bpsList = tag(ifd, 258) ?? [1];
  const bps = bpsList[0];
  if (bpsList.some((b) => b !== bps)) fail("разная глубина каналов не поддерживается");
  if (first(ifd, 339, 1) === 3) fail("32-битный (float) файл не поддерживается");
  if (![1, 2, 4, 8, 16].includes(bps)) fail(`${bps} бит на канал не поддерживается`);
  if (bps < 8 && !(spp === 1 && colorChannels === 1)) fail(`${bps} бит на канал не поддерживается`);
  if (spp < colorChannels) fail("не хватает цветовых каналов");
  if (spp > 1 && first(ifd, 284, 1) === 2) fail("раздельные плоскости каналов (planar) не поддерживаются — сохраните TIF с чередованием (interleaved)");
  if (first(ifd, 317, 1) === 3) fail("float-предиктор не поддерживается");

  const isJpeg = compression === 6 || compression === 7;
  if (photometric === 6 && !isJpeg) fail("YCbCr без JPEG-сжатия не поддерживается");
  if (isJpeg && !((photometric === 2 || photometric === 6) && spp === 3 && bps === 8)) {
    fail("JPEG-сжатие поддерживается только для RGB — сохраните TIF с LZW или ZIP");
  }

  // Extra samples: only "associated" (1) / "unassociated" (2) alpha mean transparency;
  // "unspecified" (0) are spare channels (Photoshop spot / saved selections) and are dropped.
  const extra = tag(ifd, 338) ?? [];
  let alphaIndex = -1;
  let associatedAlpha = false;
  for (let i = 0; i < extra.length && i < spp - colorChannels; i++) {
    if (extra[i] === 1 || extra[i] === 2) {
      alphaIndex = i;
      associatedAlpha = extra[i] === 1;
      break;
    }
  }
  if (photometric === 3 && (alphaIndex >= 0 || bps > 8)) fail("такая палитра не поддерживается");

  return { width, height, bps, spp, colorChannels, photometric, compression, alphaIndex, associatedAlpha };
}

/**
 * Reduce decoded samples in place to 8-bit colour channels only, compositing
 * transparency over paper white. Output never outgrows input, so writing at
 * `o ≤ i` over the same buffer is safe.
 */
function toPrintSamples(data: Uint8Array, l: Layout): Uint8Array {
  const pixels = l.width * l.height;
  const cc = l.colorChannels;
  const wide = l.bps === 16;
  const step = wide ? 2 : 1;
  const hi = wide ? 1 : 0; // UTIF normalises 16-bit samples to little endian.
  const inPx = l.spp * step;
  const alphaOff = l.alphaIndex >= 0 ? (cc + l.alphaIndex) * step + hi : -1;
  // CMYK paper = 0 ink; gray/RGB paper = 255 (WhiteIsZero gray is inverted by /Decode, paper = 0).
  const paper = l.photometric === 5 || l.photometric === 0 ? 0 : 255;

  if (!wide && alphaOff < 0 && l.spp === cc) return data.subarray(0, pixels * cc);

  let o = 0;
  for (let p = 0, i = 0; p < pixels; p++, i += inPx) {
    if (alphaOff < 0) {
      for (let c = 0; c < cc; c++) data[o++] = data[i + c * step + hi];
      continue;
    }
    const a = data[i + alphaOff];
    if (a === 255) {
      for (let c = 0; c < cc; c++) data[o++] = data[i + c * step + hi];
    } else if (l.associatedAlpha) {
      // Premultiplied: colour already scaled by alpha → add the paper share.
      const add = paper === 255 ? 255 - a : 0;
      for (let c = 0; c < cc; c++) {
        const v = data[i + c * step + hi] + add;
        data[o++] = v > 255 ? 255 : v;
      }
    } else {
      const inv = 255 - a;
      for (let c = 0; c < cc; c++) {
        data[o++] = ((data[i + c * step + hi] * a + paper * inv + 127) / 255) | 0;
      }
    }
  }
  return data.subarray(0, o);
}

function paletteColorSpace(ifd: Ifd, bps: number) {
  const map = tag(ifd, 320);
  const n = 1 << bps;
  if (!map || map.length < 3 * n) fail("нет палитры");
  let hex = "";
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < 3; c++) {
      hex += (map[c * n + i] >> 8).toString(16).padStart(2, "0");
    }
  }
  return [PDFName.of("Indexed"), PDFName.of("DeviceRGB"), n - 1, PDFHexString.of(hex)];
}

/**
 * Decode `bytes` and register it in `pdfDoc` as an image XObject. Throws a
 * readable Russian message naming the file when the TIFF cannot be used.
 */
export function embedTiffImage(pdfDoc: PDFDocument, bytes: Uint8Array, fileName: string): TiffPdfImage {
  try {
    if (isBigTiff(bytes)) fail("BigTIFF не поддерживается");
    if (!isTiffBytes(bytes)) fail("это не TIFF");
    const buffer = asArrayBuffer(bytes);
    const decodeIfds = UTIF.decode as unknown as (b: ArrayBuffer, prm: { parseMN: boolean; debug: boolean }) => Ifd[];
    const ifds = decodeIfds(buffer, { parseMN: false, debug: false });
    const ifd = pickMainIfd(ifds);
    const layout = validate(ifd);

    UTIF.decodeImage(buffer, ifd);
    const decoded = ifd.data;
    const rowBytes = Math.ceil((layout.width * layout.bps * layout.spp) / 8);
    if (!decoded || decoded.length < rowBytes * layout.height) fail("файл повреждён или обрезан");

    const samples = layout.bps < 8 ? decoded.subarray(0, rowBytes * layout.height) : toPrintSamples(decoded, layout);
    const compressed = zlibSync(samples, { level: 6 });
    // Let the decoded megapixels go before the next tile is read.
    (ifd as { data?: Uint8Array }).data = undefined;

    const colorSpace =
      layout.photometric === 3
        ? paletteColorSpace(ifd, layout.bps)
        : layout.colorChannels === 4
          ? "DeviceCMYK"
          : layout.colorChannels === 3
            ? "DeviceRGB"
            : "DeviceGray";

    const dict: Record<string, unknown> = {
      Type: "XObject",
      Subtype: "Image",
      Width: layout.width,
      Height: layout.height,
      BitsPerComponent: layout.bps < 8 ? layout.bps : 8,
      ColorSpace: colorSpace,
      Filter: "FlateDecode",
    };
    if (layout.photometric === 0) dict.Decode = [1, 0];

    const stream = pdfDoc.context.stream(compressed, dict as never);
    const ref = pdfDoc.context.register(stream);
    return { ref, width: layout.width, height: layout.height };
  } catch (err) {
    const reason =
      err instanceof TiffReadError
        ? err.message
        : err instanceof RangeError
          ? "не хватает памяти браузера или файл повреждён"
          : err instanceof Error && err.message
            ? err.message
            : "неизвестная ошибка";
    throw new Error(`Не удалось прочитать TIF: ${fileName} (${reason})`);
  }
}
