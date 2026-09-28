import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { parseLargeFormatLineData } from "@/lib/largeFormat/parseLargeFormatLineData";
import { LF_ROLL_STOCK_KIND } from "@/lib/largeFormat/lfRollStockKinds";
import {
  forceDeductLfRollStock,
  restoreLfRollStock,
} from "@/lib/largeFormat/lfRollStockLedger";
import {
  planLfRollTransfers,
  type LfRollTransferLine,
} from "@/lib/largeFormat/lfRollTransfer";

export const runtime = "nodejs";

const bodySchema = z.object({
  targetMaterialId: z.string().min(1),
  orderLineIds: z.array(z.string().min(1)).min(1).max(200),
});

/**
 * Records that a workshop layout was physically printed on `targetMaterialId`.
 *
 * For every line whose consumption currently sits on a different roll, moves
 * the order-time linear meters between materials as a pair of movements:
 * `LAYOUT_TRANSFER_BACK` (+lm on the previously charged roll) and
 * `LAYOUT_TRANSFER_OUT` (−lm on the actual roll). Order prices and
 * `largeFormatLineData` stay untouched. Idempotent: lines already charged to
 * the target roll are skipped, so re-confirming is safe.
 *
 * The target deduction is *not* blocked by low stock — the print already
 * happened; a negative balance is reported as a warning instead.
 */
export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "workshop" && user.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  const { targetMaterialId, orderLineIds } = parsed.data;

  const target = await prisma.largeFormatMaterial.findUnique({
    where: { id: targetMaterialId },
    select: { id: true, name: true, isActive: true },
  });
  if (!target || !target.isActive) {
    return NextResponse.json({ error: "material_not_found" }, { status: 404 });
  }

  const uniqueLineIds = [...new Set(orderLineIds)];

  // Fetch order lines and material names for movement notes (outside transaction).
  const orderLines = await prisma.orderLine.findMany({
    where: { id: { in: uniqueLineIds }, productType: "large_format_print" },
    select: {
      id: true,
      largeFormatMaterialId: true,
      largeFormatLineData: true,
      order: { select: { id: true, orderNumber: true } },
    },
  });

  const orderByLineId = new Map(
    orderLines.map((l) => [l.id, { id: l.order.id, orderNumber: l.order.orderNumber }]),
  );

  const targetStockAfterLm = await prisma.$transaction(async (tx) => {
    // Serialize on OrderLine rows: lock affected lines with FOR UPDATE to
    // prevent concurrent confirm-roll requests from racing on the same lines.
    await tx.$queryRaw`
      SELECT id FROM "order_lines"
      WHERE id = ANY(${uniqueLineIds})
      FOR UPDATE
    `;

    // Re-read movements inside the transaction after locking to get fresh state.
    const movements = await tx.lfRollStockMovement.findMany({
      where: {
        orderLineId: { in: uniqueLineIds },
        kind: {
          in: [
            LF_ROLL_STOCK_KIND.ORDER_SALE,
            LF_ROLL_STOCK_KIND.LAYOUT_TRANSFER_OUT,
          ],
        },
      },
      orderBy: { createdAt: "asc" },
      select: { orderLineId: true, kind: true, materialId: true },
    });

    // Rebuild state from fresh movements.
    const hasOrderSale = new Set<string>();
    const lastTransferByLine = new Map<string, string>();
    for (const mv of movements) {
      if (!mv.orderLineId) continue;
      if (mv.kind === LF_ROLL_STOCK_KIND.ORDER_SALE) {
        hasOrderSale.add(mv.orderLineId);
      } else {
        lastTransferByLine.set(mv.orderLineId, mv.materialId);
      }
    }

    // Rebuild transfer lines from locked state.
    const transferLines: LfRollTransferLine[] = [];
    for (const line of orderLines) {
      const data = parseLargeFormatLineData(line.largeFormatLineData);
      if (!data) continue;
      transferLines.push({
        orderLineId: line.id,
        orderedMaterialId: line.largeFormatMaterialId,
        linearMeters: data.calculatedLinearMeters,
        hasOriginalDeduction: hasOrderSale.has(line.id),
        lastTransferMaterialId: lastTransferByLine.get(line.id) ?? null,
      });
    }

    // Replan transfers from fresh state.
    const { actions, skippedLineIds } = planLfRollTransfers(
      transferLines,
      targetMaterialId,
    );

    if (actions.length === 0) {
      return {
        movedCount: 0,
        skippedCount: skippedLineIds.length,
        targetStockAfterLm: null,
        negativeStock: false,
      };
    }

    // Fetch material names for movement notes.
    const sourceIds = [
      ...new Set(
        actions
          .map((a) => a.restoreMaterialId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const sourceMaterials = await tx.largeFormatMaterial.findMany({
      where: { id: { in: sourceIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(sourceMaterials.map((m) => [m.id, m.name]));

    // Capture order prices before any stock operations to verify they don't change.
    const uniqueOrderIds = [...new Set(orderLines.map((l) => l.order.id))];
    const ordersBefore = await tx.order.findMany({
      where: { id: { in: uniqueOrderIds } },
      select: { id: true, price: true },
    });
    const priceBeforeById = new Map(
      ordersBefore.map((o) => [o.id, o.price?.toString() ?? null]),
    );

    // Execute stock movements.
    for (const action of actions) {
      const order = orderByLineId.get(action.orderLineId);
      const sourceName = action.restoreMaterialId
        ? (nameById.get(action.restoreMaterialId) ?? action.restoreMaterialId)
        : null;
      const note = sourceName
        ? `${sourceName} → ${target.name}`
        : `→ ${target.name}`;

      if (action.restoreMaterialId) {
        await restoreLfRollStock(
          tx,
          action.restoreMaterialId,
          action.linearMeters,
          {
            kind: LF_ROLL_STOCK_KIND.LAYOUT_TRANSFER_BACK,
            orderId: order?.id ?? null,
            orderNumber: order?.orderNumber ?? null,
            orderLineId: action.orderLineId,
            createdById: user.id,
            note,
          },
        );
      }

      await forceDeductLfRollStock(tx, targetMaterialId, action.linearMeters, {
        kind: LF_ROLL_STOCK_KIND.LAYOUT_TRANSFER_OUT,
        orderId: order?.id ?? null,
        orderNumber: order?.orderNumber ?? null,
        orderLineId: action.orderLineId,
        createdById: user.id,
        note,
      });
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

    const after = await tx.largeFormatMaterial.findUniqueOrThrow({
      where: { id: targetMaterialId },
      select: { stockLinearMeters: true },
    });
    return {
      movedCount: actions.length,
      skippedCount: skippedLineIds.length,
      targetStockAfterLm: Number(after.stockLinearMeters),
      negativeStock: Number(after.stockLinearMeters) < 0,
    };
  });

  return NextResponse.json(targetStockAfterLm);
}
