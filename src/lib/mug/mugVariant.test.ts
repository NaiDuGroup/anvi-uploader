import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  MUG_LEGACY_KIND,
  mugAttributesJson,
  parseMugAttributes,
  resolveMugVariantId,
} from "./mugVariant";

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
    { id: "v-white", category: "mugs" },
    { id: "v-sock", category: "socks" },
    { id: "v-nb", category: "notebooks" },
  ],
  [
    { legacyKind: MUG_LEGACY_KIND, legacyId: "old-white", variantIds: ["v-white"] },
    { legacyKind: "notebook", legacyId: "old-nb", variantIds: ["v-nb"] },
    { legacyKind: "pen", legacyId: "old-pen", variantIds: ["v-pen"] },
  ],
);

describe("resolveMugVariantId (legacy-id helper)", () => {
  it("keeps a mug variant id as is", async () => {
    expect(await resolveMugVariantId(db, "v-white")).toBe("v-white");
  });

  it("maps a legacy mug id to its variant", async () => {
    expect(await resolveMugVariantId(db, "old-white")).toBe("v-white");
  });

  it("refuses variants of other categories and other legacy kinds", async () => {
    expect(await resolveMugVariantId(db, "v-sock")).toBeNull();
    expect(await resolveMugVariantId(db, "v-nb")).toBeNull();
    expect(await resolveMugVariantId(db, "old-nb")).toBeNull();
    expect(await resolveMugVariantId(db, "old-pen")).toBeNull();
  });

  it("returns null for unknown or empty ids", async () => {
    expect(await resolveMugVariantId(db, "nope")).toBeNull();
    expect(await resolveMugVariantId(db, null)).toBeNull();
    expect(await resolveMugVariantId(db, "")).toBeNull();
  });
});


describe("parseMugAttributes", () => {
  it("reads the migrated attribute JSON (inner / rim may be null)", () => {
    expect(
      parseMugAttributes({
        printDpi: 300,
        rimColorHex: null,
        bodyColorHex: "#ffffff",
        has3dPreview: true,
        printWidthCm: 20.5,
        innerColorHex: "#d32f2f",
        printHeightCm: 9.5,
        handleColorHex: "#d32f2f",
      }),
    ).toEqual({
      bodyColorHex: "#ffffff",
      handleColorHex: "#d32f2f",
      innerColorHex: "#d32f2f",
      rimColorHex: null,
      printWidthCm: 20.5,
      printHeightCm: 9.5,
      printDpi: 300,
      has3dPreview: true,
      finish: "glossy",
      gradientColorHex: null,
      gradientHeightPct: 30,
      bodyHeightCm: 9.6,
      topDiameterCm: 8.2,
      bottomDiameterCm: 8.2,
      handleStyle: "classic",
    });
  });

  it("falls back to the legacy column defaults for missing or broken values", () => {
    expect(parseMugAttributes({ bodyColorHex: "white", rimColorHex: "#12", printWidthCm: 0, printDpi: "x" })).toEqual({
      bodyColorHex: "#f5f5f0",
      handleColorHex: "#a8a29e",
      innerColorHex: null,
      rimColorHex: null,
      printWidthCm: 21,
      printHeightCm: 9.6,
      printDpi: 300,
      has3dPreview: true,
      finish: "glossy",
      gradientColorHex: null,
      gradientHeightPct: 30,
      bodyHeightCm: 9.6,
      topDiameterCm: 8.2,
      bottomDiameterCm: 8.2,
      handleStyle: "classic",
    });
    expect(parseMugAttributes({ has3dPreview: false }).has3dPreview).toBe(false);
  });

  it("round-trips through the stored JSON with 2-decimal print sizes", () => {
    const json = mugAttributesJson({ ...parseMugAttributes({}), printWidthCm: 20.456, rimColorHex: "#000000" });
    expect(json.printWidthCm).toBe(20.46);
    expect(parseMugAttributes(json)).toMatchObject({ printWidthCm: 20.46, rimColorHex: "#000000", innerColorHex: null });
  });
});
