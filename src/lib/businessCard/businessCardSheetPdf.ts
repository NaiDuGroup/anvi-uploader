/**
 * Sheet-product imposition sheets (business cards, flyers, postcards) as ONE
 * print-ready PDF for the Ricoh: one page per printed side in print order
 * (front, back), each page exactly the physical sheet and filled edge to edge
 * by that side's 300 DPI raster. Duplex printing of the file gives the job.
 *
 * The PNG's compressed pixel data (IDAT) is copied into the PDF unchanged as a
 * FlateDecode image with the PNG predictor, so nothing is decoded, resampled or
 * re-compressed: the page holds bit-for-bit the pixels of the sheet PNG, and a
 * 300 DPI SRA3 sheet costs only its compressed size in memory.
 */

import sharp from "sharp";
import {
  PDFDocument,
  type PDFRef,
  concatTransformationMatrix,
  drawObject,
  popGraphicsState,
  pushGraphicsState,
} from "pdf-lib";
import { cmToPt } from "@/lib/largeFormat/rollLayoutPdfCore";

export interface BusinessCardSheetPdfPage {
  /** The sheet raster for one printed side (already turned for duplex if needed). */
  png: Buffer;
  /** Physical sheet size the raster covers. */
  widthCm: number;
  heightCm: number;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const SHEET_PDF_PNG_INVALID = "sheet_pdf_png_invalid";

interface ParsedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  interlace: number;
  /** Concatenated IDAT payload: one zlib stream of PNG-filtered scanlines. */
  idat: Buffer;
}

export function parsePng(png: Buffer): ParsedPng {
  if (png.length < 33 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(SHEET_PDF_PNG_INVALID);
  }
  let offset = 8;
  let header: Omit<ParsedPng, "idat"> | null = null;
  const idat: Buffer[] = [];
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset);
    const type = png.toString("latin1", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) throw new Error(SHEET_PDF_PNG_INVALID);
    if (type === "IHDR") {
      header = {
        width: png.readUInt32BE(dataStart),
        height: png.readUInt32BE(dataStart + 4),
        bitDepth: png[dataStart + 8]!,
        colorType: png[dataStart + 9]!,
        interlace: png[dataStart + 12]!,
      };
    } else if (type === "IDAT") {
      idat.push(png.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      break;
    }
    offset = dataEnd + 4; // skip CRC
  }
  if (!header || idat.length === 0) throw new Error(SHEET_PDF_PNG_INVALID);
  return { ...header, idat: Buffer.concat(idat) };
}

/** 8-bit, non-interlaced gray or RGB: the IDAT stream is valid PDF Flate + predictor data as-is. */
function isPassThrough(p: ParsedPng): boolean {
  return p.bitDepth === 8 && (p.colorType === 0 || p.colorType === 2) && p.interlace === 0;
}

/**
 * Sheets are flattened on white, so an alpha channel (or 16 bit / palette /
 * interlace) carries nothing visible; re-encode such a PNG once, losslessly, as
 * 8-bit RGB so it can be passed through.
 */
async function passThroughPng(png: Buffer): Promise<ParsedPng> {
  const parsed = parsePng(png);
  if (isPassThrough(parsed)) return parsed;
  const rgb = await sharp(png, { limitInputPixels: false })
    .flatten({ background: { r: 255, g: 255, b: 255 } })
    .toColourspace("srgb")
    .png({ palette: false, progressive: false, compressionLevel: 6 })
    .toBuffer();
  const reparsed = parsePng(rgb);
  if (reparsed.bitDepth === 16) {
    // libvips keeps 16 bit for 16-bit input; drop to 8 bit explicitly.
    return parsePng(
      await sharp(rgb, { limitInputPixels: false }).toColourspace("srgb").png({ palette: false }).toBuffer(),
    );
  }
  if (!isPassThrough(reparsed)) throw new Error(SHEET_PDF_PNG_INVALID);
  return reparsed;
}

function embedPngPassThrough(doc: PDFDocument, p: ParsedPng): PDFRef {
  const colors = p.colorType === 2 ? 3 : 1;
  const stream = doc.context.stream(p.idat, {
    Type: "XObject",
    Subtype: "Image",
    Width: p.width,
    Height: p.height,
    ColorSpace: colors === 3 ? "DeviceRGB" : "DeviceGray",
    BitsPerComponent: 8,
    Filter: "FlateDecode",
    DecodeParms: {
      Predictor: 15,
      Colors: colors,
      BitsPerComponent: 8,
      Columns: p.width,
    },
  });
  return doc.context.register(stream);
}

/**
 * One page per sheet side, in the given order. Each page's MediaBox is the
 * physical sheet, the raster stretched over the whole page (its pixel size is
 * the sheet at 300 DPI, so this is 1:1 up to sub-pixel rounding).
 */
export async function buildBusinessCardSheetPdf(
  pages: readonly BusinessCardSheetPdfPage[],
  meta?: { title?: string },
): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error("business_card_layout_no_sides");
  const doc = await PDFDocument.create();
  if (meta?.title) doc.setTitle(meta.title);
  doc.setProducer("anvi print");
  doc.setCreator("anvi print");

  for (const page of pages) {
    if (!(page.widthCm > 0) || !(page.heightCm > 0)) {
      throw new Error("business_card_layout_bad_sheet_size");
    }
    const parsed = await passThroughPng(page.png);
    const ref = embedPngPassThrough(doc, parsed);
    const widthPt = cmToPt(page.widthCm);
    const heightPt = cmToPt(page.heightCm);
    const pdfPage = doc.addPage([widthPt, heightPt]);
    const name = pdfPage.node.newXObject("Sheet", ref);
    pdfPage.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(widthPt, 0, 0, heightPt, 0, 0),
      drawObject(name),
      popGraphicsState(),
    );
    // The whole sheet is the finished print size (no extra margins).
    pdfPage.setTrimBox(0, 0, widthPt, heightPt);
  }

  return doc.save({ useObjectStreams: false });
}
