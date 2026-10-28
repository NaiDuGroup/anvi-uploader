import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsPromise: Promise<PdfJs> | null = null;

/**
 * Node build of pdf.js with its worker on the main thread. Loaded at runtime
 * from node_modules (`webpackIgnore`): bundled by webpack, the worker module
 * fails to initialise. `next.config.ts` traces these files for the import routes.
 */
function loadPdfJs(): Promise<PdfJs> {
  pdfJsPromise ??= (async () => {
    const g = globalThis as Record<string, unknown>;
    g.DOMMatrix ??= DOMMatrix;
    g.ImageData ??= ImageData;
    g.Path2D ??= Path2D;
    const worker: unknown = await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.worker.mjs");
    (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = worker;
    return (await import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs")) as PdfJs;
  })();
  return pdfJsPromise;
}

/** Y tolerance (pt) for text pieces on the same visual line. */
const LINE_TOLERANCE_PT = 2.5;

/**
 * Text of a PDF as visual lines (top to bottom, left to right), page by page.
 * Pieces whose baselines are within {@link LINE_TOLERANCE_PT} share a line, so
 * a table row reads «CODE DESCRIPTION 24.00 0.00 24.00 0.5950 14.28».
 */
export async function pdfTextLines(buffer: Buffer | Uint8Array): Promise<string[]> {
  const pdfjs = await loadPdfJs();
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    verbosity: 0,
  }).promise;
  try {
    const out: string[] = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const pieces: { x: number; y: number; s: string }[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        pieces.push({ x: item.transform[4], y: item.transform[5], s: item.str.trim() });
      }
      pieces.sort((a, b) => b.y - a.y || a.x - b.x);
      const lines: { y: number; parts: { x: number; s: string }[] }[] = [];
      for (const piece of pieces) {
        const line = lines.find((l) => Math.abs(l.y - piece.y) <= LINE_TOLERANCE_PT);
        if (line) line.parts.push({ x: piece.x, s: piece.s });
        else lines.push({ y: piece.y, parts: [{ x: piece.x, s: piece.s }] });
      }
      lines.sort((a, b) => b.y - a.y);
      for (const l of lines) {
        out.push(
          l.parts
            .sort((a, b) => a.x - b.x)
            .map((x) => x.s)
            .join(" ")
            .replace(/\s+/g, " ")
            .trim(),
        );
      }
    }
    return out;
  } finally {
    await doc.destroy();
  }
}
