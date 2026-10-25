import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import {
  otherPenProductSnapshot,
  parsePenProductSnapshot,
  penVariantToSnapshot,
  type PenVariantSnapshotSource,
} from "./penProductSnapshot";

/** Unified pen: «Ручки» item + its single variant (shape the order code loads). */
function penVariant(
  overrides: Partial<Omit<PenVariantSnapshotSource, "item">> = {},
  item: Partial<PenVariantSnapshotSource["item"]> = {},
): PenVariantSnapshotSource {
  return {
    sellPrice: new Prisma.Decimal("25.50"),
    dealerPrice: new Prisma.Decimal("20.00"),
    avgCost: null,
    purchaseCost: new Prisma.Decimal("12.0000"),
    ...overrides,
    item: {
      sku: "ARDENES_GREEN",
      nameRo: "Pix verde",
      nameRu: "Ручка зеленая",
      nameEn: "Green pen",
      imageUrl: "catalog/pens/ardenes-green.png",
      attributes: {
        bodyColorHex: "#1f3f1f",
        clipColorHex: "#c0c0c0",
        printWidthCm: 5,
        printHeightCm: 0.6,
        printDpi: 300,
        has3dPreview: false,
      },
      ...item,
    },
  };
}

describe("penVariantToSnapshot", () => {
  it("copies names, sku and print area from the item attributes", () => {
    expect(penVariantToSnapshot(penVariant())).toEqual({
      sku: "ARDENES_GREEN",
      nameRo: "Pix verde",
      nameRu: "Ручка зеленая",
      nameEn: "Green pen",
      imageUrl: "catalog/pens/ardenes-green.png",
      bodyColorHex: "#1f3f1f",
      clipColorHex: "#c0c0c0",
      printWidthCm: 5,
      printHeightCm: 0.6,
      printDpi: 300,
      has3dPreview: false,
      sellPrice: 25.5,
      dealerPrice: 20,
      purchaseCost: 12,
    });
  });

  it("freezes the weighted-average cost when the variant has one", () => {
    const snap = penVariantToSnapshot(penVariant({ avgCost: new Prisma.Decimal("4.0375") }));
    expect(snap.purchaseCost).toBe(4.04);
  });

  it("falls back to the purchase-cost hint, then null", () => {
    expect(penVariantToSnapshot(penVariant({ avgCost: null })).purchaseCost).toBe(12);
    expect(
      penVariantToSnapshot(penVariant({ avgCost: null, purchaseCost: null })).purchaseCost,
    ).toBeNull();
  });

  it("fills missing print attributes with the pen defaults", () => {
    const snap = penVariantToSnapshot(penVariant({}, { attributes: {} }));
    expect(snap.bodyColorHex).toBe("#1f1f1f");
    expect(snap.printWidthCm).toBe(4);
    expect(snap.printHeightCm).toBe(1.5);
    expect(snap.printDpi).toBe(300);
  });

  it("keeps a missing photo and prices as null", () => {
    const snap = penVariantToSnapshot(
      penVariant({ sellPrice: null, dealerPrice: null }, { imageUrl: null }),
    );
    expect(snap.imageUrl).toBeNull();
    expect(snap.sellPrice).toBeNull();
    expect(snap.dealerPrice).toBeNull();
  });
});

describe("parsePenProductSnapshot", () => {
  it("round-trips the photo key", () => {
    const snap = parsePenProductSnapshot(penVariantToSnapshot(penVariant()));
    expect(snap?.imageUrl).toBe("catalog/pens/ardenes-green.png");
  });

  it("accepts a legacy snapshot written before imageUrl existed", () => {
    const legacy = {
      sku: "ARDENES_BLACK",
      nameRo: "Pix negru",
      nameRu: "Ручка чёрная",
      nameEn: "Black pen",
      bodyColorHex: "#1f1f1f",
      clipColorHex: "#c0c0c0",
      printWidthCm: 4,
      printHeightCm: 1.5,
      printDpi: 300,
      has3dPreview: false,
    };
    const snap = parsePenProductSnapshot(legacy);
    expect(snap).not.toBeNull();
    expect(snap?.imageUrl).toBeNull();
    expect(snap?.sku).toBe("ARDENES_BLACK");
  });

  it("rejects a non-object value", () => {
    expect(parsePenProductSnapshot("nope")).toBeNull();
    expect(parsePenProductSnapshot(null)).toBeNull();
  });
});

describe("otherPenProductSnapshot", () => {
  it("has no photo", () => {
    expect(otherPenProductSnapshot().imageUrl).toBeNull();
  });
});
