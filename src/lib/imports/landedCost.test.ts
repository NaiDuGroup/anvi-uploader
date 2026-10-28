import { describe, expect, it } from "vitest";
import { computeImportCosting, weightedUnitCost } from "./landedCost";
import { missingImportDocuments } from "./constants";
import { gorFactoryImageUrl, gorFactoryModelColor } from "./gorFactory";

describe("computeImportCosting", () => {
  it("spreads included costs over lines by amount; purchase share from payment + bank fee", () => {
    // Import 4457712-OG: 2 065,85 EUR; paid 42 102,02 + SEPA 70,78 + customs advance 12 500 + broker 1 200.
    const c = computeImportCosting(
      [
        { id: "ardak", quantity: 500, amount: 394.75 },
        { id: "rest", quantity: 1528, amount: 2065.85 - 394.75 },
      ],
      [
        { kind: "supplier_payment", amountMdl: 42102.02 },
        { kind: "bank_fee", amountMdl: 70.78 },
        { kind: "customs", amountMdl: 12500, isProvisional: true },
        { kind: "broker", amountMdl: 1200 },
      ],
    );
    expect(c.totalCostsMdl).toBe(55872.8);
    expect(c.purchaseCostsMdl).toBe(42172.8);
    expect(c.provisional).toBe(true);
    const ardak = c.lines.find((l) => l.id === "ardak")!;
    expect(ardak.landedUnitMdl).toBeCloseTo(21.35, 2);
    expect(ardak.purchaseUnitMdl).toBeCloseTo(16.12, 2);
    expect(c.lines.reduce((s, l) => s + l.landedTotalMdl, 0)).toBeCloseTo(55872.8, 1);
  });

  it("leaves excluded costs out (e.g. a freight line billed by mistake)", () => {
    const c = computeImportCosting(
      [{ id: "a", quantity: 10, amount: 100 }],
      [
        { kind: "supplier_payment", amountMdl: 2000 },
        { kind: "freight", amountMdl: 8000, excluded: true },
      ],
    );
    expect(c.totalCostsMdl).toBe(2000);
    expect(c.lines[0]!.landedUnitMdl).toBe(200);
    expect(c.provisional).toBe(false);
  });

  it("is zero without goods or costs", () => {
    const c = computeImportCosting([{ id: "a", quantity: 0, amount: 0 }], []);
    expect(c.lines[0]).toMatchObject({ landedUnitMdl: 0, landedTotalMdl: 0 });
  });
});

describe("weightedUnitCost", () => {
  it("weights by quantity across imports", () => {
    expect(weightedUnitCost([{ quantity: 500, unitCostMdl: 23.31 }, { quantity: 500, unitCostMdl: 21.35 }])).toBe(22.33);
    expect(weightedUnitCost([])).toBeNull();
  });
});

describe("missingImportDocuments", () => {
  it("needs a supplier document (proforma or invoice), declaration, broker invoice and payment", () => {
    expect(missingImportDocuments([])).toEqual(["supplier_document", "declaration", "broker_invoice", "payment"]);
    expect(missingImportDocuments(["invoice", "payment", "broker_invoice"])).toEqual(["declaration"]);
    expect(missingImportDocuments(["proforma", "declaration", "broker_invoice", "payment", "awb"])).toEqual([]);
  });
});

describe("Gor Factory photos", () => {
  it("Stamina codes drop the digit after «S»; ROLY codes drop the size", () => {
    expect(gorFactoryImageUrl("NB8091S102")).toBe("https://static.gorfactory.es/images/models/8091/model/large/8091_02_2_1.jpg");
    expect(gorFactoryImageUrl("NB2068S129")).toBe("https://static.gorfactory.es/images/models/2068/model/large/2068_29_2_1.jpg");
    expect(gorFactoryImageUrl("FT2051S1924")).toContain("2051_924_2_1.jpg");
    expect(gorFactoryModelColor("CA65020101")).toEqual({ model: "6502", color: "01" });
    expect(gorFactoryModelColor("CJ0325040555")).toEqual({ model: "0325", color: "0555" });
    expect(gorFactoryImageUrl("PROMO-1")).toBeNull();
  });
});
