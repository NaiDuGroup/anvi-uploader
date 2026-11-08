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
 * the database, not resolved). `boxSku` sits on the set's stock line (A/B box, C set item);
 * older orders carry it on the group's first line (A/B `boxSku`, C v2 `setItemSku`), so each
 * set's unit is taken once either way.
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

/** What one set of a saved order holds of one stock variant (ledger, net of returns). */
export interface GiftSetStockHeld {
  setGroupId: string;
  variantId: string;
  sku: string;
  quantity: number;
}

/**
 * Units each set of the order actually holds, per stock variant, from the
 * ledger (write-offs net of returns): the wizard's edit mode adds back only
 * these, not the ordered quantity (a set saved short → «Закупка» holds 0).
 */
export async function giftSetStockHeldForOrder(
  db: Pick<Prisma.TransactionClient, "orderLine" | "stockMovement" | "stockVariant">,
  orderId: string,
): Promise<GiftSetStockHeld[]> {
  const lines = await db.orderLine.findMany({
    where: { orderId, setGroupId: { not: null } },
    select: { id: true, setGroupId: true, stockVariantId: true, setData: true },
  });
  if (lines.length === 0) return [];
  const groupByLine = new Map(lines.map((l) => [l.id, l.setGroupId!]));
  // Only the set's items (components, box, set item) — not the inks the print lines use.
  const variantIds = lines.map((l) => l.stockVariantId).filter((x): x is string => Boolean(x));
  const skus = [...new Set(lines.flatMap((l) => giftSetExtraStockSkus(parseOrderLineSetData(l.setData))))];
  const rows = await db.stockMovement.groupBy({
    by: ["variantId", "orderLineId"],
    where: {
      orderId,
      orderLineId: { in: [...groupByLine.keys()] },
      kind: { in: [...ORDER_HOLDING_KINDS] },
      OR: [{ variantId: { in: variantIds } }, { variant: { sku: { in: skus } } }],
    },
    _sum: { delta: true },
  });
  const sums = new Map<string, GiftSetStockHeld>();
  for (const r of rows) {
    const groupId = r.orderLineId ? groupByLine.get(r.orderLineId) : undefined;
    if (!groupId) continue;
    const held: number = -Number(r._sum.delta?.toString() ?? "0");
    const key = `${groupId}\u0000${r.variantId}`;
    const prev = sums.get(key);
    if (prev) prev.quantity += held;
    else sums.set(key, { setGroupId: groupId, variantId: r.variantId, sku: "", quantity: held });
  }
  const out = [...sums.values()].filter((x) => x.quantity > 1e-6);
  if (out.length === 0) return [];
  const variants = await db.stockVariant.findMany({
    where: { id: { in: [...new Set(out.map((x) => x.variantId))] } },
    select: { id: true, sku: true },
  });
  const skuById = new Map(variants.map((v) => [v.id, v.sku]));
  for (const x of out) x.sku = skuById.get(x.variantId) ?? "";
  return out;
}
