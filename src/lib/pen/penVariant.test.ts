import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import {
  PEN_LEGACY_KIND,
  parsePenAttributes,
  penAttributesJson,
  resolvePenVariantId,
} from "./penVariant";

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
    { id: "v-black", category: "pens" },
    { id: "v-sock", category: "socks" },
  ],
  [
    { legacyKind: PEN_LEGACY_KIND, legacyId: "old-black", variantIds: ["v-black"] },
    { legacyKind: "mug", legacyId: "old-mug", variantIds: ["v-mug"] },
  ],
);

describe("resolvePenVariantId (legacy-id helper)", () => {
  it("keeps a pen variant id as is", async () => {
    expect(await resolvePenVariantId(db, "v-black")).toBe("v-black");
  });

  it("maps a legacy pen id to its variant", async () => {
    expect(await resolvePenVariantId(db, "old-black")).toBe("v-black");
  });

  it("refuses variants of other categories and other legacy kinds", async () => {
    expect(await resolvePenVariantId(db, "v-sock")).toBeNull();
    expect(await resolvePenVariantId(db, "old-mug")).toBeNull();
  });

  it("returns null for unknown or empty ids", async () => {
    expect(await resolvePenVariantId(db, "nope")).toBeNull();
    expect(await resolvePenVariantId(db, null)).toBeNull();
    expect(await resolvePenVariantId(db, "")).toBeNull();
  });
});


describe("parsePenAttributes", () => {
  it("reads the migrated attribute JSON", () => {
    expect(
      parsePenAttributes({
        bodyColorHex: "#112233",
        clipColorHex: "#445566",
        printWidthCm: 5,
        printHeightCm: 0.6,
        printDpi: 600,
        has3dPreview: true,
      }),
    ).toEqual({
      bodyColorHex: "#112233",
      clipColorHex: "#445566",
      printWidthCm: 5,
      printHeightCm: 0.6,
      printDpi: 600,
      has3dPreview: true,
    });
  });

  it("falls back to defaults for missing or broken values", () => {
    expect(parsePenAttributes({ bodyColorHex: "red", printWidthCm: -1, printDpi: "x" })).toEqual({
      bodyColorHex: "#1f1f1f",
      clipColorHex: "#c0c0c0",
      printWidthCm: 4,
      printHeightCm: 1.5,
      printDpi: 300,
      has3dPreview: false,
    });
    expect(parsePenAttributes(null).printHeightCm).toBe(1.5);
  });

  it("round-trips through the stored JSON with 2-decimal print sizes", () => {
    const json = penAttributesJson({ ...parsePenAttributes({}), printWidthCm: 7.456 });
    expect(json.printWidthCm).toBe(7.46);
    expect(parsePenAttributes(json).printWidthCm).toBe(7.46);
  });
});
