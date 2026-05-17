/**
 * Returns PDF page count when `file` is a PDF; otherwise `undefined`.
 */
export async function getPdfPageCount(file: File): Promise<number | undefined> {
  if (file.type !== "application/pdf") return undefined;
  try {
    const { PDFDocument } = await import("pdf-lib");
    const buf = await file.arrayBuffer();
    const doc = await PDFDocument.load(buf, { ignoreEncryption: true });
    return doc.getPageCount();
  } catch {
    return undefined;
  }
}
