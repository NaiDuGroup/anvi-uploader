import { describe, expect, it } from "vitest";
import { NOTEBOOK_LOOK_DEFAULTS } from "./notebookLook";
import { Prisma } from "@prisma/client";
import {
  notebookVariantToSnapshot,
  parseNotebookProductSnapshot,
  type NotebookVariantSnapshotSource,
} from "./notebookProductSnapshot";

const VARIANT_ID = "48de6fb5-1c55-4b27-84f9-f1b9761817b6";

/** Unified notebook: «Блокноты» item + its single variant (shape the order code loads). */
function notebookVariant(
  overrides: Partial<Omit<NotebookVariantSnapshotSource, "item">> = {},
  item: Partial<NotebookVariantSnapshotSource["item"]> = {},
): NotebookVariantSnapshotSource {
  return {
    id: VARIANT_ID,
    sellPrice: new Prisma.Decimal("120.00"),
    avgCost: null,
    purchaseCost: new Prisma.Decimal("45.0000"),
    ...overrides,
    item: {
      sku: "S3-KBL-A5",
      nameRo: "Caiet A5 roșu",
      nameRu: "Блокнот A5 красный",
      nameEn: "Red A5 notebook",
      imageUrl: "catalog/notebooks/red.png",
      attributes: {
        printDpi: 300,
        paperKind: "dated",
        has3dPreview: true,
        printWidthCm: 14.5,
        coverColorHex: "#b63935",
        printHeightCm: 21,
        strapColorHex: "#9e211b",
        bookmarkColorHex: "#b63a35",
      },
      ...item,
    },
  };
}

describe("notebookVariantToSnapshot", () => {
  it("builds the legacy snapshot shape from the variant + item attributes", () => {
    expect(notebookVariantToSnapshot(notebookVariant())).toEqual({
      id: VARIANT_ID,
      sku: "S3-KBL-A5",
      nameRo: "Caiet A5 roșu",
      nameRu: "Блокнот A5 красный",
      nameEn: "Red A5 notebook",
      imageUrl: "catalog/notebooks/red.png",
      coverColorHex: "#b63935",
      strapColorHex: "#9e211b",
      bookmarkColorHex: "#b63a35",
      paperKind: "dated",
      printWidthCm: 14.5,
      printHeightCm: 21,
      printDpi: 300,
      has3dPreview: true,
      // Classic A5 hardcover look for an item that never had one set.
      ...NOTEBOOK_LOOK_DEFAULTS,
      sellPrice: 120,
      purchaseCost: 45,
    });
  });

  it("freezes the weighted-average cost when the variant has one (avgCost ?? purchaseCost)", () => {
    const snap = notebookVariantToSnapshot(notebookVariant({ avgCost: new Prisma.Decimal("38.4567") }));
    expect(snap.purchaseCost).toBe(38.46);
    expect(notebookVariantToSnapshot(notebookVariant({ purchaseCost: null })).purchaseCost).toBeNull();
  });

  it("fills missing attributes with the legacy catalog defaults", () => {
    const snap = notebookVariantToSnapshot(notebookVariant({ sellPrice: null }, { attributes: {} }));
    expect(snap).toMatchObject({
      coverColorHex: "#1f1f1f",
      strapColorHex: "#1f1f1f",
      bookmarkColorHex: "#c0392b",
      paperKind: "ruled",
      printWidthCm: 14,
      printHeightCm: 21.4,
      printDpi: 300,
      has3dPreview: true,
      sellPrice: null,
    });
  });

  it("round-trips through the order snapshot reader", () => {
    const snap = notebookVariantToSnapshot(notebookVariant());
    expect(parseNotebookProductSnapshot(JSON.parse(JSON.stringify(snap)))).toEqual(snap);
  });
});
