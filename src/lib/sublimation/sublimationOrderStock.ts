import type { Prisma } from "@prisma/client";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import { sublimationNormFor } from "@/lib/printMethods/sublimationSettings";
import { consume } from "@/lib/stock/unified/ledger";
import { PrinterCode, PrinterSlotRole } from "@/lib/stock/unified/printerMath";
import { consumePrinterUse, returnPrinterConsumablesForOrder } from "@/lib/stock/unified/printers";
import { loadSublimationSettings } from "@/lib/sublimation/resolveSublimationLine";
import { MUGS_CATEGORY_CODE, SUBLIMATION_PRODUCT_TYPE } from "@/lib/sublimation/sublimationConstants";
import { computeSublimationConsumption, isZeroSublimationConsumption } from "@/lib/sublimation/sublimationLineCalc";
import type { SublimationConsumption, SublimationLineData } from "@/lib/sublimation/types";
import { returnPrintLineItemsForOrder } from "@/lib/uv/uvOrderStock";

type Tx = Prisma.TransactionClient;

export interface SublimationOrderStockParams {
  orderId: string;
  orderNumber: number | null;
  createdById: string | null;
}

type Audit = SublimationOrderStockParams & { orderLineId: string | null };

/** Epson L1800 uses of one line: paper (sheets), tape (m), ink (ml over the six ink slots by share). */
export function sublimationPrinterUses(
  consumption: SublimationConsumption,
): { role: PrinterSlotRole.Paper | PrinterSlotRole.Tape | PrinterSlotRole.Ink; amount: number }[] {
  return [
    { role: PrinterSlotRole.Paper, amount: consumption.paperSheets },
    { role: PrinterSlotRole.Tape, amount: consumption.tapeM },
    { role: PrinterSlotRole.Ink, amount: consumption.inkMl },
  ].filter((u) => u.amount > 0) as {
    role: PrinterSlotRole.Paper | PrinterSlotRole.Tape | PrinterSlotRole.Ink;
    amount: number;
  }[];
}

/**
 * Write off the Epson L1800 paper, tape and ink of one printed line. Printer
 * consumables never block an order (balances may go below zero); zero norms
 * write nothing.
 */
export async function consumeSublimationPrint(tx: Tx, consumption: SublimationConsumption, audit: Audit): Promise<void> {
  for (const use of sublimationPrinterUses(consumption)) {
    await consumePrinterUse(tx, { printerCode: PrinterCode.Sublimation, ...use, ...audit });
  }
}

function itemLabel(data: SublimationLineData): string {
  return [data.item.name, data.item.variantLabel].filter((p) => p).join(" / ");
}

/**
 * Take the blank (unified ledger, never below zero) and the Epson consumables
 * for one line (frozen in the snapshot when the line was priced). A short blank
 * stays untouched and is reported for procurement; consumables never block.
 */
export async function deductSublimationLineStock(
  tx: Tx,
  data: SublimationLineData,
  params: SublimationOrderStockParams & { orderLineId: string },
): Promise<OrderProcurementMetaItem[]> {
  const issues: OrderProcurementMetaItem[] = [];
  const audit: Audit = {
    orderId: params.orderId,
    orderNumber: params.orderNumber,
    orderLineId: params.orderLineId,
    createdById: params.createdById,
  };
  if (data.quantity > 0) {
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
  await consumeSublimationPrint(tx, data.consumption, audit);
  return issues;
}

/**
 * Put back the blanks the order's sublimation lines took and every printer
 * consumable the order still holds — netted by order, so delete / edit /
 * restore never return twice (mug lines are settled by the mug path the same way).
 */
export async function returnSublimationStockForOrder(tx: Tx, params: SublimationOrderStockParams): Promise<void> {
  await returnPrintLineItemsForOrder(tx, params, SUBLIMATION_PRODUCT_TYPE);
  await returnPrinterConsumablesForOrder(tx, params);
}

/**
 * Epson L1800 use of a «Кружка» line: the `mugs` category norm × mugs × (1 +
 * waste), from the current norms. Returned (netted by order) with the other
 * printer consumables on delete / edit / restore.
 */
export async function consumeMugPrintStock(
  tx: Tx,
  params: Audit & { quantity: number },
): Promise<SublimationConsumption> {
  if (!(params.quantity > 0)) return { paperSheets: 0, tapeM: 0, inkMl: 0 };
  const settings = await loadSublimationSettings(tx);
  const consumption: SublimationConsumption = computeSublimationConsumption(
    sublimationNormFor(settings, MUGS_CATEGORY_CODE),
    params.quantity,
    settings.wastePct,
  );
  if (!isZeroSublimationConsumption(consumption)) {
    await consumeSublimationPrint(tx, consumption, {
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      orderLineId: params.orderLineId,
      createdById: params.createdById,
    });
  }
  return consumption;
}
