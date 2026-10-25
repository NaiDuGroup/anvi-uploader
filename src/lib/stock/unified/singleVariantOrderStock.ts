import { FINISHED_ORDER_STATUSES } from "@/lib/validations";
import { Prisma } from "@prisma/client";
import {
  procurementMetaToJson,
  procurementMetaToList,
  type OrderProcurementMetaItem,
} from "@/lib/orderProcurement";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { consume, returnToStock } from "@/lib/stock/unified/ledger";
import {
  mapLegacyProductProcurementItems,
  singleVariantIdsByLegacyId,
  type LegacyProductProcurementKind,
} from "./singleVariantProduct";

/**
 * Order stock for single-variant catalog products (mugs, notebooks, pens) on
 * the unified ledger: take stock per order line, net what an order holds by
 * order (copies of legacy sales carry no `orderLineId`), put it back on
 * delete / edit, and fill waiting orders after a receipt.
 */

type Tx = Prisma.TransactionClient;

export type SingleVariantOrderStockConfig = {
  /** `OrderLine.productType` of the product's lines. */
  productType: string;
  /** Variants of the product's category. */
  variantWhere: Prisma.StockVariantWhereInput;
  /** Legacy procurement kind / `StockItem.legacyKind` of migrated products. */
  legacyKind: LegacyProductProcurementKind;
  /** Label prefix for mapped legacy procurement entries, e.g. «Кружка». */
  legacyLabelPrefix: string;
  /** Procurement label from the line snapshot. */
  label: (snapshot: unknown) => string;
  /** Pieces a line takes from stock, from its files. */
  quantityFromFiles: (files: readonly { copies: number }[]) => number;
};

export type SingleVariantOrderStockParams = {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
};

/** Movements that say how many pieces an order holds (net of returns). */
const ORDER_KINDS: string[] = [
  StockMovementKind.OrderSale,
  StockMovementKind.OrderReturn,
  StockMovementKind.ProcurementBacklog,
];

/**
 * Take pieces for one order line from the unified ledger (never below zero).
 * Returns a `stock_variant` procurement entry when stock is short — nothing
 * is taken then, the order waits for a receipt.
 */
export async function consumeSingleVariantLineStock(
  tx: Tx,
  cfg: SingleVariantOrderStockConfig,
  params: SingleVariantOrderStockParams & {
    variantId: string;
    quantity: number;
    orderLineId: string | null;
    snapshot: unknown;
  },
): Promise<OrderProcurementMetaItem | null> {
  if (!(params.quantity > 0)) return null;
  const res = await consume(tx, {
    variantId: params.variantId,
    quantity: params.quantity,
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    orderLineId: params.orderLineId,
    createdById: params.createdById,
  });
  if (res.consumed) return null;
  return {
    kind: "stock_variant",
    variantId: params.variantId,
    label: cfg.label(params.snapshot),
    requestedQty: res.requested,
    stockAtOrder: res.available,
  };
}

/**
 * Pieces the order still holds per variant of the product's category:
 * −Σ delta of its sale / return / backlog movements. Netted by order (not by
 * line) because sales copied from the legacy ledgers carry no `orderLineId`.
 */
export async function singleVariantStockHeldByOrder(
  tx: Tx,
  cfg: Pick<SingleVariantOrderStockConfig, "variantWhere">,
  orderId: string,
): Promise<Map<string, number>> {
  const rows = await tx.stockMovement.groupBy({
    by: ["variantId"],
    where: { orderId, kind: { in: ORDER_KINDS }, variant: cfg.variantWhere },
    _sum: { delta: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) {
    const held: number = -Number(r._sum.delta?.toString() ?? "0");
    if (held > 1e-6) out.set(r.variantId, held);
  }
  return out;
}

/**
 * Put back every piece the order still holds (delete, structure edit, restore
 * pre-settle). Only what the ledger says was taken comes back, so nothing is
 * returned twice and lines that waited for procurement return nothing.
 */
export async function returnSingleVariantStockForOrder(
  tx: Tx,
  cfg: SingleVariantOrderStockConfig,
  params: SingleVariantOrderStockParams,
): Promise<void> {
  const held: Map<string, number> = await singleVariantStockHeldByOrder(tx, cfg, params.orderId);
  if (held.size === 0) return;
  const lines = await tx.orderLine.findMany({
    where: { orderId: params.orderId, productType: cfg.productType, stockVariantId: { in: [...held.keys()] } },
    orderBy: { sortOrder: "asc" },
    select: { id: true, stockVariantId: true },
  });
  for (const [variantId, quantity] of held) {
    await returnToStock(tx, {
      variantId,
      quantity,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      // Informational only: netting is per order + variant.
      orderLineId: lines.find((l) => l.stockVariantId === variantId)?.id ?? null,
      createdById: params.createdById,
    });
  }
}

function isVariantEntryFor(variantId: string) {
  return (m: OrderProcurementMetaItem): boolean => m.kind === "stock_variant" && m.variantId === variantId;
}

/**
 * Procurement entries of an order with the product's legacy entries (keyed by
 * the old product id) rewritten as `stock_variant` entries.
 */
export async function singleVariantProcurementList(
  tx: Tx,
  cfg: Pick<SingleVariantOrderStockConfig, "legacyKind" | "legacyLabelPrefix">,
  procurementMeta: unknown,
): Promise<OrderProcurementMetaItem[]> {
  const rawList: OrderProcurementMetaItem[] = procurementMetaToList(procurementMeta);
  const legacyIds: string[] = rawList.flatMap((m) => (m.kind === cfg.legacyKind ? [m.productId] : []));
  if (legacyIds.length === 0) return rawList;
  return mapLegacyProductProcurementItems(
    rawList,
    cfg.legacyKind,
    await singleVariantIdsByLegacyId(tx, cfg.legacyKind, legacyIds),
    cfg.legacyLabelPrefix,
  );
}

/**
 * After a receipt of a variant, take stock for orders that waited for it (FIFO
 * by creation; stops at the first order that still cannot be covered). Legacy
 * procurement entries of the product kind are mapped to the variant via the legacy id.
 */
export async function allocateSingleVariantProcurementBacklog(
  tx: Tx,
  cfg: SingleVariantOrderStockConfig,
  params: { variantId: string; createdById: string | null },
): Promise<void> {
  const orders = await tx.order.findMany({
    where: {
      needsProcurement: true,
      deletedAt: null,
      status: { notIn: [...FINISHED_ORDER_STATUSES] },
      orderLines: { some: { productType: cfg.productType, stockVariantId: params.variantId } },
    },
    orderBy: { createdAt: "asc" },
    include: {
      orderLines: {
        where: { productType: cfg.productType, stockVariantId: params.variantId },
        orderBy: { sortOrder: "asc" },
        include: { files: { select: { copies: true } } },
      },
    },
  });

  for (const order of orders) {
    const list: OrderProcurementMetaItem[] = await singleVariantProcurementList(tx, cfg, order.procurementMeta);
    const waiting = isVariantEntryFor(params.variantId);
    if (!list.some(waiting)) continue;

    // Lines already holding stock (netted by order) are not taken again.
    const held: number = (await singleVariantStockHeldByOrder(tx, cfg, order.id)).get(params.variantId) ?? 0;
    const needed: number = order.orderLines.reduce((acc, l) => acc + cfg.quantityFromFiles(l.files), 0);
    const toTake: number = needed - held;
    if (toTake > 1e-6) {
      const res = await consume(tx, {
        variantId: params.variantId,
        quantity: toTake,
        orderId: order.id,
        orderNumber: order.orderNumber,
        orderLineId: order.orderLines[0]?.id ?? null,
        createdById: params.createdById,
      });
      if (!res.consumed) break;
    }

    const rest: OrderProcurementMetaItem[] = list.filter((m) => !waiting(m));
    await tx.order.update({
      where: { id: order.id },
      data:
        rest.length === 0
          ? { needsProcurement: false, procurementMeta: Prisma.JsonNull }
          : {
              needsProcurement: true,
              procurementMeta: procurementMetaToJson(rest.length === 1 ? rest[0]! : rest),
            },
    });
  }
}
