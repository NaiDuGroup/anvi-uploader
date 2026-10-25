import type { Prisma } from "@prisma/client";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { consume, returnToStock } from "@/lib/stock/unified/ledger";
import { lfMaterialVariantIds, requireLfMaterialVariantId } from "@/lib/stock/unified/materials";
import { rollHoldingsByLine } from "@/lib/stock/unified/materialOrderStock";
import { planLfRollTransfers, type LfRollTransferLine } from "./lfRollTransfer";

export type ConfirmRollResult = {
  movedCount: number;
  skippedCount: number;
  /** Balance of the target roll after the transfers (m); null when nothing moved. */
  targetStockAfterLm: number | null;
  negativeStock: boolean;
};

/**
 * Records inside `tx` that a workshop layout was physically printed on the
 * `target` roll: for every line whose metres currently sit on another roll,
 * `LAYOUT_TRANSFER_BACK` gives back what the line holds there and
 * `LAYOUT_TRANSFER_OUT` takes the order-time metres from the target roll's
 * unified variant (never blocked: the print already happened). Order prices
 * never change (guarded). Idempotent: lines already on the target are skipped.
 */
export async function confirmRollTransfersInTx(
  tx: Prisma.TransactionClient,
  params: {
    target: { id: string; name: string };
    orderLineIds: readonly string[];
    createdById: string | null;
  },
): Promise<ConfirmRollResult> {
  const uniqueLineIds = [...new Set(params.orderLineIds)];
  const target = params.target;

  // Serialize on OrderLine rows: lock affected lines with FOR UPDATE to
  // prevent concurrent confirm-roll requests from racing on the same lines.
  await tx.$queryRaw`
    SELECT id FROM "order_lines"
    WHERE id = ANY(${uniqueLineIds})
    FOR UPDATE
  `;

  const orderLines = await tx.orderLine.findMany({
    where: { id: { in: uniqueLineIds }, productType: "large_format_print" },
    select: {
      id: true,
      largeFormatMaterialId: true,
      stockVariantId: true,
      largeFormatLineData: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });

  const orderByLineId = new Map(
    orderLines.map((l) => [l.id, { id: l.order.id, orderNumber: l.order.orderNumber }]),
  );

  const targetVariantId: string = await requireLfMaterialVariantId(tx, target.id);
  const orderedVariantByMaterial: Map<string, string> = await lfMaterialVariantIds(
    tx,
    orderLines.flatMap((l) => (l.largeFormatMaterialId ? [l.largeFormatMaterialId] : [])),
  );

  // What each line holds per roll, re-read from the ledger after locking.
  const holdingsByLine = await rollHoldingsByLine(tx, uniqueLineIds);

  const transferLines: LfRollTransferLine[] = [];
  for (const line of orderLines) {
    const data = parseLargeFormatLineData(line.largeFormatLineData);
    if (!data) continue;
    transferLines.push({
      orderLineId: line.id,
      orderedVariantId:
        line.stockVariantId ??
        (line.largeFormatMaterialId ? (orderedVariantByMaterial.get(line.largeFormatMaterialId) ?? null) : null),
      linearMeters: data.calculatedLinearMeters,
      holdings: holdingsByLine.get(line.id) ?? new Map(),
    });
  }

  const { actions, skippedLineIds } = planLfRollTransfers(transferLines, targetVariantId);

  if (actions.length === 0) {
    return {
      movedCount: 0,
      skippedCount: skippedLineIds.length,
      targetStockAfterLm: null,
      negativeStock: false,
    };
  }

  // Roll names for movement notes.
  const sourceVariantIds = [...new Set(actions.flatMap((a) => a.restores.map((r) => r.variantId)))];
  const sourceVariants = await tx.stockVariant.findMany({
    where: { id: { in: sourceVariantIds } },
    select: { id: true, lfMaterial: { select: { name: true } }, item: { select: { nameRo: true } } },
  });
  const nameByVariant = new Map(
    sourceVariants.map((v) => [v.id, v.lfMaterial?.name ?? v.item.nameRo]),
  );

  // Capture order prices before any stock operations to verify they don't change.
  const uniqueOrderIds = [...new Set(orderLines.map((l) => l.order.id))];
  const ordersBefore = await tx.order.findMany({
    where: { id: { in: uniqueOrderIds } },
    select: { id: true, price: true },
  });
  const priceBeforeById = new Map(
    ordersBefore.map((o) => [o.id, o.price?.toString() ?? null]),
  );

  // Execute stock movements on the unified ledger.
  for (const action of actions) {
    const order = orderByLineId.get(action.orderLineId);
    const sourceNames = action.restores.map((r) => nameByVariant.get(r.variantId) ?? r.variantId);
    const note = sourceNames.length > 0 ? `${sourceNames.join(", ")} → ${target.name}` : `→ ${target.name}`;

    for (const restore of action.restores) {
      await returnToStock(tx, {
        variantId: restore.variantId,
        quantity: restore.linearMeters,
        kind: StockMovementKind.LayoutTransferBack,
        orderId: order?.id ?? null,
        orderNumber: order?.orderNumber ?? null,
        orderLineId: action.orderLineId,
        createdById: params.createdById,
        note,
      });
    }
    if (action.deductLinearMeters > 0) {
      // The print already happened: never blocked, the balance may go negative.
      await consume(tx, {
        variantId: targetVariantId,
        quantity: action.deductLinearMeters,
        kind: StockMovementKind.LayoutTransferOut,
        allowNegative: true,
        orderId: order?.id ?? null,
        orderNumber: order?.orderNumber ?? null,
        orderLineId: action.orderLineId,
        createdById: params.createdById,
        note,
      });
    }
  }

  // GUARD: Verify that Order.price was not mutated by stock transfers.
  // Workshop confirm-roll must NEVER change customer billing.
  const ordersAfter = await tx.order.findMany({
    where: { id: { in: uniqueOrderIds } },
    select: { id: true, price: true },
  });
  for (const orderAfter of ordersAfter) {
    const priceBefore = priceBeforeById.get(orderAfter.id);
    const priceAfter = orderAfter.price?.toString() ?? null;
    if (priceBefore !== priceAfter) {
      throw new Error(
        `CRITICAL: Order.price was mutated during confirm-roll for order ${orderAfter.id}. ` +
          `Before: ${priceBefore}, After: ${priceAfter}. This is a bug.`,
      );
    }
  }

  const after = await tx.stockVariant.findUniqueOrThrow({
    where: { id: targetVariantId },
    select: { stockQuantity: true },
  });
  const stockAfter: number = Number(after.stockQuantity.toString());
  return {
    movedCount: actions.length,
    skippedCount: skippedLineIds.length,
    targetStockAfterLm: stockAfter,
    negativeStock: stockAfter < 0,
  };
}
