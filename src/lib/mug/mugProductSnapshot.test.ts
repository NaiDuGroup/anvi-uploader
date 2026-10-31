import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { mugVariantToSnapshot, parseMugProductSnapshot } from "./mugProductSnapshot";

const VARIANT_ID = "6f1c1a52-6a0f-4f0b-9a55-2a3b4c5d6e7f";

function variant(over: { avgCost?: number | null; purchaseCost?: number | null; attributes?: unknown } = {}) {
  const dec = (n: number | null | undefined) => (n == null ? null : new Prisma.Decimal(n));
  return {
    id: VARIANT_ID,
    sellPrice: dec(150),
    avgCost: dec(over.avgCost === undefined ? 41.23456 : over.avgCost),
    purchaseCost: dec(over.purchaseCost === undefined ? 45 : over.purchaseCost),
    item: {
      sku: "MUG-RED-IN",
      nameRo: "Cană cu interior roșu",
      nameRu: "Кружка с красным нутром",
      nameEn: "Mug with red inside",
      imageUrl: "catalog/stock/mug-red.png",
      attributes:
        over.attributes ?? {
          bodyColorHex: "#ffffff",
          handleColorHex: "#d32f2f",
          innerColorHex: "#d32f2f",
          rimColorHex: null,
          printWidthCm: 20.5,
          printHeightCm: 9.5,
          printDpi: 300,
          has3dPreview: false,
        },
    },
  };
}

describe("mugVariantToSnapshot", () => {
  it("freezes the unified mug in the legacy snapshot shape (id = variant id)", () => {
    const snap = mugVariantToSnapshot(variant());
    expect(snap).toEqual({
      id: VARIANT_ID,
      sku: "MUG-RED-IN",
      nameRo: "Cană cu interior roșu",
      nameRu: "Кружка с красным нутром",
      nameEn: "Mug with red inside",
      imageUrl: "catalog/stock/mug-red.png",
      bodyColorHex: "#ffffff",
      handleColorHex: "#d32f2f",
      innerColorHex: "#d32f2f",
      rimColorHex: null,
      printWidthCm: 20.5,
      printHeightCm: 9.5,
      printDpi: 300,
      has3dPreview: false,
      finish: "glossy",
      gradientColorHex: null,
      gradientHeightPct: 30,
      sellPrice: 150,
      purchaseCost: 41.23,
    });
    // Readers (workshop, approvals, profit) parse it like an old snapshot.
    expect(parseMugProductSnapshot(snap)).toMatchObject({ id: VARIANT_ID, sku: "MUG-RED-IN", purchaseCost: 41.23 });
  });

  it("uses the purchase-cost hint until the first receipt sets an average", () => {
    expect(mugVariantToSnapshot(variant({ avgCost: null })).purchaseCost).toBe(45);
    expect(mugVariantToSnapshot(variant({ avgCost: null, purchaseCost: null })).purchaseCost).toBeNull();
  });

  it("falls back to the legacy defaults when attributes are missing", () => {
    expect(mugVariantToSnapshot(variant({ attributes: {} }))).toMatchObject({
      bodyColorHex: "#f5f5f0",
      handleColorHex: "#a8a29e",
      innerColorHex: null,
      printWidthCm: 21,
      printHeightCm: 9.6,
      has3dPreview: true,
    });
  });
});
