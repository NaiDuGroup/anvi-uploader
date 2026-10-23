import { describe, it, expect } from "vitest";
import { normalizeLineName } from "./normalizeLineName";
import {
  classifyInvoiceUnit,
  InvoiceUnitKind,
  parseRollDimensions,
  rankStockTargets,
  suggestUnitsPerInvoiceUnit,
} from "./suggestMapping";
import { stockQuantityFromInvoice, StockTargetKind, type StockTargetOption } from "./types";

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
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.LfMaterial, VALRIDI_CANVAS, "buc")).toBe(30);
    expect(
      suggestUnitsPerInvoiceUnit(StockTargetKind.SheetPaper, "Hartie SRA3 300g 125 coli", "pac"),
    ).toBe(125);
    expect(
      suggestUnitsPerInvoiceUnit(StockTargetKind.Ink, "Cerneala Eco-Solvent Cyan 1L", "buc"),
    ).toBe(1000);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Ink, "Ink Magenta 440 ml", "buc")).toBe(440);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Mug, "Cana alba 330ml", "buc")).toBe(1);
  });

  it("converts rolls billed per m² into linear metres", () => {
    const factor: number = suggestUnitsPerInvoiceUnit(
      StockTargetKind.LfMaterial,
      "Kemica Digit (Folie Adeziva) 100mc white matt 1.05*50m (52,5 m2)",
      "M2",
    );
    expect(factor).toBe(0.9524);
    expect(stockQuantityFromInvoice(StockTargetKind.LfMaterial, 52.5, factor)).toBe(50);
    expect(
      stockQuantityFromInvoice(
        StockTargetKind.LfMaterial,
        80.025,
        suggestUnitsPerInvoiceUnit(
          StockTargetKind.LfMaterial,
          "Photo Paper SOL WB Prime Art 200g 1.067*75m (80.025 m2)",
          "m2",
        ),
      ),
    ).toBe(75);
  });

  it("keeps metres as is and reads piece count from sets", () => {
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.LfMaterial, "ORACAL MATT 1,27*50m", "m")).toBe(1);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Mug, "Cana alba set 6 buc", "set")).toBe(6);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Pen, "Pix albastru 50 buc", "buc")).toBe(1);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Ink, "Cerneala Cyan", "l")).toBe(1000);
  });
});

describe("classifyInvoiceUnit", () => {
  it("recognises e-Factura unit spellings", () => {
    expect(classifyInvoiceUnit("M2")).toBe(InvoiceUnitKind.Area);
    expect(classifyInvoiceUnit("m²")).toBe(InvoiceUnitKind.Area);
    expect(classifyInvoiceUnit("m")).toBe(InvoiceUnitKind.Length);
    expect(classifyInvoiceUnit("set")).toBe(InvoiceUnitKind.Pack);
    expect(classifyInvoiceUnit("buc.")).toBe(InvoiceUnitKind.Piece);
    expect(classifyInvoiceUnit(null)).toBe(InvoiceUnitKind.Piece);
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

describe("DTF purchase factors", () => {
  it("reads film roll length", () => {
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.DtfFilm, "Film DTF 0.33x100m", "buc")).toBe(100);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.DtfFilm, "Film DTF 33cm x 100m", "rola")).toBe(100);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.DtfFilm, "Film DTF", "m")).toBe(1);
  });

  it("converts powder to grams", () => {
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.DtfPowder, "Pudra DTF 1kg", "buc")).toBe(1000);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.DtfPowder, "Pudra DTF", "kg")).toBe(1000);
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.DtfPowder, "Pudra DTF 500g", "buc")).toBe(500);
  });

  it("counts garments as pieces", () => {
    expect(suggestUnitsPerInvoiceUnit(StockTargetKind.Garment, "Tricou DOGO alb M", "buc")).toBe(1);
    expect(stockQuantityFromInvoice(StockTargetKind.DtfPowder, 2, 1000)).toBe(2000);
  });
});
