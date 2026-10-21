/**
 * Rasterises PDF artwork for the sheet-product layouts (business cards,
 * flyers), which are built as PNG. Only the first page is used: each printed
 * side arrives as its own file. The page box becomes the image, so a PDF made
 * at trim + bleed stays trim + bleed and one made at the trim size still gets
 * its bleed generated afterwards.
 */

import { DOMMatrix, ImageData, Path2D, createCanvas } from "@napi-rs/canvas";

export const SHEET_ARTWORK_PDF_UNREADABLE = "sheet_artwork_pdf_unreadable";

const PT_PER_INCH = 72;
/** Larger pages are not card or flyer artwork; refuse instead of exhausting memory. */
const MAX_SIDE_PX = 12_000;

export function isPdfArtwork(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 && // F
    bytes[4] === 0x2d // -
  );
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsPromise: Promise<PdfJs> | null = null;

/**
 * Node build of pdf.js with its worker on the main thread (no worker files to
 * ship). pdf.js expects the browser's geometry and image globals; the native
 * canvas provides them.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= (async () => {
    const g = globalThis as Record<string, unknown>;
    g.DOMMatrix ??= DOMMatrix;
    g.ImageData ??= ImageData;
    g.Path2D ??= Path2D;
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return import("pdfjs-dist/legacy/build/pdf.mjs");
  })();
  return pdfJsPromise;
}

export async function pdfArtworkToPng(buffer: Buffer, dpi: number): Promise<Buffer> {
  const pdfjs = await loadPdfJs();
  let doc: Awaited<ReturnType<PdfJs["getDocument"]>["promise"]> | null = null;
  try {
    doc = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: false,
      disableFontFace: true,
    }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: dpi / PT_PER_INCH });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    if (width <= 0 || height <= 0 || width > MAX_SIDE_PX || height > MAX_SIDE_PX) {
      throw new Error("PDF page size out of range");
    }

    const canvas = createCanvas(width, height);
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: context as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    return canvas.toBuffer("image/png");
  } catch (error) {
    console.error("pdfArtworkToPng:", error);
    throw new Error(SHEET_ARTWORK_PDF_UNREADABLE);
  } finally {
    await doc?.destroy();
  }
}
