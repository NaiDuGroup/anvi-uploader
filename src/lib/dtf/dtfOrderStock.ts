import { Prisma } from "@prisma/client";
import { DtfConsumable, DtfStockKind } from "@/lib/dtf/dtfConstants";
import {
  consumeDtfConsumable,
  returnDtfConsumable,
} from "@/lib/dtf/dtfConsumableLedger";
import { recordGarmentReturn, tryRecordGarmentSale } from "@/lib/dtf/garmentStockLedger";
import type { DtfLineData } from "@/lib/dtf/types";
import { getOrCreateInkInventory, invalidateInkInventory } from "@/lib/ink/inkInventory";
import { INK_STOCK_KIND } from "@/lib/ink/inkStockKinds";
import { restoreInkMl } from "@/lib/largeFormat/lfRollStockLedger";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import type { PrintProcess } from "@/lib/printProcess";

type Tx = Prisma.TransactionClient;

const DTF_INK_TANK: PrintProcess = "dtf_textile";
const ORDER_KINDS: string[] = [DtfStockKind.OrderSale, DtfStockKind.OrderReturn];

export interface DtfOrderStockParams {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
}

function garmentLabel(data: DtfLineData, size: string): string {
  const g = data.garment;
  return g ? `${g.name} / ${g.colorName} / ${size}` : size;
}

/** DTF ink never blocks an order; the tank may go negative until the next receipt. */
async function consumeDtfInk(
  tx: Tx,
  inkMl: number,
  inkCostMdl: number,
  params: DtfOrderStockParams & { orderLineId: string },
): Promise<void> {
  if (!(inkMl > 0)) return;
  await getOrCreateInkInventory(tx, DTF_INK_TANK);
  await tx.inkInventory.update({
    where: { id: DTF_INK_TANK },
    data: { stockMl: { decrement: inkMl } },
  });
  invalidateInkInventory(DTF_INK_TANK);
  await tx.inkStockMovement.create({
    data: {
      inkInventoryId: DTF_INK_TANK,
      quantityMl: new Prisma.Decimal((-inkMl).toFixed(3)),
      kind: INK_STOCK_KIND.ORDER_SALE,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      orderLineId: params.orderLineId,
      inkCostMdl: Math.round(inkCostMdl),
      createdById: params.createdById,
    },
  });
}

/**
 * Take garments (per size) and consumables for one DTF line. Sizes that are
 * short stay untouched and are reported for procurement; film, powder and ink
 * are always consumed.
 */
export async function deductDtfLineStock(
  tx: Tx,
  data: DtfLineData,
  params: DtfOrderStockParams & { orderLineId: string },
): Promise<OrderProcurementMetaItem[]> {
  const issues: OrderProcurementMetaItem[] = [];
  const audit = {
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    orderLineId: params.orderLineId,
    createdById: params.createdById,
  };

  for (const size of data.sizes) {
    if (!size.garmentVariantId) continue;
    const res = await tryRecordGarmentSale(tx, size.garmentVariantId, size.quantity, audit);
    if (!res.deducted) {
      issues.push({
        kind: "garment",
        garmentVariantId: size.garmentVariantId,
        label: garmentLabel(data, size.size),
        requestedQty: res.requested,
        stockAtOrder: res.available,
      });
    }
  }

  await consumeDtfConsumable(tx, DtfConsumable.Film, data.consumption.filmLinearMeters, audit);
  await consumeDtfConsumable(tx, DtfConsumable.Powder, data.consumption.powderGrams, audit);
  await consumeDtfInk(tx, data.consumption.inkMl, data.costs.inkCostMdl, params);
  return issues;
}

/**
 * Put back everything the order's DTF lines still hold, netting the ledger
 * by order: only what was actually taken (minus earlier returns) comes back,
 * so short sizes and repeated edits stay consistent.
 */
export async function returnDtfStockForOrder(
  tx: Tx,
  params: DtfOrderStockParams,
): Promise<void> {
  const audit = { ...params, orderLineId: null };

  const garmentNet = await tx.garmentStockMovement.groupBy({
    by: ["garmentVariantId"],
    where: { orderId: params.orderId, kind: { in: ORDER_KINDS } },
    _sum: { delta: true },
  });
  for (const row of garmentNet) {
    const held: number = -(row._sum.delta ?? 0);
    if (held > 0) await recordGarmentReturn(tx, row.garmentVariantId, held, audit);
  }

  const consumableNet = await tx.dtfConsumableMovement.groupBy({
    by: ["consumableId"],
    where: { orderId: params.orderId, kind: { in: ORDER_KINDS } },
    _sum: { quantity: true },
  });
  for (const row of consumableNet) {
    const held: number = -Number(row._sum.quantity ?? 0);
    const consumable = row.consumableId as DtfConsumable;
    if (held > 1e-6) await returnDtfConsumable(tx, consumable, held, audit);
  }

  const inkNet = await tx.inkStockMovement.aggregate({
    where: {
      orderId: params.orderId,
      inkInventoryId: DTF_INK_TANK,
      kind: { in: [INK_STOCK_KIND.ORDER_SALE, INK_STOCK_KIND.ORDER_RETURN] },
    },
    _sum: { quantityMl: true },
  });
  const inkHeld: number = -Number(inkNet._sum.quantityMl ?? 0);
  if (inkHeld > 1e-6) {
    await restoreInkMl(tx, inkHeld, DTF_INK_TANK, {
      kind: INK_STOCK_KIND.ORDER_RETURN,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      createdById: params.createdById,
    });
  }
}
