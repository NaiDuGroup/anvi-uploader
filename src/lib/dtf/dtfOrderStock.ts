import { Prisma } from "@prisma/client";
import type { DtfLineData } from "@/lib/dtf/types";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { StockMovementKind } from "@/lib/stock/unified/kinds";
import { consume, returnToStock } from "@/lib/stock/unified/ledger";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import {
  consumePrinterUse,
  PRINTER_CONSUMABLE_CATEGORY_CODES,
  returnPrinterConsumablesForOrder,
} from "@/lib/stock/unified/printers";

type Tx = Prisma.TransactionClient;

const GARMENT_ORDER_KINDS: string[] = [StockMovementKind.OrderSale, StockMovementKind.OrderReturn];
const DTF_PRODUCT_TYPE = "dtf_apparel";

export interface DtfOrderStockParams {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
}

function garmentLabel(data: DtfLineData, size: string): string {
  const g = data.garment;
  return g ? `${g.name} / ${g.colorName} / ${size}` : size;
}

/**
 * Take garments (per size, unified stock ledger) and consumables for one DTF
 * line. Sizes that are short stay untouched and are reported for procurement;
 * film, powder and ink come from the DTF printer's slots and never block.
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

  const variantIds: string[] = data.sizes.flatMap((s) => (s.garmentVariantId ? [s.garmentVariantId] : []));
  const known = new Set<string>(
    variantIds.length === 0
      ? []
      : (
          await tx.stockVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true } })
        ).map((v) => v.id),
  );
  for (const size of data.sizes) {
    if (!size.garmentVariantId || !(size.quantity > 0)) continue;
    const variantId: string = size.garmentVariantId;
    // A deleted variant (or a pre-unified garment id) cannot be taken: list it for procurement.
    const res = known.has(variantId)
      ? await consume(tx, { variantId, quantity: size.quantity, ...audit })
      : { consumed: false as const, variantId, requested: size.quantity, available: 0 };
    if (!res.consumed) {
      issues.push({
        kind: "stock_variant",
        variantId,
        label: garmentLabel(data, size.size),
        requestedQty: res.requested,
        stockAtOrder: res.available,
      });
    }
  }

  const printerUses: [PrinterSlotRole, number][] = [
    [PrinterSlotRole.Film, data.consumption.filmLinearMeters],
    [PrinterSlotRole.Powder, data.consumption.powderGrams],
    [PrinterSlotRole.Ink, data.consumption.inkMl],
  ];
  for (const [role, amount] of printerUses) {
    await consumePrinterUse(tx, { printerCode: PrinterCode.Dtf, role, amount, ...audit });
  }
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
  // Garments: unified movements of this order's DTF lines (other lines may use the same ledger).
  const dtfLineIds: string[] = (
    await tx.orderLine.findMany({
      where: { orderId: params.orderId, productType: DTF_PRODUCT_TYPE },
      select: { id: true },
    })
  ).map((l) => l.id);
  if (dtfLineIds.length > 0) {
    const garmentNet = await tx.stockMovement.groupBy({
      by: ["variantId", "orderLineId"],
      where: {
        orderId: params.orderId,
        orderLineId: { in: dtfLineIds },
        kind: { in: GARMENT_ORDER_KINDS },
        // Printer consumables of the same lines are settled below.
        variant: { item: { category: { code: { notIn: [...PRINTER_CONSUMABLE_CATEGORY_CODES] } } } },
      },
      _sum: { delta: true },
    });
    for (const row of garmentNet) {
      const held: number = -Number(row._sum.delta?.toString() ?? "0");
      if (held > 1e-6) {
        await returnToStock(tx, {
          variantId: row.variantId,
          quantity: held,
          orderId: params.orderId,
          orderNumber: params.orderNumber,
          orderLineId: row.orderLineId,
          createdById: params.createdById,
        });
      }
    }
  }

  // Film, powder and ink: whatever the order still holds in the unified ledger.
  await returnPrinterConsumablesForOrder(tx, params);
}
