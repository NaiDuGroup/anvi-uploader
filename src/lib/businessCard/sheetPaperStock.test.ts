/**
 * Price identity of the stage-4 switch for sheet products: paper priced from
 * its unified stock variant equals the legacy columns (average > 0, else the
 * catalog hint), because the migration copied them into the variant.
 */
import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { applyBusinessCardMinimumLineTotal, computeBusinessCardLinePricing } from "./businessCardLinePricing";
import { toSheetPaperPricing, type SheetPaperRow } from "./sheetPaperStock";
import { sheetPaperToSnapshot } from "./toSheetPaperSnapshot";
import { toAdminSheetPaperJson } from "./toAdminSheetPaperJson";

const d = (v: string) => new Prisma.Decimal(v);

function row(avg: string | null, hint: string): SheetPaperRow {
  return {
    id: "p1",
    stockVariantId: "v1",
    name: "A4+ 300gr",
    gsm: 300,
    sheetWidthCm: d("22.5"),
    sheetHeightCm: d("32"),
    retailPricePerSheet: 12,
    dealerPricePerSheet: 9,
    isActive: true,
    sortOrder: 0,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    stockVariant: { id: "v1", sku: "PAPER-1", stockQuantity: d("500"), avgCost: avg == null ? null : d(avg), purchaseCost: d(hint) },
  };
}

/** Legacy rule (reference): average when > 0, else the catalog hint. */
function legacyCost(hint: number, avg: number | null): number {
  return typeof avg === "number" && Number.isFinite(avg) && avg > 0 ? avg : Math.max(0, hint);
}

describe("sheet paper price identity (variant vs legacy columns)", () => {
  const cases: [string | null, number][] = [
    [null, 0],
    [null, 2],
    ["1.85", 2],
    ["0", 3],
  ];
  for (const [avg, hint] of cases) {
    it(`avg ${avg ?? "null"}, hint ${hint}`, () => {
      const paper = toSheetPaperPricing(row(avg, String(hint)));
      expect(paper).toMatchObject({ sheetsInStock: 500, catalogCostPerSheet: hint, stockSku: "PAPER-1" });
      const snap = sheetPaperToSnapshot(paper);
      expect(snap).toEqual({
        id: "p1",
        name: "A4+ 300gr",
        gsm: 300,
        sheetWidthCm: 22.5,
        sheetHeightCm: 32,
        costPerSheet: hint,
        retailPricePerSheet: 12,
        dealerPricePerSheet: 9,
      });
      for (const customerType of ["retail", "dealer"] as const) {
        for (const sides of ["one", "two"] as const) {
          const p = computeBusinessCardLinePricing({
            paperSnapshot: snap,
            avgPaperCostPerSheet: paper.avgCostPerSheet,
            sheetsUsed: 9,
            sides,
            customerType,
          });
          const unit = legacyCost(hint, avg == null ? null : Number(avg));
          expect(p.avgPaperCostPerSheetSnapshot).toBe(unit);
          expect(p.totalSellPriceMdl).toBe(9 * (sides === "two" ? 2 : 1) * (customerType === "dealer" ? 9 : 12));
          expect(applyBusinessCardMinimumLineTotal(p, 150).pricing.totalSellPriceMdl).toBe(
            Math.max(150, p.totalSellPriceMdl),
          );
        }
      }
      const json = toAdminSheetPaperJson(paper);
      expect(json).toMatchObject({
        stockSheets: 500,
        avgPurchaseCostPerSheet: avg == null ? null : Number(avg),
        effectiveCostPerSheet: legacyCost(hint, avg == null ? null : Number(avg)),
        costPerSheet: hint,
        stockVariantId: "v1",
      });
    });
  }
});
