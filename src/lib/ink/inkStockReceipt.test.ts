import { describe, it, expect } from "vitest";
import { weightedAverageInkCostPerMl } from "./inkWeightedAverage";

/** Mirrors {@link replayInkReceiptsWeightedAverage} loop (no DB). */
function replayLocal(
  receipts: { quantityMl: number; totalCostMdl: number }[],
): { stockMl: number; avgCostPerMl: number } {
  let stockMl = 0;
  let avgCostPerMl = 0;
  for (const row of receipts) {
    const wa = weightedAverageInkCostPerMl({
      currentStockMl: stockMl,
      currentAvgCostPerMl: avgCostPerMl,
      purchasedMl: row.quantityMl,
      purchaseTotalCostMdl: row.totalCostMdl,
    });
    stockMl = wa.newStockMl;
    avgCostPerMl = wa.newAvgCostPerMl;
  }
  return { stockMl, avgCostPerMl };
}

describe("ink WA replay", () => {
  it("matches incremental posting from empty tank", () => {
    const r = replayLocal([
      { quantityMl: 100, totalCostMdl: 50 },
      { quantityMl: 50, totalCostMdl: 40 },
    ]);
    expect(r.stockMl).toBe(150);
    expect(r.avgCostPerMl).toBeCloseTo((100 * 0.5 + 50 * 0.8) / 150, 8);
  });
});
