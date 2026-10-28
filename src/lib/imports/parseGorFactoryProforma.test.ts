import { describe, expect, it } from "vitest";
import { parseGorFactoryProforma } from "./parseGorFactoryProforma";

/** Text lines as `pdfTextLines` returns them for a Gor Factory proforma (shortened). */
const LINES = [
  "PROFORMA INVOICE",
  "Date Order number",
  "15/10/26 402229536",
  "VAT Number Currency",
  "ALBA-IULIA NR.77 BL.5 AP.54",
  "MD0510012 EUR",
  "Based in the client request: 4457712-OG-2010-C",
  "Pieces : 1,036",
  "Product Code / Description Total Parcels Pieces Price Amount",
  "Made in: China Taric code: 69120025",
  "24.00 0.00 24.00 0.5950 14.28",
  "TZ1267S1226 MUG RADEK FERN GREEN",
  "MD4001S101226 MANGO SUBLIMATION MUG WHITE/FERN 12.00 0.00 12.00 1.0947 13.14",
  "GREEN",
  "GOR FACTORY, S.A., Registered in Murcia , Volume MU-1.697, Folio 159, Sheet MU-33.231. 1st Incorporation, date 17-08-00, VAT Nº: ESA-73.089.286. NB8091S102 NOTEBOOK ARDAK BLACK",
  "500.00 0.00 500.00 0.7895 394.75",
  "Carry Forward",
  "1,550.54",
  "NB8091S105 NOTEBOOK ARDAK ROYAL BLUE 500.00 0.00 500.00 0.7895 394.75",
  "FREIGHT: 0.00",
  "TOTAL AMOUNT",
  "816.92 EUR",
];

describe("parseGorFactoryProforma", () => {
  it("reads rows split over two lines, wrapped descriptions and the margin text", () => {
    const p = parseGorFactoryProforma(LINES);
    expect(p).toMatchObject({
      proformaNo: "402229536",
      supplierOrderNo: "4457712-OG",
      date: "2026-10-15",
      currency: "EUR",
      documentPieces: 1036,
      documentAmount: 816.92,
      freight: 0,
    });
    expect(p.lines.map((l) => [l.supplierCode, l.description, l.quantity, l.unitPrice, l.amount])).toEqual([
      ["TZ1267S1226", "MUG RADEK FERN GREEN", 24, 0.595, 14.28],
      ["MD4001S101226", "MANGO SUBLIMATION MUG WHITE/FERN GREEN", 12, 1.0947, 13.14],
      ["NB8091S102", "NOTEBOOK ARDAK BLACK", 500, 0.7895, 394.75],
      ["NB8091S105", "NOTEBOOK ARDAK ROYAL BLUE", 500, 0.7895, 394.75],
    ]);
    expect(p.warnings).toEqual([]);
  });

  it("reads codes with two letters after the model (BL1333TA49)", () => {
    const p = parseGorFactoryProforma(["BL1333TA49 BALL PEN PERET PINK 20.00 0.00 20.00 0.3105 6.21"]);
    expect(p.lines).toEqual([
      { supplierCode: "BL1333TA49", description: "BALL PEN PERET PINK", quantity: 20, unitPrice: 0.3105, amount: 6.21 },
    ]);
  });

  it("warns when totals do not match or nothing is read (e.g. a scanned invoice)", () => {
    expect(parseGorFactoryProforma(["Pieces : 10", "TOTAL AMOUNT", "100.00 EUR"]).warnings).toContain(
      "Не найдено ни одной строки товара",
    );
    const off = parseGorFactoryProforma([...LINES.slice(0, -1), "900.00 EUR"]);
    expect(off.warnings.some((w) => w.startsWith("Сумма строк 816.92"))).toBe(true);
  });
});
