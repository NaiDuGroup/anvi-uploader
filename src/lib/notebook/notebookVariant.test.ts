import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { NOTEBOOK_LOOK_DEFAULTS } from "./notebookLook";
import {
  NOTEBOOK_LEGACY_KIND,
  notebookAttributesJson,
  parseNotebookAttributes,
  resolveNotebookVariantId,
} from "./notebookVariant";

type FakeVariant = { id: string; category: string };
type FakeItem = { legacyKind: string; legacyId: string; variantIds: string[] };

/** Just enough of the Prisma client for the legacy-id helper. */
function fakeDb(variants: FakeVariant[], items: FakeItem[]): Prisma.TransactionClient {
  return {
    stockVariant: {
      findFirst: async ({ where }: { where: { id: string; item: { category: { code: string } } } }) => {
        const v = variants.find((x) => x.id === where.id && x.category === where.item.category.code);
        return v ? { id: v.id } : null;
      },
    },
    stockItem: {
      findUnique: async ({
        where,
      }: {
        where: { legacyKind_legacyId: { legacyKind: string; legacyId: string } };
      }) => {
        const k = where.legacyKind_legacyId;
        const it = items.find((x) => x.legacyKind === k.legacyKind && x.legacyId === k.legacyId);
        return it ? { variants: it.variantIds.slice(0, 1).map((id) => ({ id })) } : null;
      },
      findMany: async ({ where }: { where: { legacyKind: string; legacyId: { in: string[] } } }) =>
        items
          .filter((x) => x.legacyKind === where.legacyKind && where.legacyId.in.includes(x.legacyId))
          .map((x) => ({ legacyId: x.legacyId, variants: x.variantIds.slice(0, 1).map((id) => ({ id })) })),
    },
  } as unknown as Prisma.TransactionClient;
}

const db = fakeDb(
  [
    { id: "v-black", category: "notebooks" },
    { id: "v-sock", category: "socks" },
    { id: "v-pen", category: "pens" },
  ],
  [
    { legacyKind: NOTEBOOK_LEGACY_KIND, legacyId: "old-black", variantIds: ["v-black"] },
    { legacyKind: "mug", legacyId: "old-mug", variantIds: ["v-mug"] },
    { legacyKind: "pen", legacyId: "old-pen", variantIds: ["v-pen"] },
  ],
);

describe("resolveNotebookVariantId (legacy-id helper)", () => {
  it("keeps a notebook variant id as is", async () => {
    expect(await resolveNotebookVariantId(db, "v-black")).toBe("v-black");
  });

  it("maps a legacy notebook id to its variant", async () => {
    expect(await resolveNotebookVariantId(db, "old-black")).toBe("v-black");
  });

  it("refuses variants of other categories and other legacy kinds", async () => {
    expect(await resolveNotebookVariantId(db, "v-sock")).toBeNull();
    expect(await resolveNotebookVariantId(db, "old-mug")).toBeNull();
    expect(await resolveNotebookVariantId(db, "v-pen")).toBeNull();
    expect(await resolveNotebookVariantId(db, "old-pen")).toBeNull();
  });

  it("returns null for unknown or empty ids", async () => {
    expect(await resolveNotebookVariantId(db, "nope")).toBeNull();
    expect(await resolveNotebookVariantId(db, null)).toBeNull();
    expect(await resolveNotebookVariantId(db, "")).toBeNull();
  });
});


describe("parseNotebookAttributes", () => {
  it("reads the migrated attribute JSON", () => {
    expect(
      parseNotebookAttributes({
        printDpi: 300,
        paperKind: "squared",
        has3dPreview: true,
        printWidthCm: 14.5,
        coverColorHex: "#202020",
        printHeightCm: 21,
        strapColorHex: "#151515",
        bookmarkColorHex: "#1f1f1f",
      }),
    ).toEqual({
      coverColorHex: "#202020",
      strapColorHex: "#151515",
      bookmarkColorHex: "#1f1f1f",
      paperKind: "squared",
      printWidthCm: 14.5,
      printHeightCm: 21,
      printDpi: 300,
      has3dPreview: true,
      ...NOTEBOOK_LOOK_DEFAULTS,
    });
  });

  it("falls back to the legacy column defaults for missing or broken values", () => {
    expect(
      parseNotebookAttributes({ coverColorHex: "red", paperKind: "lined", printWidthCm: -1, printDpi: "x" }),
    ).toEqual({
      coverColorHex: "#1f1f1f",
      strapColorHex: "#1f1f1f",
      bookmarkColorHex: "#c0392b",
      paperKind: "ruled",
      printWidthCm: 14,
      printHeightCm: 21.4,
      printDpi: 300,
      has3dPreview: true,
      ...NOTEBOOK_LOOK_DEFAULTS,
    });
    expect(parseNotebookAttributes(null).has3dPreview).toBe(true);
    expect(parseNotebookAttributes({ has3dPreview: false }).has3dPreview).toBe(false);
  });

  it("round-trips through the stored JSON with 2-decimal print sizes", () => {
    const json = notebookAttributesJson({ ...parseNotebookAttributes({}), printWidthCm: 14.456 });
    expect(json.printWidthCm).toBe(14.46);
    expect(parseNotebookAttributes(json).printWidthCm).toBe(14.46);
  });
});
