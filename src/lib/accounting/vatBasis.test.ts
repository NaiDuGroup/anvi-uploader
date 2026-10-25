import { describe, it, expect } from "vitest";
import type { ProductionCostsConfig } from "./types";
import {
  buildOrderProfitRows,
  EMPTY_LIVE_UNIT_COSTS,
  type ProfitOrderLineInput,
} from "./orderProfit";
import {
  LEGACY_VAT_BASIS,
  marginPercentOnCostBasis,
  revenueOnBasis,
  snapshotCostDivisor,
  type ProfitVatBasis,
} from "./vatBasis";

const CUTOVER = new Date("2026-11-01T00:00:00Z");
const EX_VAT: ProfitVatBasis = { exVat: true, cutoverAt: CUTOVER };

const zeroProduction: ProductionCostsConfig = {
  mugPrintPerUnit: 0,
  notebookPrintPerUnit: 0,
  packagingPerOrder: 0,
  otherConsumablesPerOrder: 0,
  inkMlPerSqmLargeFormatRoll: 0,
  inkMlPerSqmUvRigid: 0,
  inkMlPerSqmDtfTextile: 0,
  minimumOrderPriceMdl: 0,
  lfMinimumLineTotalMdl: 0,
  lfRetailMarkupMultiplier: 0,
  lfDealerMarkupMultiplier: 0,
  lfInkRetailMarkupMultiplier: 0,
  lfInkDealerMarkupMultiplier: 0,
  bcMinimumLineTotalMdl: 0,
};

function mugOrder(id: string, createdAt: Date, price: number, unitCost: number) {
  const line: ProfitOrderLineInput = {
    productType: "mug",
    mugProductSnapshot: {
      id: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      sku: "T",
      nameRo: "R",
      nameRu: "R",
      nameEn: "R",
      imageUrl: null,
      bodyColorHex: "#ffffff",
      handleColorHex: "#000000",
      innerColorHex: null,
      purchaseCost: unitCost,
    },
    notebookProductSnapshot: null,
    largeFormatLineData: null,
    files: [{ copies: 1 }],
  };
  return { id, orderNumber: 1, createdAt, price, orderLines: [line] };
}

describe("vat basis helpers", () => {
  it("strips VAT from revenue only on the ex-VAT basis", () => {
    expect(revenueOnBasis(1200, LEGACY_VAT_BASIS)).toBe(1200);
    expect(revenueOnBasis(1200, EX_VAT)).toBeCloseTo(1000, 6);
  });

  it("converts only snapshots frozen before the cutover", () => {
    expect(snapshotCostDivisor(new Date("2026-10-01"), LEGACY_VAT_BASIS)).toBe(1);
    expect(snapshotCostDivisor(new Date("2026-10-01"), EX_VAT)).toBeCloseTo(1.2, 6);
    expect(snapshotCostDivisor(new Date("2026-11-05"), EX_VAT)).toBe(1);
  });

  it("computes margin on the same basis as costs", () => {
    expect(marginPercentOnCostBasis(1200, 600, true)).toBe(50);
    expect(marginPercentOnCostBasis(1200, 500, false)).toBe(50);
  });
});

describe("buildOrderProfitRows on the ex-VAT basis", () => {
  it("keeps profit consistent for orders before and after the cutover", () => {
    const before = mugOrder("before", new Date("2026-10-20T10:00:00Z"), 1200, 600);
    const after = mugOrder("after", new Date("2026-11-03T10:00:00Z"), 1200, 500);
    const rows = buildOrderProfitRows(
      [before, after],
      [],
      zeroProduction,
      EMPTY_LIVE_UNIT_COSTS,
      EX_VAT,
    );
    for (const r of rows) {
      expect(r.revenue).toBe(1000);
      expect(r.productPurchaseCosts).toBe(500);
      expect(r.netProfit).toBe(500);
    }
  });
});
