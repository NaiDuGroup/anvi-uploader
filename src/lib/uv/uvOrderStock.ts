import type { Prisma } from "@prisma/client";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { consume, returnToStock } from "@/lib/stock/unified/ledger";
import { PrinterCode, type InkPart } from "@/lib/stock/unified/printerMath";
import {
  consumePrinterInkBySlot,
  PRINTER_CONSUMABLE_CATEGORY_CODES,
  returnPrinterConsumablesForOrder,
} from "@/lib/stock/unified/printers";
import { UV_INK_SLOT_LABELS, UV_PRIMER_SKU, UV_PRODUCT_TYPE } from "@/lib/uv/uvConstants";
import type { UvConsumption, UvLineData } from "@/lib/uv/types";

type Tx = Prisma.TransactionClient;

const ITEM_ORDER_KINDS: string[] = [
  StockMovementKind.OrderSale,
  StockMovementKind.OrderReturn,
  StockMovementKind.ProcurementBacklog,
];

export interface UvOrderStockParams {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
}

/** Ml per UV head group: CMYK over the four colour slots, white and varnish from their slot. */
export function uvInkParts(consumption: UvConsumption): InkPart[] {
  return [
    { labels: UV_INK_SLOT_LABELS.cmyk, amount: consumption.cmykMl },
    { labels: UV_INK_SLOT_LABELS.white, amount: consumption.whiteMl },
    { labels: UV_INK_SLOT_LABELS.varnish, amount: consumption.varnishMl },
  ];
}

/**
 * Primer is wiped on by hand, not loaded in a printer slot: take it straight
 * from the `UV_PRIMER_SKU` variant. Like ink it never blocks the order (the
 * balance may go below zero → «докупить»); it lives in the «ink» category, so
 * order returns put it back with the other printer consumables.
 */
async function consumeUvPrimer(
  tx: Tx,
  ml: number,
  audit: { orderId: string; orderNumber: number | null; orderLineId: string; createdById: string | null },
): Promise<void> {
  if (!(ml > 0)) return;
  const primer = await tx.stockVariant.findUnique({ where: { sku: UV_PRIMER_SKU }, select: { id: true } });
  if (!primer) return;
  await consume(tx, { variantId: primer.id, quantity: ml, allowNegative: true, ...audit });
}

function itemLabel(data: UvLineData): string {
  const i = data.item;
  if (!i) return "UV";
  return [i.name, i.variantLabel].filter((p) => p).join(" / ");
}

/**
 * Take the stock item (unified ledger, never below zero), UV ink and primer for
 * one line. A short item stays untouched and is reported for procurement; ink
 * comes from the UV printer's slots, primer from its stock variant, and neither
 * blocks. Client items take ink and primer only.
 */
export async function deductUvLineStock(
  tx: Tx,
  data: UvLineData,
  params: UvOrderStockParams & { orderLineId: string },
): Promise<OrderProcurementMetaItem[]> {
  const issues: OrderProcurementMetaItem[] = [];
  const audit = {
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    orderLineId: params.orderLineId,
    createdById: params.createdById,
  };

  if (data.source === "stock" && data.item && data.quantity > 0) {
    const variantId: string = data.item.variantId;
    const exists = await tx.stockVariant.findUnique({ where: { id: variantId }, select: { id: true } });
    // A deleted variant cannot be taken: list it for procurement.
    const res = exists
      ? await consume(tx, { variantId, quantity: data.quantity, ...audit })
      : { consumed: false as const, variantId, requested: data.quantity, available: 0 };
    if (!res.consumed) {
      issues.push({
        kind: "stock_variant",
        variantId,
        label: itemLabel(data),
        requestedQty: res.requested,
        stockAtOrder: res.available,
      });
    }
  }

  await consumePrinterInkBySlot(tx, { printerCode: PrinterCode.Uv, parts: uvInkParts(data.consumption), ...audit });
  await consumeUvPrimer(tx, data.consumption.primerMl ?? 0, audit);
  return issues;
}

/**
 * Put back the stock items (not printer consumables) the order's lines of
 * `productType` took, netted by order + variant: only what the order still
 * holds of those variants comes back, so other return paths that net the same
 * variants by order (mugs, pens, notebooks) never cause a double return.
 * Shared by UV and sublimation lines.
 */
export async function returnPrintLineItemsForOrder(
  tx: Tx,
  params: UvOrderStockParams,
  productType: string,
): Promise<void> {
  const lineIds: string[] = (
    await tx.orderLine.findMany({
      where: { orderId: params.orderId, productType },
      orderBy: { sortOrder: "asc" },
      select: { id: true },
    })
  ).map((l) => l.id);
  if (lineIds.length > 0) {
    // Variants the lines ever took (printer consumables are settled separately), with the line that took them.
    const taken = await tx.stockMovement.groupBy({
      by: ["variantId", "orderLineId"],
      where: {
        orderId: params.orderId,
        orderLineId: { in: lineIds },
        kind: { in: ITEM_ORDER_KINDS },
        variant: { item: { category: { code: { notIn: [...PRINTER_CONSUMABLE_CATEGORY_CODES] } } } },
      },
      _sum: { delta: true },
    });
    const lineByVariant = new Map<string, string | null>();
    for (const row of taken) {
      if (!lineByVariant.has(row.variantId)) lineByVariant.set(row.variantId, row.orderLineId);
    }
    if (lineByVariant.size > 0) {
      const held = await tx.stockMovement.groupBy({
        by: ["variantId"],
        where: { orderId: params.orderId, variantId: { in: [...lineByVariant.keys()] }, kind: { in: ITEM_ORDER_KINDS } },
        _sum: { delta: true },
      });
      for (const row of held) {
        const outstanding: number = -Number(row._sum.delta?.toString() ?? "0");
        if (outstanding > 1e-6) {
          await returnToStock(tx, {
            variantId: row.variantId,
            quantity: outstanding,
            orderId: params.orderId,
            orderNumber: params.orderNumber,
            orderLineId: lineByVariant.get(row.variantId) ?? null,
            createdById: params.createdById,
          });
        }
      }
    }
  }
}

/**
 * Put back every stock item the order's UV lines took, netting the ledger by
 * order + variant (like mugs / pens / notebooks): only what the order still
 * holds of those variants comes back. UV items live in categories other return
 * paths also settle (pens, notebooks), and those paths net by order too, so
 * whichever runs first returns the pieces and the other finds nothing — no
 * double returns, whatever the call order on delete / edit / restore.
 */
export async function returnUvStockForOrder(tx: Tx, params: UvOrderStockParams): Promise<void> {
  await returnPrintLineItemsForOrder(tx, params, UV_PRODUCT_TYPE);
  // UV ink and varnish: whatever the order still holds in the unified ledger.
  await returnPrinterConsumablesForOrder(tx, params);
}
