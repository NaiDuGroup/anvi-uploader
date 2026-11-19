import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { PDFDocument } from "pdf-lib";
import type { GroupTilePackTile } from "./groupTilePack";
import { packTilesOnSheets, sheetsWithoutPooling, pieceFitsSheetAs } from "./lfSheetLayoutPack";
import { buildRollLayoutPdfBuffer, buildSheetLayoutPdfBuffer, cmToPt } from "./rollLayoutPdfCore";
import type { LfSheetSpec } from "./lfSheet";

const A1: LfSheetSpec = { sheetWidthCm: 61, sheetHeightCm: 86, marginMm: 5 };

function tiles(lineId: string, w: number, h: number, n: number): GroupTilePackTile[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${lineId}::${i + 1}`,
    label: `${lineId} (${i + 1}/${n})`,
    widthCm: w,
    heightCm: h,
    allowRotate: true,
  }));
}

function overlaps(a: { xCm: number; yCm: number; widthCm: number; heightCm: number }, b: typeof a): boolean {
  const e = 1e-6;
  return a.xCm < b.xCm + b.widthCm - e && b.xCm < a.xCm + a.widthCm - e && a.yCm < b.yCm + b.heightCm - e && b.yCm < a.yCm + a.heightCm - e;
}

function decodePdfStreams(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes);
  let out = "";
  let idx = 0;
  for (;;) {
    const sIdx = buf.indexOf("stream", idx, "latin1");
    if (sIdx === -1) break;
    let start = sIdx + "stream".length;
    if (buf[start] === 0x0d) start++;
    if (buf[start] === 0x0a) start++;
    const eIdx = buf.indexOf("endstream", start, "latin1");
    if (eIdx === -1) break;
    const chunk = buf.subarray(start, eIdx);
    try {
      out += zlib.inflateSync(chunk).toString("latin1") + "\n";
    } catch {
      out += chunk.toString("latin1") + "\n";
    }
    idx = eIdx + "endstream".length;
  }
  return out;
}

/** 1×1 red PNG */
const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("packTilesOnSheets", () => {
  it("puts 4 × A3 on one A1 sheet edge to edge, inside the margin", () => {
    const r = packTilesOnSheets(tiles("a3", 29.7, 42, 4), A1);
    expect(r.sheets).toHaveLength(1);
    expect(r.unplacedTileIds).toEqual([]);
    for (const p of r.sheets[0]!.placements) {
      expect(p.xCm).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(p.yCm).toBeGreaterThanOrEqual(0.5 - 1e-6);
      expect(p.xCm + p.widthCm).toBeLessThanOrEqual(60.5 + 1e-6);
      expect(p.yCm + p.heightCm).toBeLessThanOrEqual(85.5 + 1e-6);
    }
  });

  it("pools lines of different orders: 55×70 + 3 × A3 → 2 sheets, no overlaps", () => {
    const all = [...tiles("big", 55, 70, 1), ...tiles("a3", 29.7, 42, 3)];
    const r = packTilesOnSheets(all, A1);
    expect(r.sheets).toHaveLength(2);
    expect(r.sheets.flatMap((s) => s.placements)).toHaveLength(4);
    for (const s of r.sheets) {
      for (let i = 0; i < s.placements.length; i++) {
        for (let j = i + 1; j < s.placements.length; j++) {
          expect(overlaps(s.placements[i]!, s.placements[j]!)).toBe(false);
        }
      }
    }
  });

  it("shares a sheet between remainders of two lines (fewer sheets than one line per sheet)", () => {
    const all = [...tiles("l1", 29.7, 42, 2), ...tiles("l2", 29.7, 42, 2)];
    expect(packTilesOnSheets(all, A1).sheets).toHaveLength(1);
    expect(sheetsWithoutPooling(all, A1)).toBe(2);
  });

  it("never does worse than the single-line optimum (A4 × 16 on A1)", () => {
    // 2 × 4 standing + 2 × 2 lying would be the plain grid; packLfSheets finds 8 per sheet or more.
    const r = packTilesOnSheets(tiles("a4", 21, 29.7, 16), A1);
    expect(r.sheets.length).toBeLessThanOrEqual(2);
  });

  it("reports pieces larger than the sheet as unplaced", () => {
    const r = packTilesOnSheets([...tiles("huge", 70, 90, 1), ...tiles("a3", 29.7, 42, 1)], A1);
    expect(r.unplacedTileIds).toEqual(["huge::1"]);
    expect(r.sheets).toHaveLength(1);
  });

  it("respects a pinned orientation (allowRotate false)", () => {
    const r = packTilesOnSheets([{ id: "p::1", label: "p", widthCm: 42, heightCm: 29.7, allowRotate: false }], A1);
    expect(r.sheets[0]!.placements[0]).toMatchObject({ widthCm: 42, heightCm: 29.7, rotated: false });
    expect(pieceFitsSheetAs(70, 50, A1)).toBe(false);
    expect(pieceFitsSheetAs(50, 70, A1)).toBe(true);
  });
});

describe("buildSheetLayoutPdfBuffer", () => {
  it("one page per sheet, each exactly 61 × 86 cm, outline per piece as on a roll", async () => {
    const r = packTilesOnSheets([...tiles("big", 55, 70, 1), ...tiles("a3", 29.7, 42, 3)], A1);
    const bytes = await buildSheetLayoutPdfBuffer({
      sheetWidthCm: A1.sheetWidthCm,
      sheetHeightCm: A1.sheetHeightCm,
      sheets: r.sheets.map((s) => s.placements),
      getAsset: async (tileId) => ({ tileId, fileName: "a.png", buffer: new Uint8Array(TINY_PNG) }),
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect(width).toBeCloseTo(cmToPt(61), 3);
      expect(height).toBeCloseTo(cmToPt(86), 3);
    }
    const content = decodePdfStreams(bytes);
    // pdf-lib's drawRectangle: «… re» + stroke; one outline per piece with the roll hairline (0.5 pt black).
    const outlines = content.match(/0 0 0 RG\s+0\.5 w/g) ?? [];
    expect(outlines.length).toBe(4);
  });

  it("draws the same outline operators as the roll layout PDF", async () => {
    const placement = { tileId: "x::1", label: "x", xCm: 0.5, yCm: 0.5, widthCm: 29.7, heightCm: 42, rotated: false };
    const getAsset = async (tileId: string) => ({ tileId, fileName: "a.png", buffer: new Uint8Array(TINY_PNG) });
    const roll = decodePdfStreams(await buildRollLayoutPdfBuffer({ printableWidthCm: 61, totalAlongCm: 86, placements: [placement], getAsset }));
    const sheet = decodePdfStreams(
      await buildSheetLayoutPdfBuffer({ sheetWidthCm: 61, sheetHeightCm: 86, sheets: [[placement]], getAsset }),
    );
    const outline = (s: string) => s.slice(s.indexOf("RG"));
    expect(outline(sheet)).toBe(outline(roll));
  });
});
