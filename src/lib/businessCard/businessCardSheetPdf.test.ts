import { PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, type PDFPage } from "pdf-lib";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cmToPx } from "@/lib/printDimensions";
import { computeBusinessCardSheetLayout } from "./businessCardSheetLayout";
import { BUSINESS_CARD_SHEET_DPI, buildBusinessCardSheetPngs } from "./businessCardSheetPng";
import { buildBusinessCardSheetPdf, parsePng, SHEET_PDF_PNG_INVALID } from "./businessCardSheetPdf";

const PT_TO_MM = 25.4 / 72;

/** A4+ flyer sheet, 22.5 × 32 cm, four A6 flyers. */
const layout = computeBusinessCardSheetLayout({
  sheetWidthCm: 22.5,
  sheetHeightCm: 32,
  cardWidthCm: 10.7,
  cardHeightCm: 15.2,
});

function artwork(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: cmToPx(10.7, BUSINESS_CARD_SHEET_DPI),
      height: cmToPx(15.2, BUSINESS_CARD_SHEET_DPI),
      channels: 3,
      background: color,
    },
  })
    .png()
    .toBuffer();
}

function sheetImage(page: PDFPage): PDFRawStream {
  const xobjects = page.node.Resources()!.lookup(PDFName.of("XObject"), PDFDict);
  const keys = xobjects.keys();
  expect(keys).toHaveLength(1);
  const image = xobjects.lookup(keys[0]!);
  expect(image).toBeInstanceOf(PDFRawStream);
  return image as PDFRawStream;
}

function num(dict: PDFDict, key: string): number {
  return dict.lookup(PDFName.of(key), PDFNumber).asNumber();
}

describe("buildBusinessCardSheetPdf", { timeout: 60_000 }, () => {
  it("two-sided A4+ line → 2 pages, 225 × 320 mm each, front then back, PNG pixels passed through", async () => {
    const [front, back] = await buildBusinessCardSheetPngs({
      layout,
      sides: [
        { label: "front", fileName: "a.png", buffer: await artwork({ r: 255, g: 0, b: 0 }) },
        { label: "back", fileName: "b.png", buffer: await artwork({ r: 0, g: 0, b: 255 }), rotateDeg: 180 },
      ],
    });
    const bytes = await buildBusinessCardSheetPdf([
      { png: front!.png, widthCm: 22.5, heightCm: 32 },
      { png: back!.png, widthCm: 22.5, heightCm: 32 },
    ]);
    const doc = await PDFDocument.load(bytes);
    const pages = doc.getPages();
    expect(pages).toHaveLength(2);

    for (const [i, page] of pages.entries()) {
      const { width, height } = page.getSize();
      expect(width * PT_TO_MM).toBeCloseTo(225, 3);
      expect(height * PT_TO_MM).toBeCloseTo(320, 3);
      expect(page.getRotation().angle).toBe(0);

      const image = sheetImage(page);
      const source = parsePng([front!.png, back!.png][i]!);
      expect(num(image.dict, "Width")).toBe(cmToPx(22.5, BUSINESS_CARD_SHEET_DPI));
      expect(num(image.dict, "Height")).toBe(cmToPx(32, BUSINESS_CARD_SHEET_DPI));
      expect(image.dict.get(PDFName.of("Filter"))).toBe(PDFName.of("FlateDecode"));
      // Lossless and in order: the page carries exactly that side's PNG pixel stream.
      expect(Buffer.from(image.contents).equals(source.idat)).toBe(true);
    }
  });

  it("single-sided line → one page", async () => {
    const [front] = await buildBusinessCardSheetPngs({
      layout,
      sides: [{ label: "front", fileName: "a.png", buffer: await artwork({ r: 0, g: 128, b: 0 }) }],
    });
    const doc = await PDFDocument.load(await buildBusinessCardSheetPdf([{ png: front!.png, widthCm: 22.5, heightCm: 32 }]));
    expect(doc.getPageCount()).toBe(1);
  });

  it("A3+ postcard sheet → 320 × 450 mm page", async () => {
    const png = await sharp({ create: { width: 378, height: 531, channels: 3, background: "#fff" } }).png().toBuffer();
    const doc = await PDFDocument.load(await buildBusinessCardSheetPdf([{ png, widthCm: 32, heightCm: 45 }]));
    const { width, height } = doc.getPage(0).getSize();
    expect(width * PT_TO_MM).toBeCloseTo(320, 3);
    expect(height * PT_TO_MM).toBeCloseTo(450, 3);
  });

  it("re-encodes an RGBA PNG as RGB without changing the pixels", async () => {
    const rgba = await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } })
      .png()
      .toBuffer();
    expect(parsePng(rgba).colorType).toBe(6);
    const doc = await PDFDocument.load(await buildBusinessCardSheetPdf([{ png: rgba, widthCm: 10, heightCm: 7.5 }]));
    const image = sheetImage(doc.getPage(0));
    expect(image.dict.get(PDFName.of("ColorSpace"))).toBe(PDFName.of("DeviceRGB"));
    expect(num(image.dict, "Width")).toBe(40);
  });

  it("rejects bytes that are not a PNG", async () => {
    await expect(buildBusinessCardSheetPdf([{ png: Buffer.from("nope"), widthCm: 1, heightCm: 1 }])).rejects.toThrow(
      SHEET_PDF_PNG_INVALID,
    );
  });
});
