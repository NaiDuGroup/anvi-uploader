/**
 * Stock-transfer planning for "printed on a different roll" confirmations.
 *
 * When the workshop prints a layout on a roll other than the one each line
 * was ordered (and stock-deducted) on, the ledger must move the consumption:
 * return the line's linear meters to the roll currently charged, and deduct
 * the same amount from the roll actually used. The transferred amount is the
 * order-time `calculatedLinearMeters` — totals stay unchanged, only the
 * attribution between materials moves.
 */

export interface LfRollTransferLine {
  orderLineId: string;
  /** Material the line was ordered on; null when the catalog row was deleted. */
  orderedMaterialId: string | null;
  /** Order-time roll consumption of this line (lm). */
  linearMeters: number;
  /** True when an ORDER_SALE movement exists (stock was actually deducted). */
  hasOriginalDeduction: boolean;
  /** Material of the latest LAYOUT_TRANSFER_OUT for this line, if any. */
  lastTransferMaterialId: string | null;
}

export interface LfRollTransferAction {
  orderLineId: string;
  linearMeters: number;
  /**
   * Roll to return the lm to (the one currently charged). Null when nothing
   * was ever deducted for this line (order-time stock shortage) — then only
   * the deduction from the target roll is recorded.
   */
  restoreMaterialId: string | null;
  deductMaterialId: string;
}

export interface LfRollTransferPlan {
  actions: LfRollTransferAction[];
  /** Lines already charged to the target roll (or with nothing to move). */
  skippedLineIds: string[];
}

/**
 * The roll a line's consumption currently sits on: the latest transfer wins,
 * otherwise the ordered material.
 */
function currentChargedMaterialId(line: LfRollTransferLine): string | null {
  return line.lastTransferMaterialId ?? line.orderedMaterialId;
}

export function planLfRollTransfers(
  lines: readonly LfRollTransferLine[],
  targetMaterialId: string,
): LfRollTransferPlan {
  const actions: LfRollTransferAction[] = [];
  const skippedLineIds: string[] = [];

  for (const line of lines) {
    const current = currentChargedMaterialId(line);
    if (
      !(line.linearMeters > 0) ||
      !Number.isFinite(line.linearMeters) ||
      current === targetMaterialId ||
      // No ordered material and never transferred: unknown source, skip.
      current === null
    ) {
      skippedLineIds.push(line.orderLineId);
      continue;
    }

    // A transfer implies stock actually moved before; without it fall back to
    // whether the original ORDER_SALE deduction happened.
    const hasChargedStock =
      line.lastTransferMaterialId !== null || line.hasOriginalDeduction;

    actions.push({
      orderLineId: line.orderLineId,
      linearMeters: line.linearMeters,
      restoreMaterialId: hasChargedStock ? current : null,
      deductMaterialId: targetMaterialId,
    });
  }

  return { actions, skippedLineIds };
}
