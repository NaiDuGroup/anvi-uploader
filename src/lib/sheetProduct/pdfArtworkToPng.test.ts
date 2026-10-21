import { PDFDocument, rgb } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  SHEET_ARTWORK_PDF_UNREADABLE,
  isPdfArtwork,
  pdfArtworkToPng,
} from "./pdfArtworkToPng";

const PT_PER_CM = 72 / 2.54;

/** 15 × 7 cm page filled red. */
async function redFlyerPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([15 * PT_PER_CM, 7 * PT_PER_CM]);
  page.drawRectangle({
    x: 0,
    y: 0,
    width: page.getWidth(),
    height: page.getHeight(),
    color: rgb(1, 0, 0),
  });
  return Buffer.from(await doc.save());
}

describe("pdfArtworkToPng", () => {
  it("renders the first page at 300 DPI", async () => {
    const pdf = await redFlyerPdf();
    expect(isPdfArtwork(pdf)).toBe(true);

    const png = await pdfArtworkToPng(pdf, 300);
    const { data, info } = await sharp(png)
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(1772);
    expect(info.height).toBe(827);
    const i = (Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)) * info.channels;
    expect([data[i], data[i + 1], data[i + 2]]).toEqual([255, 0, 0]);
  });

  it("reports a broken PDF with a stable code", async () => {
    await expect(
      pdfArtworkToPng(Buffer.from("%PDF-1.7 not really a pdf"), 300),
    ).rejects.toThrow(SHEET_ARTWORK_PDF_UNREADABLE);
  });
});
