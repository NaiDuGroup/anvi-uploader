import type { Prisma } from "@prisma/client";
import type { OrderProcurementMetaItem } from "@/lib/orderProcurement";
import {
  allocateSingleVariantProcurementBacklog,
  consumeSingleVariantLineStock,
  returnSingleVariantStockForOrder,
  singleVariantStockHeldByOrder,
  type SingleVariantOrderStockConfig,
  type SingleVariantOrderStockParams,
} from "@/lib/stock/unified/singleVariantOrderStock";
import { penOrderStockQuantityFromFiles } from "./penOrderStockQuantity";
import { parsePenProductSnapshot } from "./penProductSnapshot";
import { PEN_PRODUCT_TYPE, penProcurementLabel } from "./penProcurement";
import { PEN_LEGACY_KIND, PEN_VARIANT_WHERE } from "./penVariant";

type Tx = Prisma.TransactionClient;

/** Pen order stock on the unified ledger (shared single-variant product logic). */
export const PEN_ORDER_STOCK: SingleVariantOrderStockConfig = {
  productType: PEN_PRODUCT_TYPE,
  variantWhere: PEN_VARIANT_WHERE,
  legacyKind: PEN_LEGACY_KIND,
  legacyLabelPrefix: "Ручка",
  label: (snapshot) => penProcurementLabel(parsePenProductSnapshot(snapshot)),
  quantityFromFiles: penOrderStockQuantityFromFiles,
};

export type PenOrderStockParams = SingleVariantOrderStockParams;

/**
 * Take pens for one order line from the unified ledger (never below zero).
 * Returns a `stock_variant` procurement entry when stock is short — nothing
 * is taken then, the order waits for a receipt.
 */
export async function consumePenLineStock(
  tx: Tx,
  params: PenOrderStockParams & {
    variantId: string;
    quantity: number;
    orderLineId: string | null;
    snapshot: unknown;
  },
): Promise<OrderProcurementMetaItem | null> {
  return consumeSingleVariantLineStock(tx, PEN_ORDER_STOCK, params);
}

/** Pens the order still holds per variant (netted by order, see the shared helper). */
export async function penStockHeldByOrder(tx: Tx, orderId: string): Promise<Map<string, number>> {
  return singleVariantStockHeldByOrder(tx, PEN_ORDER_STOCK, orderId);
}

/** Put back every pen the order still holds (delete, structure edit, restore pre-settle). */
export async function returnPenStockForOrder(tx: Tx, params: PenOrderStockParams): Promise<void> {
  return returnSingleVariantStockForOrder(tx, PEN_ORDER_STOCK, params);
}

/**
 * After a receipt of a pen variant, take stock for orders that waited for it
 * (FIFO). Legacy `pen` procurement entries are mapped via the legacy id.
 */
export async function allocatePenVariantProcurementBacklog(
  tx: Tx,
  params: { variantId: string; createdById: string | null },
): Promise<void> {
  return allocateSingleVariantProcurementBacklog(tx, PEN_ORDER_STOCK, params);
}
