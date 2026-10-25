import { describe, expect, it } from "vitest";
import {
  stockBulkReceiptSchema,
  stockCategoryCreateSchema,
  stockCategoryUpdateSchema,
  stockItemCreateSchema,
  stockMovementsQuerySchema,
  stockReceiveSchema,
  stockVariantInputSchema,
  stockWriteOffSchema,
} from "./schemas";

const UUID = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";

describe("category schemas", () => {
  it("accepts a valid category and rejects bad codes / units", () => {
    const ok = { code: "socks", kind: "product", nameRo: "Șosete", nameRu: "Носки", nameEn: "Socks", unit: "pcs" };
    expect(stockCategoryCreateSchema.parse(ok).code).toBe("socks");
    expect(stockCategoryCreateSchema.safeParse({ ...ok, code: "Socks!" }).success).toBe(false);
    expect(stockCategoryCreateSchema.safeParse({ ...ok, unit: "kg" }).success).toBe(false);
    expect(stockCategoryCreateSchema.safeParse({ ...ok, kind: "service" }).success).toBe(false);
  });

  it("does not let an update change the code", () => {
    expect(stockCategoryUpdateSchema.parse({ code: "x", isActive: false })).toEqual({ isActive: false });
  });
});

describe("item / variant schemas", () => {
  const variant = { sku: "SOCK-WHITE-M", options: { color: "white", colorHex: "#FFFFFF", size: "M" }, sellPrice: 45 };
  const item = { categoryId: UUID, sku: "SOCK", nameRo: "a", nameRu: "b", nameEn: "c", variants: [variant] };

  it("accepts an item with variants", () => {
    expect(stockItemCreateSchema.parse(item).variants).toHaveLength(1);
  });

  it("rejects duplicate variant SKUs within the request", () => {
    const res = stockItemCreateSchema.safeParse({ ...item, variants: [variant, { ...variant, sku: "sock-white-m" }] });
    expect(res.success).toBe(false);
  });

  it("requires at least one variant and a clean SKU", () => {
    expect(stockItemCreateSchema.safeParse({ ...item, variants: [] }).success).toBe(false);
    expect(stockItemCreateSchema.safeParse({ ...item, sku: "a b" }).success).toBe(false);
  });

  it("validates prices and colour hex", () => {
    expect(stockVariantInputSchema.safeParse({ ...variant, sellPrice: 1.234 }).success).toBe(false);
    expect(stockVariantInputSchema.safeParse({ ...variant, options: { colorHex: "red" } }).success).toBe(false);
    expect(stockVariantInputSchema.safeParse({ ...variant, reorderLevel: -1 }).success).toBe(false);
  });
});

describe("stock operation schemas", () => {
  it("coerces dates and requires positive quantities", () => {
    const r = stockReceiveSchema.parse({ quantity: 10, totalCostMdl: 250, purchasedAt: "2026-10-25T12:00:00Z" });
    expect(r.purchasedAt).toBeInstanceOf(Date);
    expect(stockReceiveSchema.safeParse({ quantity: 0, totalCostMdl: 1, purchasedAt: "2026-10-25" }).success).toBe(false);
    expect(stockWriteOffSchema.safeParse({ quantity: -2 }).success).toBe(false);
  });

  it("needs at least one bulk line with a uuid", () => {
    const base = { purchasedAt: "2026-10-25" };
    expect(stockBulkReceiptSchema.safeParse({ ...base, lines: [] }).success).toBe(false);
    expect(stockBulkReceiptSchema.safeParse({ ...base, lines: [{ variantId: "x", quantity: 1, totalCostMdl: 1 }] }).success).toBe(false);
    expect(stockBulkReceiptSchema.safeParse({ ...base, lines: [{ variantId: UUID, quantity: 1, totalCostMdl: 1 }] }).success).toBe(true);
  });

  it("defaults pagination", () => {
    expect(stockMovementsQuerySchema.parse({})).toEqual({ page: 1, pageSize: 50 });
    expect(stockMovementsQuerySchema.safeParse({ pageSize: "500" }).success).toBe(false);
  });
});

describe("DTF fields", () => {
  const category = { code: "tshirts", kind: "product", nameRo: "Tricouri", nameRu: "Майки", nameEn: "T-shirts", unit: "pcs" };
  const variant = { sku: "TS-WHITE-M" };

  it("accepts printMethods on categories and rejects unknown ones", () => {
    expect(stockCategoryCreateSchema.parse({ ...category, printMethods: ["dtf"] }).printMethods).toEqual(["dtf"]);
    expect(stockCategoryCreateSchema.safeParse({ ...category, printMethods: ["laser"] }).success).toBe(false);
    expect(stockCategoryUpdateSchema.parse({ printMethods: [] })).toEqual({ printMethods: [] });
  });

  it("validates variant priceTiers; null clears", () => {
    const tiers = [
      { minQty: 1, priceMdl: 280 },
      { minQty: 10, priceMdl: 240 },
    ];
    expect(stockVariantInputSchema.parse({ ...variant, priceTiers: tiers }).priceTiers).toEqual(tiers);
    expect(stockVariantInputSchema.parse({ ...variant, priceTiers: null }).priceTiers).toBeNull();
    expect(stockVariantInputSchema.safeParse({ ...variant, priceTiers: [{ minQty: 2, priceMdl: 5 }] }).success).toBe(false);
    expect(
      stockVariantInputSchema.safeParse({
        ...variant,
        priceTiers: [
          { minQty: 1, priceMdl: 5 },
          { minQty: 1, priceMdl: 4 },
        ],
      }).success,
    ).toBe(false);
  });

  it("accepts item-level default priceTiers on create", () => {
    const body = {
      categoryId: UUID,
      sku: "TS",
      nameRo: "T",
      nameRu: "T",
      nameEn: "T",
      priceTiers: [{ minQty: 1, priceMdl: 70 }],
      variants: [variant],
    };
    expect(stockItemCreateSchema.parse(body).priceTiers).toEqual([{ minQty: 1, priceMdl: 70 }]);
    expect(stockItemCreateSchema.safeParse({ ...body, priceTiers: [{ minQty: 0, priceMdl: 70 }] }).success).toBe(false);
  });
});
