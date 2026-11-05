import { describe, expect, it } from "vitest";
import { EMPTY_LINE_LABELS, type ShopLineLabels } from "@/lib/storefront/lineLabels";
import { shopLineProductRef } from "./lineProduct";

const labels: ShopLineLabels = {
  ...EMPTY_LINE_LABELS,
  variants: { v1: { slug: "cana-alba", name: "Cană albă", option: null } },
};

describe("shopLineProductRef (server-side product / category of a line)", () => {
  it("catalog lines: slug from the quote's variant, category from the catalog", () => {
    expect(shopLineProductRef({ kind: "mug", productId: "v1", quantity: 1 }, labels, { "cana-alba": "cani" })).toEqual({
      slug: "cana-alba",
      category: "cani",
    });
  });

  it("non-catalog lines map to their section", () => {
    expect(shopLineProductRef({ kind: "businessCard", pricing: "shopPack", sides: "one", quantity: 100 }, labels, {})).toEqual({
      slug: "carti-de-vizita",
      category: "carti-de-vizita",
    });
    expect(shopLineProductRef({ kind: "uv", source: "stickers", technique: "transfer", quantity: 1, zones: [] }, labels, {})?.category).toBe(
      "tipografie",
    );
  });

  it("unknown variants and junk give null", () => {
    expect(shopLineProductRef({ kind: "mug", productId: "nope", quantity: 1 }, labels, {})).toBeNull();
    expect(shopLineProductRef(null, labels, {})).toBeNull();
    expect(shopLineProductRef("x", labels, {})).toBeNull();
  });
});
