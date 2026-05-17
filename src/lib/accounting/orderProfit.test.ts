import { describe, it, expect } from "vitest";
import type { ProductionCostsConfig } from "./types";
import {
  normalizeProfitScalar,
  computeLineProductPurchaseTotal,
  computeOrderProductPurchaseTotal,
  computeOrderProductionCost,
  buildOrderProfitRows,
  summarizeProfitRows,
  type ProfitOrderLineInput,
} from "./orderProfit";
import type { ExpenseForAccrual } from "./expenseAccrual";
import { otherMugProductSnapshot } from "@/lib/mug/mugProductSnapshot";

const SNAP_ID = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

function validMugSnap(purchaseCost: number) {
  return {
    id: SNAP_ID,
    sku: "T",
    nameRo: "R",
    nameRu: "R",
    nameEn: "R",
    imageUrl: null as string | null,
    bodyColorHex: "#ffffff",
    handleColorHex: "#000000",
    innerColorHex: null as string | null,
    purchaseCost,
  };
}

const production: ProductionCostsConfig = {
  mugPrintPerUnit: 10,
  notebookPrintPerUnit: 15,
  packagingPerOrder: 5,
  otherConsumablesPerOrder: 3,
  inkMlPerSqmLargeFormatRoll: 0,
  inkMlPerSqmUvRigid: 0,
  inkMlPerSqmDtfTextile: 0,
  minimumOrderPriceMdl: 0,
  lfMinimumLineTotalMdl: 0,
  lfRetailMarkupMultiplier: 0,
  lfDealerMarkupMultiplier: 0,
  lfInkRetailMarkupMultiplier: 0,
  lfInkDealerMarkupMultiplier: 0,
};

describe("normalizeProfitScalar", () => {
  it("rounds and treats non-finite as 0", () => {
    expect(normalizeProfitScalar(12.4)).toBe(12);
    expect(normalizeProfitScalar(NaN)).toBe(0);
  });
});

describe("computeLineProductPurchaseTotal", () => {
  const mugLine = (snapshot: unknown): ProfitOrderLineInput => ({
    productType: "mug",
    mugProductId: "p1",
    mugProductSnapshot: snapshot,
    notebookProductId: null,
    notebookProductSnapshot: null,
    largeFormatLineData: null,
    files: [{ copies: 2 }],
  });

  it("uses snapshot purchaseCost for mug", () => {
    const r = computeLineProductPurchaseTotal(
      mugLine(validMugSnap(40)),
      new Map(),
      new Map(),
    );
    expect(r).toEqual({ lineTotal: 80, missingUnitCost: false });
  });

  it("mug other skips purchase total", () => {
    const r = computeLineProductPurchaseTotal(
      mugLine(otherMugProductSnapshot()),
      new Map(),
      new Map(),
    );
    expect(r).toEqual({ lineTotal: 0, missingUnitCost: false });
  });

  it("mug without cost marks missing but uses 0", () => {
    const r = computeLineProductPurchaseTotal(
      mugLine({}),
      new Map([["p1", null]]),
      new Map(),
    );
    expect(r.missingUnitCost).toBe(true);
    expect(r.lineTotal).toBe(0);
  });

  it("live mug map fills missing snapshot", () => {
    const r = computeLineProductPurchaseTotal(
      mugLine(null),
      new Map([["p1", 25]]),
      new Map(),
    );
    expect(r).toEqual({ lineTotal: 50, missingUnitCost: false });
  });

  it("paper line has no product purchase cost", () => {
    const line: ProfitOrderLineInput = {
      productType: "paper_print",
      mugProductId: null,
      mugProductSnapshot: null,
      notebookProductId: null,
      notebookProductSnapshot: null,
      largeFormatLineData: null,
      files: [{ copies: 5 }],
    };
    expect(
      computeLineProductPurchaseTotal(line, new Map(), new Map()),
    ).toEqual({ lineTotal: 0, missingUnitCost: false });
  });
});

describe("computeOrderProductionCost", () => {
  it("sums fixed per-order and variable mug/notebook units", () => {
    const lines: ProfitOrderLineInput[] = [
      {
        productType: "mug",
        mugProductId: null,
        mugProductSnapshot: null,
        notebookProductId: null,
        notebookProductSnapshot: null,
        largeFormatLineData: null,
        files: [{ copies: 2 }],
      },
      {
        productType: "notebook",
        mugProductId: null,
        mugProductSnapshot: null,
        notebookProductId: null,
        notebookProductSnapshot: null,
        largeFormatLineData: null,
        files: [{ copies: 1 }],
      },
    ];
    // 5 + 3 + 2*10 + 1*15 = 43
    expect(computeOrderProductionCost(lines, production)).toBe(43);
  });
});

describe("computeOrderProductPurchaseTotal", () => {
  it("aggregates lines and missing flag", () => {
    const lines: ProfitOrderLineInput[] = [
      {
        productType: "mug",
        mugProductId: "m1",
        mugProductSnapshot: validMugSnap(5),
        notebookProductId: null,
        notebookProductSnapshot: null,
        largeFormatLineData: null,
        files: [{ copies: 1 }],
      },
      {
        productType: "mug",
        mugProductId: "m2",
        mugProductSnapshot: null,
        notebookProductId: null,
        notebookProductSnapshot: null,
        largeFormatLineData: null,
        files: [{ copies: 1 }],
      },
    ];
    const r = computeOrderProductPurchaseTotal(lines, new Map(), new Map());
    expect(r.total).toBe(5);
    expect(r.missingUnitCost).toBe(true);
  });
});

describe("buildOrderProfitRows and summarizeProfitRows", () => {
  it("computes net profit and allocates same-day pooled expenses by revenue share", () => {
    const day = new Date("2026-05-10T12:00:00.000Z");
    const orders = [
      {
        id: "o1",
        orderNumber: 1,
        createdAt: day,
        price: 900,
        productType: "paper_print",
        orderLines: [
          {
            productType: "paper_print",
            mugProductId: null,
            mugProductSnapshot: null,
            notebookProductId: null,
            notebookProductSnapshot: null,
            largeFormatLineData: null,
            files: [{ copies: 1 }],
          },
        ] as ProfitOrderLineInput[],
      },
      {
        id: "o2",
        orderNumber: 2,
        createdAt: day,
        price: 100,
        productType: "paper_print",
        orderLines: [
          {
            productType: "paper_print",
            mugProductId: null,
            mugProductSnapshot: null,
            notebookProductId: null,
            notebookProductSnapshot: null,
            largeFormatLineData: null,
            files: [{ copies: 1 }],
          },
        ] as ProfitOrderLineInput[],
      },
    ];

    const expenses: ExpenseForAccrual[] = [
      {
        type: "rent",
        period: "one_time",
        amount: 100,
        isActive: true,
        startDate: day,
        endDate: null,
      },
      {
        type: "tax",
        period: "one_time",
        amount: 50,
        isActive: true,
        startDate: day,
        endDate: null,
      },
    ];

    const rows = buildOrderProfitRows(
      orders,
      expenses,
      production,
      new Map(),
      new Map(),
    );

    const r1 = rows.find((r) => r.id === "o1")!;
    const r2 = rows.find((r) => r.id === "o2")!;

    expect(r1.revenue).toBe(900);
    expect(r1.taxes + r2.taxes).toBe(50);
    expect(r1.allocatedExpenses + r2.allocatedExpenses).toBe(100);
    // 90% of 100 = 90 to first order
    expect(r1.allocatedExpenses).toBe(90);
    expect(r2.allocatedExpenses).toBe(10);

    const prod = production.packagingPerOrder + production.otherConsumablesPerOrder;
    expect(r1.netProfit).toBe(
      normalizeProfitScalar(900 - prod - r1.allocatedExpenses - r1.taxes),
    );

    const summary = summarizeProfitRows(rows);
    expect(summary.revenue).toBe(1000);
    expect(summary.taxes).toBe(50);
    expect(summary.allocatedExpenses).toBe(100);
  });
});
