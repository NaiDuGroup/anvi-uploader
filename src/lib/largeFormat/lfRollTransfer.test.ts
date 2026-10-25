import { describe, expect, it } from "vitest";
import { planLfRollTransfers, type LfRollTransferLine } from "./lfRollTransfer";

const NARROW = "var-127";
const WIDE = "var-162";
const THIRD = "var-137";

function line(overrides: Partial<LfRollTransferLine> = {}): LfRollTransferLine {
  return {
    orderLineId: "line-1",
    orderedVariantId: NARROW,
    linearMeters: 0.6,
    holdings: new Map([[NARROW, 0.6]]),
    ...overrides,
  };
}

describe("planLfRollTransfers", () => {
  it("moves a line from the ordered roll to the target roll", () => {
    const { actions, skippedLineIds } = planLfRollTransfers([line()], WIDE);

    expect(skippedLineIds).toEqual([]);
    expect(actions).toEqual([
      { orderLineId: "line-1", restores: [{ variantId: NARROW, linearMeters: 0.6 }], deductLinearMeters: 0.6 },
    ]);
  });

  it("skips lines already charged to the target roll (idempotent re-confirm)", () => {
    const alreadyOrdered = line({ orderLineId: "a", orderedVariantId: WIDE, holdings: new Map([[WIDE, 0.6]]) });
    const alreadyTransferred = line({ orderLineId: "b", holdings: new Map([[WIDE, 0.6]]) });

    const { actions, skippedLineIds } = planLfRollTransfers([alreadyOrdered, alreadyTransferred], WIDE);

    expect(actions).toEqual([]);
    expect(skippedLineIds).toEqual(["a", "b"]);
  });

  it("re-transfers from the roll the line sits on now, including back to the ordered roll", () => {
    const movedToWide = line({ holdings: new Map([[WIDE, 0.6]]) });

    expect(planLfRollTransfers([movedToWide], THIRD).actions).toEqual([
      { orderLineId: "line-1", restores: [{ variantId: WIDE, linearMeters: 0.6 }], deductLinearMeters: 0.6 },
    ]);
    expect(planLfRollTransfers([movedToWide], NARROW).actions).toEqual([
      { orderLineId: "line-1", restores: [{ variantId: WIDE, linearMeters: 0.6 }], deductLinearMeters: 0.6 },
    ]);
  });

  it("only takes from the target when nothing was taken at order time (shortage)", () => {
    const shortage = line({ holdings: new Map() });
    expect(planLfRollTransfers([shortage], WIDE).actions).toEqual([
      { orderLineId: "line-1", restores: [], deductLinearMeters: 0.6 },
    ]);
  });

  it("skips a shortage line confirmed on its own ordered roll", () => {
    const shortage = line({ holdings: new Map() });
    const { actions, skippedLineIds } = planLfRollTransfers([shortage], NARROW);
    expect(actions).toEqual([]);
    expect(skippedLineIds).toEqual(["line-1"]);
  });

  it("skips lines with an unknown source and nothing taken", () => {
    const orphan = line({ orderedVariantId: null, holdings: new Map() });
    const { actions, skippedLineIds } = planLfRollTransfers([orphan], WIDE);
    expect(actions).toEqual([]);
    expect(skippedLineIds).toEqual(["line-1"]);
  });

  it("gives back what the line actually holds and tops the target up to the order-time metres", () => {
    const split = line({ holdings: new Map([[NARROW, 0.4], [WIDE, 0.1], [THIRD, -0.05]]) });
    expect(planLfRollTransfers([split], WIDE).actions).toEqual([
      { orderLineId: "line-1", restores: [{ variantId: NARROW, linearMeters: 0.4 }], deductLinearMeters: 0.5 },
    ]);
  });

  it("skips lines with no consumption", () => {
    const { actions, skippedLineIds } = planLfRollTransfers([line({ linearMeters: 0 })], WIDE);
    expect(actions).toEqual([]);
    expect(skippedLineIds).toEqual(["line-1"]);
  });
});
