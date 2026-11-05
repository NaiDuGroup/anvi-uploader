import { describe, expect, it } from "vitest";
import type { AdminOrderLineInput } from "@/lib/validations";
import { groupLinesForPacking } from "./lfCrossLinePacking";
import { applyLfLineExtras, hasLfLineExtras, lfLineExtrasInputRu, lfLineTotalWithExtrasMdl } from "./lfLineExtras";
import { lfLineExtrasRu } from "./lfLineSummaryLabel";
import type { LargeFormatLineData } from "./types";

function line(over: Partial<LargeFormatLineData> = {}): LargeFormatLineData {
  return {
    materialSnapshot: {
      id: "m1",
      name: "BANNER MATT 1.37*50m",
      rollWidthMeters: "1.370",
      costPerLinearMeter: 52,
      dealerPricePerLinearMeter: 0,
      retailPricePerLinearMeter: 0,
      dealerPrintPricePerLinearMeter: 0,
      retailPrintPricePerLinearMeter: 0,
    },
    printWidthCm: 200,
    printHeightCm: 100,
    quantity: 1,
    customerType: "retail",
    calculatedLinearMeters: 2.01,
    materialCost: 105,
    materialSellPrice: 421,
    printSellPrice: 148,
    totalSellPrice: 569,
    estimatedProfit: 427,
    totalDirectCostMdl: 142,
    ...over,
  };
}

describe("applyLfLineExtras", () => {
  it("no extras: the same object (studio lines unchanged)", () => {
    const d = line();
    expect(applyLfLineExtras(d, null)).toEqual({ ok: true, data: d });
    expect(applyLfLineExtras(d, { finishing: {}, kit: null })).toEqual({ ok: true, data: d });
    expect(hasLfLineExtras({ finishing: { hem: false } })).toBe(false);
  });

  it("finishing goes on top of the print price and into the direct cost", () => {
    const res = applyLfLineExtras(line(), { finishing: { hem: true, eyelets: { mode: "spacing", spacingCm: 50 } } });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.totalSellPrice).toBe(569 + 132);
    expect(res.data.finishing?.totalMdl).toBe(132);
    expect(res.data.totalDirectCostMdl).toBe(142 + 5);
    expect(res.data.estimatedProfit).toBe(701 - 147);
    expect(res.data.materialSellPrice).toBe(421);
    expect(lfLineExtrasRu(res.data)).toBe("люверсы шаг ≤50 см по периметру (12 шт.), проклейка по периметру (6 м)");
  });

  it("roll-up set: set price × pieces replaces the print price; stand cost in the direct cost", () => {
    const d = line({ printWidthCm: 80, printHeightCm: 210, quantity: 2, totalSellPrice: 300, totalDirectCostMdl: 150 });
    const res = applyLfLineExtras(d, { kit: "rollup_80x200" });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.totalSellPrice).toBe(2200);
    expect(res.data.kit).toMatchObject({ id: "rollup_80x200", unitPriceMdl: 1100, printFormulaSellMdl: 300, standSku: "STAND-ROLLUP-80X200" });
    expect(res.data.totalDirectCostMdl).toBe(150 + 2 * 450);
    expect(res.data.lfMinimumLineSellUpliftMdl).toBeUndefined();
    expect(lfLineExtrasRu(res.data)).toBe("Roll-up 80×200 со стойкой");
  });

  it("X-banner: corner eyelets noted for the workshop", () => {
    const res = applyLfLineExtras(line({ printWidthCm: 180, printHeightCm: 80 }), { kit: "xbanner_80x180" });
    expect(res.ok && res.data.totalSellPrice).toBe(650);
    expect(res.ok && lfLineExtrasRu(res.data)).toBe("X-banner 80×180 со стойкой, люверсы по углам (4 шт.)");
  });

  it("refuses a set of another size, a set with finishing or with a size preset", () => {
    expect(applyLfLineExtras(line({ printWidthCm: 85, printHeightCm: 200 }), { kit: "rollup_80x200" })).toEqual({
      ok: false,
      code: "lf_kit_size_mismatch",
    });
    expect(
      applyLfLineExtras(line({ printWidthCm: 80, printHeightCm: 210 }), { kit: "rollup_80x200", finishing: { hem: true } }),
    ).toEqual({ ok: false, code: "lf_kit_with_finishing" });
    expect(
      applyLfLineExtras(
        line({
          printWidthCm: 80,
          printHeightCm: 210,
          sizePresetSnapshot: { presetId: "p", widthCm: 80, heightCm: 210, unitPriceMdl: 1, customerType: "retail" },
        }),
        { kit: "rollup_80x200" },
      ),
    ).toEqual({ ok: false, code: "lf_kit_with_preset" });
  });
});

describe("groupLinesForPacking with sets", () => {
  it("roll-up lines are priced on their own (fixed set price), plain lines of the roll still pool", () => {
    const base = {
      productType: "large_format_print" as const,
      largeFormatMaterialId: "11111111-1111-4111-8111-111111111111",
      printWidthCm: 80,
      printHeightCm: 210,
      quantity: 1,
      customerType: "retail" as const,
      files: [{ fileName: "a.pdf", fileUrl: "uploads/a", copies: 1, color: "color" as const }],
    };
    const lines = [{ ...base, lfKit: "rollup_80x200" as const }, base, base] as AdminOrderLineInput[];
    const groups = [...groupLinesForPacking(lines).values()];
    expect(groups).toEqual([[1, 2]]);
  });
});

describe("wizard line price with extras (shop line opened for editing)", () => {
  it("print + finishing, or the set price; unchanged without extras", () => {
    const l = { widthCm: 200, heightCm: 100, quantity: 1 };
    expect(lfLineTotalWithExtrasMdl(570, l, null)).toBe(570);
    expect(lfLineTotalWithExtrasMdl(570, l, { finishing: { eyelets: { mode: "spacing", spacingCm: 50 } } })).toBe(612);
    expect(lfLineTotalWithExtrasMdl(300, { widthCm: 80, heightCm: 210, quantity: 3 }, { kit: "rollup_80x200" })).toBe(3300);
    expect(lfLineExtrasInputRu(l, { finishing: { hem: true } })).toBe("проклейка по периметру (6 м)");
    expect(lfLineExtrasInputRu(l, { kit: "rollup_100x200" })).toBe("Roll-up 100×200 со стойкой");
  });
});
