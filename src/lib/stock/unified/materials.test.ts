import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  DEDICATED_CATEGORY_PAGES,
  dedicatedCategoryPage,
} from "./dedicatedCategoryPages";
import {
  lfMaterialStockAttributes,
  materialStockOf,
  ROLL_MEDIA_CATEGORY_CODE,
  SHEET_PAPER_CATEGORY_CODE,
  sheetPaperStockAttributes,
} from "./materials";

const d = (v: string) => new Prisma.Decimal(v);

describe("materialStockOf", () => {
  it("reads balance, average and hint from the variant", () => {
    expect(
      materialStockOf({ id: "v1", sku: "ROLL-1", stockQuantity: d("67.427"), avgCost: d("44.3176"), purchaseCost: d("0") }),
    ).toEqual({ variantId: "v1", sku: "ROLL-1", stock: 67.427, avgCost: 44.3176, purchaseCost: 0 });
  });

  it("treats a missing variant / hint as zero stock and zero hint, keeps a missing average null", () => {
    expect(materialStockOf(null)).toEqual({ variantId: null, sku: null, stock: 0, avgCost: null, purchaseCost: 0 });
    expect(
      materialStockOf({ id: "v", sku: "S", stockQuantity: d("0"), avgCost: null, purchaseCost: null }).purchaseCost,
    ).toBe(0);
  });
});

describe("stock item attributes", () => {
  it("roll: same keys as the migration", () => {
    expect(
      lfMaterialStockAttributes({ rollWidthMeters: d("1.27"), printableWidthMeters: null, rollLengthMeters: "50" }),
    ).toEqual({ rollWidthM: 1.27, printableWidthM: null, rollLengthM: 50 });
    expect(lfMaterialStockAttributes({ rollWidthMeters: "1.05" })).toEqual({ rollWidthM: 1.05 });
  });

  it("paper: same keys as the migration", () => {
    expect(sheetPaperStockAttributes({ sheetWidthCm: d("22.5"), sheetHeightCm: d("32"), gsm: 300 })).toEqual({
      sheetWidthCm: 22.5,
      sheetHeightCm: 32,
      gsm: 300,
    });
  });
});

describe("dedicated category pages", () => {
  it("rolls and papers keep their own screens", () => {
    expect(dedicatedCategoryPage(ROLL_MEDIA_CATEGORY_CODE)).toBe("/admin/large-format-materials");
    expect(dedicatedCategoryPage(SHEET_PAPER_CATEGORY_CODE)).toBe("/admin/sheet-papers");
    expect(Object.keys(DEDICATED_CATEGORY_PAGES)).toEqual(
      expect.arrayContaining(["mugs", "notebooks", "pens", "roll_media", "sheet_paper"]),
    );
    expect(dedicatedCategoryPage("socks")).toBeNull();
  });
});
