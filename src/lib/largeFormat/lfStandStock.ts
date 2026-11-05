import type { Prisma } from "@prisma/client";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { ORDER_HOLDING_KINDS } from "@/lib/stock/unified/kinds";
import { consume, returnToStock } from "@/lib/stock/unified/ledger";
import { LF_STAND_SKUS } from "./lfKits";

/**
 * Roll-up / X-banner stands on the unified ledger. A stand is taken only when
 * a stock variant with the kit's `standSku` exists (the studio adds the
 * stands to stock as items with these SKUs); until then the set sells and
 * nothing is taken. Never below zero: a short stand goes to procurement like
 * any stock item, and returns net what the order still holds by order.
 */

type Tx = Prisma.TransactionClient;

interface OrderRef {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
}

export async function takeLfStandStock(
  tx: Tx,
  params: OrderRef & { standSku: string; quantity: number; orderLineId: string },
): Promise<OrderProcurementMetaItem | null> {
  if (!(params.quantity > 0)) return null;
  const variant = await tx.stockVariant.findUnique({
    where: { sku: params.standSku },
    select: { id: true, label: true, item: { select: { nameRu: true } } },
  });
  if (!variant) return null;
  const res = await consume(tx, {
    variantId: variant.id,
    quantity: params.quantity,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    orderLineId: params.orderLineId,
    createdById: params.createdById,
  });
  if (res.consumed) return null;
  return {
    kind: "stock_variant",
    variantId: variant.id,
    label: [variant.item.nameRu, variant.label].filter(Boolean).join(" / "),
    requestedQty: res.requested,
    stockAtOrder: res.available,
  };
}

/** Put back every stand the order still holds (delete, structure edit, restore). */
export async function returnLfStandStockForOrder(tx: Tx, params: OrderRef): Promise<void> {
  const rows = await tx.stockMovement.groupBy({
    by: ["variantId", "orderLineId"],
    where: {
      orderId: params.orderId,
      kind: { in: [...ORDER_HOLDING_KINDS] },
      variant: { sku: { in: [...LF_STAND_SKUS] } },
    },
    _sum: { delta: true },
  });
  for (const r of rows) {
    const held: number = -Number(r._sum.delta?.toString() ?? "0");
    if (!(held > 1e-6)) continue;
    await returnToStock(tx, {
      variantId: r.variantId,
      quantity: held,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      orderLineId: r.orderLineId,
      createdById: params.createdById,
    });
  }
}
