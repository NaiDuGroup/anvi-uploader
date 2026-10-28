import { describe, expect, it } from "vitest";
import type { DtfGarmentJson } from "@/lib/dtf/dtfDto";
import { PEN, uuid } from "@/lib/uv/uvTestFixtures";
import type { UvStockItemJson } from "@/lib/uv/dto";
import { buildStockMenuEntries, rowMenuState, stockMenuCategories } from "./stockMenu";

const names = (ru: string) => ({ ro: ru, ru, en: ru });

const UV_MUG: UvStockItemJson = {
  ...PEN,
  id: uuid(20),
  itemId: uuid(21),
  categoryCode: "mugs",
  categoryNames: names("Кружки"),
  itemNames: names("Кружка AKEBIA"),
  imageUrl: "/akebia.png",
};
const SUBL_MUG: UvStockItemJson = { ...UV_MUG, id: uuid(30), itemId: uuid(31), itemNames: names("Кружка белая"), imageUrl: null };
const PILLOW: UvStockItemJson = { ...UV_MUG, id: uuid(40), categoryCode: "pillows", categoryNames: names("Подушки") };
const TEE: DtfGarmentJson = {
  id: `${uuid(50)}:black`,
  stockItemId: uuid(50),
  categoryCode: "tshirts",
  categoryNames: names("Одежда"),
  itemNames: names("Футболка"),
  kind: "tshirt",
  name: "Футболка",
  colorName: "black",
  colorHex: "#000000",
  imageUrl: "/tee.png",
  variants: [
    { id: uuid(51), size: "M", sortOrder: 0, stockQuantity: 3, unitCostMdl: 50, priceTiers: [{ minQty: 1, priceMdl: 150 }] },
    { id: uuid(52), size: "L", sortOrder: 1, stockQuantity: 2, unitCostMdl: 50, priceTiers: [{ minQty: 1, priceMdl: 160 }] },
  ],
};

describe("stock menu", () => {
  const entries = buildStockMenuEntries({ uv: [PEN, UV_MUG], sublimation: [SUBL_MUG, PILLOW], dtf: [TEE] });

  it("keeps one category together across print methods and tags each item with its method", () => {
    expect(entries.map((e) => [e.categoryCode, e.methods])).toEqual([
      ["mugs", ["sublimation_print"]],
      ["mugs", ["uv_print"]],
      ["pillows", ["sublimation_print"]],
      ["pens", ["uv_print"]],
      ["tshirts", ["dtf_apparel"]],
    ]);
    const tee = entries.find((e) => e.id === TEE.id)!;
    expect(tee).toMatchObject({ stockQuantity: 5, sku: "M · L", variantLabel: "black", priceTiers: [{ minQty: 1, priceMdl: 150 }] });
  });

  it("lists categories with counts and the first photo", () => {
    expect(stockMenuCategories(entries).map((c) => [c.code, c.count, c.imageUrl])).toEqual([
      ["mugs", 2, "/akebia.png"],
      ["pillows", 1, "/akebia.png"],
      ["pens", 1, null],
      ["tshirts", 1, "/tee.png"],
    ]);
  });

  it("merges a variant printable with UV and sublimation into one entry", () => {
    const both = buildStockMenuEntries({ uv: [UV_MUG], sublimation: [UV_MUG], dtf: [] });
    expect(both).toHaveLength(1);
    expect(both[0]!.methods).toEqual(["sublimation_print", "uv_print"]);
  });

  it("reads a row as a stock item, a client service or something else", () => {
    expect(rowMenuState({ productType: "uv_print", uv: { source: "stock", variantId: UV_MUG.id } }, entries)).toMatchObject({
      kind: "stock",
      method: "uv_print",
      entry: { id: UV_MUG.id },
    });
    expect(rowMenuState({ productType: "sublimation_print", sublimation: { source: "client", variantId: null } }, entries)).toEqual({
      kind: "client",
      method: "sublimation_print",
    });
    expect(rowMenuState({ productType: "dtf_apparel", dtf: { garmentSource: "stock", garmentProductId: TEE.id } }, entries)).toMatchObject({
      kind: "stock",
      method: "dtf_apparel",
    });
    expect(rowMenuState({ productType: "pen", designerVariantId: PEN.id }, entries)).toMatchObject({ kind: "stock", method: "uv_print" });
    expect(rowMenuState({ productType: "paper_print" }, entries)).toEqual({ kind: "other" });
  });
});
