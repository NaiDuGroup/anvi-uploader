import { describe, expect, it } from "vitest";
import type { ResolvedAdminOrderLine } from "@/lib/adminOrderCreateHelpers";
import { applyManualLinePriceToResolved } from "./applyManualLinePrice";

const PRICED = {
  version: 1,
  quantity: 2,
  pricing: { totalSellPriceMdl: 500 },
  costs: { totalCostMdl: 200 },
  estimatedProfitMdl: 300,
};

function uvLine(): ResolvedAdminOrderLine {
  return {
    input: { productType: "uv_print", files: [] },
    uvExtras: { uvLineData: structuredClone(PRICED) },
  } as unknown as ResolvedAdminOrderLine;
}

function mugLine(): ResolvedAdminOrderLine {
  return {
    input: { productType: "mug", files: [] },
    mugExtras: { stockVariantId: "v1", mugProductSnapshot: {} },
  } as unknown as ResolvedAdminOrderLine;
}

describe("applyManualLinePriceToResolved", () => {
  it("writes a line total into the snapshot", () => {
    const r = uvLine();
    applyManualLinePriceToResolved(r, { manualLineTotalMdl: 350 }, null);
    expect(r.uvExtras!.uvLineData.pricing.totalSellPriceMdl).toBe(350);
    expect(r.uvExtras!.uvLineData.estimatedProfitMdl).toBe(150);
    expect(r.manualUnitPriceMdl).toBeUndefined();
  });

  it("keeps the stored manual total when the request does not send one", () => {
    const r = uvLine();
    const prev = { productType: "uv_print", uvLineData: { ...PRICED, manualTotalSellPriceMdl: 410 } };
    applyManualLinePriceToResolved(r, {}, prev);
    expect(r.uvExtras!.uvLineData.pricing.totalSellPriceMdl).toBe(410);
    const cleared = uvLine();
    applyManualLinePriceToResolved(cleared, { manualLineTotalMdl: null }, prev);
    expect(cleared.uvExtras!.uvLineData.pricing.totalSellPriceMdl).toBe(500);
  });

  it("ignores a stored price of another product type", () => {
    const r = uvLine();
    applyManualLinePriceToResolved(r, {}, { productType: "dtf_apparel", dtfLineData: { manualTotalSellPriceMdl: 1 } });
    expect(r.uvExtras!.uvLineData.pricing.totalSellPriceMdl).toBe(500);
  });

  it("per-piece types set manualUnitPriceMdl (null clears, absent keeps)", () => {
    const r = mugLine();
    applyManualLinePriceToResolved(r, { manualUnitPriceMdl: 95.5 }, null);
    expect(r.manualUnitPriceMdl).toBe(95.5);
    const kept = mugLine();
    applyManualLinePriceToResolved(kept, {}, { productType: "mug", manualUnitPriceMdl: 80 });
    expect(kept.manualUnitPriceMdl).toBe(80);
    const cleared = mugLine();
    applyManualLinePriceToResolved(cleared, { manualUnitPriceMdl: null }, { productType: "mug", manualUnitPriceMdl: 80 });
    expect(cleared.manualUnitPriceMdl).toBeNull();
  });
});
