import { describe, it, expect } from "vitest";
import { normalizeLineName } from "./normalizeLineName";
import {
  parseRollDimensions,
  rankStockTargets,
  suggestUnitsPerInvoiceUnit,
} from "./suggestMapping";
import { StockTargetKind, type StockTargetOption } from "./types";

const VALRIDI_CANVAS = '380g Eco-solvent Cotton Canvas Matte 1.07x30mx3" ';

describe("normalizeLineName", () => {
  it("is stable across cosmetic differences", () => {
    expect(normalizeLineName(VALRIDI_CANVAS)).toBe(
      normalizeLineName("380G  eco-solvent cotton canvas matte 1.07 x 30mx3"),
    );
  });
});

describe("parseRollDimensions", () => {
  it("reads width and length from supplier naming", () => {
    expect(parseRollDimensions(VALRIDI_CANVAS)).toEqual({ widthMeters: 1.07, lengthMeters: 30 });
    expect(parseRollDimensions("ORACAL MATT 1,27*50m")).toEqual({
      widthMeters: 1.27,
      lengthMeters: 50,
    });
    expect(parseRollDimensions("Matt A4 (216*303mm) 60 mic.")).toBeNull();
  });
});

describe("suggestUnitsPerInvoiceUnit", () => {
  it("uses roll length for media, pack size for paper, volume for ink", () => {
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.LfMaterial, VALRIDI_CANVAS)).toBe(30);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.SheetPaper, "Hartie SRA3 300g 125 coli")).toBe(125);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Ink, "Cerneala Eco-Solvent Cyan 1L")).toBe(1000);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Ink, "Ink Magenta 440 ml")).toBe(440);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Mug, "Cana alba 330ml")).toBe(1);
  });
});

describe("rankStockTargets", () => {
  const options: StockTargetOption[] = [
    { kind: StockTargetKind.LfMaterial, id: "banner", name: "BANNER MATT 1.37*50m", widthMeters: 1.37 },
    { kind: StockTargetKind.LfMaterial, id: "panza", name: "Panza din bumbac canvas 1.07*20m", widthMeters: 1.07 },
    { kind: StockTargetKind.LfMaterial, id: "oracal", name: "ORACAL MATT 1.05*50", widthMeters: 1.05 },
  ];

  it("ranks the matching width and shared words first", () => {
    const ranked = rankStockTargets(VALRIDI_CANVAS, options);
    expect(ranked[0]?.id).toBe("panza");
  });
});
