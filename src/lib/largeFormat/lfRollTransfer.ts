/**
 * Stock-transfer planning for "printed on a different roll" confirmations.
 *
 * When the workshop prints a layout on a roll other than the one each line
 * is charged to, the ledger moves the consumption: the metres the line holds
 * on other rolls go back (`LAYOUT_TRANSFER_BACK`) and the line's order-time
 * `calculatedLinearMeters` are taken from the roll actually used
 * (`LAYOUT_TRANSFER_OUT`). What a line holds comes from the unified ledger
 * (net of sales, returns, backlog and earlier transfers), per roll variant.
 * Order prices never change — only the attribution between rolls moves.
 */

const EPS = 1e-6;

export interface LfRollTransferLine {
  orderLineId: string;
  /** Roll variant the line was ordered on; null when unknown (catalog row deleted). */
  orderedVariantId: string | null;
  /** Order-time roll consumption of this line (lm). */
  linearMeters: number;
  /** Net metres the line holds per roll variant (empty when nothing was taken, e.g. a shortage). */
  holdings: ReadonlyMap<string, number>;
}

export interface LfRollTransferAction {
  orderLineId: string;
  /** Metres to give back per roll the line currently sits on. */
  restores: { variantId: string; linearMeters: number }[];
  /** Metres to take from the target roll (0 when it already holds the line). */
  deductLinearMeters: number;
}

export interface LfRollTransferPlan {
  actions: LfRollTransferAction[];
  /** Lines already charged to the target roll (or with nothing to move). */
  skippedLineIds: string[];
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function planLfRollTransfers(
  lines: readonly LfRollTransferLine[],
  targetVariantId: string,
): LfRollTransferPlan {
  const actions: LfRollTransferAction[] = [];
  const skippedLineIds: string[] = [];

  for (const line of lines) {
    if (!(line.linearMeters > 0) || !Number.isFinite(line.linearMeters)) {
      skippedLineIds.push(line.orderLineId);
      continue;
    }
    const restores = [...line.holdings.entries()]
      .filter(([variantId, held]) => variantId !== targetVariantId && held > EPS)
      .map(([variantId, held]) => ({ variantId, linearMeters: round(held) }));
    const targetHeld: number = Math.max(0, line.holdings.get(targetVariantId) ?? 0);
    const deductLinearMeters: number = Math.max(0, round(line.linearMeters - targetHeld));

    if (restores.length === 0) {
      const nothingCharged: boolean = targetHeld <= EPS;
      if (
        deductLinearMeters <= EPS ||
        // Ordered on the target roll and waiting for stock: nothing to move.
        (nothingCharged && line.orderedVariantId === targetVariantId) ||
        // No ordered roll and nothing taken: unknown source, skip.
        (nothingCharged && line.orderedVariantId === null)
      ) {
        skippedLineIds.push(line.orderLineId);
        continue;
      }
    }

    actions.push({
      orderLineId: line.orderLineId,
      restores,
      deductLinearMeters: deductLinearMeters > EPS ? deductLinearMeters : 0,
    });
  }

  return { actions, skippedLineIds };
}
