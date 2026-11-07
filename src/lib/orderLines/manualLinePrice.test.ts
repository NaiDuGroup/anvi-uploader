import { describe, expect, it } from "vitest";
import type { LargeFormatLineData } from "@/lib/largeFormat/types";
import type { DtfLineData } from "@/lib/dtf/types";
import type { UvLineData } from "@/lib/uv/types";
import type { SublimationLineData } from "@/lib/sublimation/types";
import {
  applyManualDtfLinePrice,
  applyManualLfLinePrice,
  applyManualSublimationLinePrice,
  applyManualUvLinePrice,
  isManualTotalSnapshotType,
  isManualUnitPriceType,
  resolveManualPriceInput,
  storedManualLineTotalMdl,
  storedManualUnitPriceMdl,
} from "./manualLinePrice";

/** Banner: calculated 300 MDL, direct cost 120 MDL. */
const LF = {
  materialSnapshot: { id: "m1" },
  printWidthCm: 100,
  printHeightCm: 200,
  quantity: 1,
  customerType: "retail",
  calculatedLinearMeters: 2,
  materialCost: 80,
  materialSellPrice: 200,
  printSellPrice: 100,
  totalSellPrice: 300,
  estimatedProfit: 180,
  totalDirectCostMdl: 120,
  marginPercent: 60,
} as unknown as LargeFormatLineData;

/** DTF / UV / sublimation share the pricing + costs shape: calculated 500, cost 200. */
const PRICED = {
  version: 1,
  quantity: 10,
  pricing: { totalSellPriceMdl: 500, unitItemPriceMdl: 50 },
  costs: { totalCostMdl: 200 },
  estimatedProfitMdl: 300,
};

describe("large-format manual line total", () => {
  it("bills the manual total, keeps the calculated one and the costs", () => {
    const out = applyManualLfLinePrice(LF, 450);
    expect(out.totalSellPrice).toBe(450);
    expect(out.estimatedProfit).toBe(330);
    expect(out.marginPercent).toBeCloseTo(73.33, 2);
    expect(out.totalDirectCostMdl).toBe(120);
    expect(out.materialCost).toBe(80);
    expect(storedManualLineTotalMdl(out)).toBe(450);
    expect((out as unknown as { computedTotalSellPriceMdl: number }).computedTotalSellPriceMdl).toBe(300);
  });

  it("null clears back to the calculated total; re-applying never stacks", () => {
    const manual = applyManualLfLinePrice(LF, 450);
    const again = applyManualLfLinePrice(manual, 200);
    expect(again.totalSellPrice).toBe(200);
    expect((again as unknown as { computedTotalSellPriceMdl: number }).computedTotalSellPriceMdl).toBe(300);
    const cleared = applyManualLfLinePrice(again, null);
    expect(cleared).toEqual(LF);
    expect(storedManualLineTotalMdl(cleared)).toBeNull();
  });

  it("rounds to bani and ignores invalid values", () => {
    expect(applyManualLfLinePrice(LF, 99.999).totalSellPrice).toBe(100);
    expect(applyManualLfLinePrice(LF, -5)).toEqual(LF);
    expect(applyManualLfLinePrice(LF, Number.NaN)).toEqual(LF);
    expect(applyManualLfLinePrice(LF, 0).totalSellPrice).toBe(0);
  });
});

describe("DTF / UV / sublimation manual line total", () => {
  it.each([
    ["dtf", (d: unknown, m: number | null) => applyManualDtfLinePrice(d as DtfLineData, m)],
    ["uv", (d: unknown, m: number | null) => applyManualUvLinePrice(d as UvLineData, m)],
    ["subl", (d: unknown, m: number | null) => applyManualSublimationLinePrice(d as SublimationLineData, m)],
  ])("%s: total + profit follow the manual price, costs stay", (_name, apply) => {
    const out = apply(PRICED, 420) as unknown as typeof PRICED & { computedTotalSellPriceMdl: number };
    expect(out.pricing.totalSellPriceMdl).toBe(420);
    expect(out.pricing.unitItemPriceMdl).toBe(50);
    expect(out.estimatedProfitMdl).toBe(220);
    expect(out.costs.totalCostMdl).toBe(200);
    expect(out.computedTotalSellPriceMdl).toBe(500);
    expect(storedManualLineTotalMdl(out)).toBe(420);
    expect(apply(out, null)).toEqual(PRICED);
  });
});

describe("edit rules", () => {
  it("a sent value wins (null clears), absent keeps the stored one", () => {
    expect(resolveManualPriceInput(150, 99)).toBe(150);
    expect(resolveManualPriceInput(null, 99)).toBeNull();
    expect(resolveManualPriceInput(undefined, 99)).toBe(99);
    expect(resolveManualPriceInput(undefined, null)).toBeNull();
  });

  it("reads the stored per-piece price from a number or a decimal string", () => {
    expect(storedManualUnitPriceMdl(12.5)).toBe(12.5);
    expect(storedManualUnitPriceMdl("7.10")).toBe(7.1);
    expect(storedManualUnitPriceMdl(null)).toBeNull();
    expect(storedManualUnitPriceMdl(undefined)).toBeNull();
  });

  it("splits product types into line-total and per-piece kinds", () => {
    for (const pt of ["large_format_print", "dtf_apparel", "uv_print", "sublimation_print"]) {
      expect(isManualTotalSnapshotType(pt)).toBe(true);
      expect(isManualUnitPriceType(pt)).toBe(false);
    }
    for (const pt of ["paper_print", "mug", "notebook", "pen"]) {
      expect(isManualUnitPriceType(pt)).toBe(true);
      expect(isManualTotalSnapshotType(pt)).toBe(false);
    }
    expect(isManualTotalSnapshotType("business_card")).toBe(false);
    expect(isManualUnitPriceType("sticker_sheet")).toBe(false);
  });
});
