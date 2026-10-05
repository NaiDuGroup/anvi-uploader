import { describe, expect, it } from "vitest";
import type { PenProduct } from "@prisma/client";
import { Prisma } from "@prisma/client";
import {
  otherPenProductSnapshot,
  parsePenProductSnapshot,
  penProductToSnapshot,
} from "./penProductSnapshot";

function penRow(overrides: Partial<PenProduct> = {}): PenProduct {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    sku: "ARDENES_GREEN",
    nameRo: "Pix verde",
    nameRu: "Ручка зеленая",
    nameEn: "Green pen",
    stockQuantity: 10,
    sellPrice: new Prisma.Decimal("25.50"),
    dealerPrice: new Prisma.Decimal("20.00"),
    purchaseCost: new Prisma.Decimal("12.00"),
    imageUrl: "catalog/pens/ardenes-green.png",
    bodyColorHex: "#1f3f1f",
    clipColorHex: "#c0c0c0",
    printWidthCm: new Prisma.Decimal("4.0"),
    printHeightCm: new Prisma.Decimal("1.5"),
    printDpi: 300,
    has3dPreview: false,
    isActive: true,
    sortOrder: 0,
    internalNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdById: null,
    ...overrides,
  } as PenProduct;
}

describe("penProductToSnapshot", () => {
  it("freezes the catalog photo key so the order card can render it", () => {
    expect(penProductToSnapshot(penRow()).imageUrl).toBe(
      "catalog/pens/ardenes-green.png",
    );
  });

  it("keeps a missing photo as null", () => {
    expect(penProductToSnapshot(penRow({ imageUrl: null })).imageUrl).toBeNull();
  });
});

describe("parsePenProductSnapshot", () => {
  it("round-trips the photo key", () => {
    const snap = parsePenProductSnapshot(penProductToSnapshot(penRow()));
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
