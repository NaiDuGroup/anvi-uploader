import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import {
  MUG_SHEET_PDF_HEIGHT_PT,
  MUG_SHEET_PDF_WIDTH_PT,
  buildMugSheetsPdf,
  buildMugSheetsPdfFileName,
} from "./buildMugSheetsPdf";
import {
  dpiToPixelsPerMeter,
  injectPngPhysChunk,
} from "@/lib/notebook/pngPhysChunk";

// 1x1 white PNG.
const PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC",
  ),
  (c) => c.charCodeAt(0),
);

describe("buildMugSheetsPdf", () => {
  it("puts every sheet on its own A4 page", async () => {
    const bytes = await buildMugSheetsPdf([PNG, PNG, PNG]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(MUG_SHEET_PDF_WIDTH_PT, 1);
    expect(height).toBeCloseTo(MUG_SHEET_PDF_HEIGHT_PT, 1);
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
  });

  it("accepts sheets carrying the 300 DPI pHYs chunk", async () => {
    const ppm = dpiToPixelsPerMeter(300);
    const withDpi = injectPngPhysChunk(PNG, ppm, ppm);
    const doc = await PDFDocument.load(await buildMugSheetsPdf([withDpi]));
    expect(doc.getPageCount()).toBe(1);
  });

  it("rejects an empty list", async () => {
    await expect(buildMugSheetsPdf([])).rejects.toThrow();
  });
});

describe("buildMugSheetsPdfFileName", () => {
  const date = new Date(2026, 9, 27);
  it("lists every order and the page count", () => {
    expect(buildMugSheetsPdfFileName([2920, 2931, 2925, null], 2, date)).toBe(
      "mug-sheets_2920_2925_2931_2p_20261027.pdf",
    );
  });
  it("handles a single order and unknown orders", () => {
    expect(buildMugSheetsPdfFileName([2920], 1, date)).toBe(
      "mug-sheets_2920_1p_20261027.pdf",
    );
    expect(buildMugSheetsPdfFileName([null], 1, date)).toBe(
      "mug-sheets_1p_20261027.pdf",
    );
  });
});
