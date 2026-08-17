import { describe, expect, it } from "vitest";
import { planLfRollTransfers, type LfRollTransferLine } from "./lfRollTransfer";

const NARROW = "mat-127";
const WIDE = "mat-162";
const THIRD = "mat-137";

function line(overrides: Partial<LfRollTransferLine> = {}): LfRollTransferLine {
  return {
    orderLineId: "line-1",
    orderedMaterialId: NARROW,
    linearMeters: 0.6,
    hasOriginalDeduction: true,
    lastTransferMaterialId: null,
    ...overrides,
  };
}

describe("planLfRollTransfers", () => {
  it("moves a line from the ordered roll to the target roll", () => {
    const { actions, skippedLineIds } = planLfRollTransfers([line()], WIDE);

    expect(skippedLineIds).toEqual([]);
    expect(actions).toEqual([
      {
        orderLineId: "line-1",
        linearMeters: 0.6,
        restoreMaterialId: NARROW,
        deductMaterialId: WIDE,
      },
    ]);
  });

  it("skips lines already charged to the target roll", () => {
    const alreadyOrdered = line({ orderLineId: "a", orderedMaterialId: WIDE });
    const alreadyTransferred = line({
      orderLineId: "b",
      lastTransferMaterialId: WIDE,
    });

    const { actions, skippedLineIds } = planLfRollTransfers(
      [alreadyOrdered, alreadyTransferred],
      WIDE,
    );

    expect(actions).toEqual([]);
    expect(skippedLineIds).toEqual(["a", "b"]);
  });

  it("re-transfers from the previous transfer target, including back to the ordered roll", () => {
    const movedToWide = line({ lastTransferMaterialId: WIDE });

    // Second confirmation on a third roll: restore from WIDE, not from ordered.
    const toThird = planLfRollTransfers([movedToWide], THIRD);
    expect(toThird.actions).toEqual([
      {
        orderLineId: "line-1",
        linearMeters: 0.6,
        restoreMaterialId: WIDE,
        deductMaterialId: THIRD,
      },
    ]);

    // Confirmation back on the ordered roll undoes the transfer.
    const backToNarrow = planLfRollTransfers([movedToWide], NARROW);
    expect(backToNarrow.actions).toEqual([
      {
        orderLineId: "line-1",
        linearMeters: 0.6,
        restoreMaterialId: WIDE,
        deductMaterialId: NARROW,
      },
    ]);
  });

  it("deducts without restore when the original ORDER_SALE never happened", () => {
    const neverDeducted = line({ hasOriginalDeduction: false });

    const { actions } = planLfRollTransfers([neverDeducted], WIDE);
    expect(actions).toEqual([
      {
        orderLineId: "line-1",
        linearMeters: 0.6,
        restoreMaterialId: null,
        deductMaterialId: WIDE,
      },
    ]);
  });

  it("restores from the transfer target even if the original deduction was missing", () => {
    // Backlog line later confirmed on WIDE (deduct only), then re-confirmed on
    // NARROW: the WIDE deduction must be returned.
    const backlogMoved = line({
      hasOriginalDeduction: false,
      lastTransferMaterialId: WIDE,
    });

    const { actions } = planLfRollTransfers([backlogMoved], NARROW);
    expect(actions).toEqual([
      {
        orderLineId: "line-1",
        linearMeters: 0.6,
        restoreMaterialId: WIDE,
        deductMaterialId: NARROW,
      },
    ]);
  });

  it("skips lines without a known source material and with non-positive lm", () => {
    const orphan = line({ orderLineId: "orphan", orderedMaterialId: null });
    const zeroLm = line({ orderLineId: "zero", linearMeters: 0 });

    const { actions, skippedLineIds } = planLfRollTransfers(
      [orphan, zeroLm],
      WIDE,
    );

    expect(actions).toEqual([]);
    expect(skippedLineIds).toEqual(["orphan", "zero"]);
  });
});
