import { PDFDocument } from "pdf-lib";

const MM_PER_PT = 25.4 / 72;

function round01(n: number): number {
  return Number((Math.round(n * 10) / 10).toFixed(1));
}

/** First page size in mm (trim box, page rotation applied) and page count. Browser + server. */
export async function pdfPageMeta(
  bytes: Uint8Array | ArrayBuffer,
): Promise<{ widthMm: number; heightMm: number; pageCount: number }> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const page = doc.getPage(0);
  const box = page.getTrimBox();
  const turned = Math.abs(page.getRotation().angle) % 180 === 90;
  return {
    widthMm: round01((turned ? box.height : box.width) * MM_PER_PT),
    heightMm: round01((turned ? box.width : box.height) * MM_PER_PT),
    pageCount: doc.getPageCount(),
  };
}
