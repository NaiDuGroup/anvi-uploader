import type { Prisma } from "@prisma/client";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { ORDER_HOLDING_KINDS } from "@/lib/stock/unified/kinds";
import { consume, returnToStock } from "@/lib/stock/unified/ledger";
import { giftSetExtraStockSkus, parseOrderLineSetData } from "./giftSet";

/**
 * Set boxes on the unified ledger, like the roll-up stands: taken by SKU when
 * the box is a stock item, never below zero (short → procurement entry), and
 * returned net of what the order still holds.
 */

type Tx = Prisma.TransactionClient;

/** Box of a set line, N per set (never below zero; short → procurement entry). Nothing when the SKU is not in stock. */
export async function takeGiftSetBoxStock(
  tx: Tx,
  params: {
    boxSku: string;
    quantity: number;
    orderId: string;
    orderNumber: number | null;
    orderLineId: string;
    createdById: string | null;
  },
): Promise<OrderProcurementMetaItem | null> {
  if (!(params.quantity > 0)) return null;
  const variant = await tx.stockVariant.findUnique({
    where: { sku: params.boxSku },
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

/** Put back every set box the order still holds (delete, structure edit, restore). */
export async function returnGiftSetBoxStockForOrder(
  tx: Tx,
  params: { orderId: string; orderNumber: number | null; createdById: string | null },
): Promise<void> {
  const lines = await tx.orderLine.findMany({
    where: { orderId: params.orderId, setGroupId: { not: null } },
    select: { setData: true },
  });
  const skus = [...new Set(lines.flatMap((l) => giftSetExtraStockSkus(parseOrderLineSetData(l.setData))))];
  if (skus.length === 0) return;
  const rows = await tx.stockMovement.groupBy({
    by: ["variantId", "orderLineId"],
    where: { orderId: params.orderId, kind: { in: [...ORDER_HOLDING_KINDS] }, variant: { sku: { in: skus } } },
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


/**
 * Box / ready set item of a stored set line (restore from trash: the lines are read back from
 * the database, not resolved). `boxSku` sits on the set's box line (older orders: on the
 * group's first line), so each set's box is taken once either way.
 */
export async function takeGiftSetBoxStockForStoredLine(
  tx: Tx,
  line: { id: string; setGroupId: string | null; setData: unknown },
  params: { orderId: string; orderNumber: number | null; createdById: string | null },
): Promise<OrderProcurementMetaItem[]> {
  if (!line.setGroupId) return [];
  const set = parseOrderLineSetData(line.setData);
  const issues: OrderProcurementMetaItem[] = [];
  for (const sku of giftSetExtraStockSkus(set)) {
    const res = await takeGiftSetBoxStock(tx, {
      boxSku: sku,
      quantity: set!.quantity,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      orderLineId: line.id,
      createdById: params.createdById,
    });
    if (res) issues.push(res);
  }
  return issues;
}
