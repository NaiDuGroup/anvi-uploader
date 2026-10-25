import { describe, expect, it } from "vitest";
import type { Prisma } from "@prisma/client";
import { designProductBinding, withDesignProducts } from "./designProduct";

type FakeVariant = {
  id: string;
  category: string;
  legacyKind: string | null;
  legacyId: string | null;
  sku: string;
  attributes: Record<string, unknown>;
};

// `legacyKind` / `legacyId` stay on migrated items (old URLs and payloads resolve through them);
// the design binding itself only uses the variant.

const VARIANTS: FakeVariant[] = [
  {
    id: "v-mug",
    category: "mugs",
    legacyKind: "mug",
    legacyId: "old-mug",
    sku: "MUG-W",
    attributes: { bodyColorHex: "#fafafa" },
  },
  { id: "v-mug-new", category: "mugs", legacyKind: null, legacyId: null, sku: "MUG-NEW", attributes: {} },
  {
    id: "v-nb",
    category: "notebooks",
    legacyKind: "notebook",
    legacyId: "old-nb",
    sku: "NB-1",
    attributes: { coverColorHex: "#202020" },
  },
];

/** Just enough of the Prisma client for the design binding helpers. */
function fakeDb(): Prisma.TransactionClient {
  const asRow = (v: FakeVariant) => ({
    id: v.id,
    item: {
      sku: v.sku,
      nameRu: `name ${v.sku}`,
      imageUrl: null,
      attributes: v.attributes,
      legacyKind: v.legacyKind,
      legacyId: v.legacyId,
      category: { code: v.category },
    },
  });
  return {
    stockVariant: {
      findFirst: async ({ where }: { where: { id: string; item: { category: { code: string } } } }) => {
        const v = VARIANTS.find((x) => x.id === where.id && x.category === where.item.category.code);
        return v ? asRow(v) : null;
      },
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        VARIANTS.filter((v) => where.id.in.includes(v.id)).map(asRow),
    },
    stockItem: {
      findMany: async ({ where }: { where: { legacyKind: string; legacyId: { in: string[] } } }) =>
        VARIANTS.filter((v) => v.legacyKind === where.legacyKind && where.legacyId.in.includes(v.legacyId ?? "")).map(
          (v) => ({ legacyId: v.legacyId, variants: [{ id: v.id }] }),
        ),
    },
  } as unknown as Prisma.TransactionClient;
}

describe("designProductBinding (write)", () => {
  it("stores the variant id of the kind's category", async () => {
    expect(await designProductBinding(fakeDb(), "mug", "v-mug")).toEqual({ stockVariantId: "v-mug" });
    expect(await designProductBinding(fakeDb(), "mug", "v-mug-new")).toEqual({ stockVariantId: "v-mug-new" });
    expect(await designProductBinding(fakeDb(), "notebook", "v-nb")).toEqual({ stockVariantId: "v-nb" });
  });

  it("binds nothing for a variant of another category", async () => {
    expect((await designProductBinding(fakeDb(), "notebook", "v-mug")).stockVariantId).toBeNull();
  });
});

describe("design binding (read)", () => {
  it("returns variant ids and product info for mug, notebook and unbound designs", async () => {
    const rows = await withDesignProducts(fakeDb(), [
      { id: "d1", targetType: "mug", stockVariantId: "v-mug" },
      { id: "d2", targetType: "mug", stockVariantId: "v-mug-new" },
      { id: "d3", targetType: "notebook", stockVariantId: "v-nb" },
      { id: "d4", targetType: "custom", stockVariantId: null },
      // A variant of another category is not shown as the design's product.
      { id: "d5", targetType: "notebook", stockVariantId: "v-mug" },
    ]);
    expect(rows.map((r) => [r.id, r.stockVariantId, r.mugProductId, r.notebookProductId])).toEqual([
      ["d1", "v-mug", "v-mug", null],
      ["d2", "v-mug-new", "v-mug-new", null],
      ["d3", "v-nb", null, "v-nb"],
      ["d4", null, null, null],
      ["d5", "v-mug", null, null],
    ]);
    expect(rows[0]!.mugProduct).toEqual({ sku: "MUG-W", nameRu: "name MUG-W", imageUrl: null, bodyColorHex: "#fafafa" });
    expect(rows[2]!.notebookProduct).toMatchObject({ sku: "NB-1", coverColorHex: "#202020" });
    expect(rows[3]!.mugProduct).toBeNull();
  });
});
