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
import { notebookOrderStockQuantityFromFiles } from "./notebookOrderStockQuantity";
import { parseNotebookProductSnapshot } from "./notebookProductSnapshot";
import { NOTEBOOK_PRODUCT_TYPE, notebookProcurementLabel } from "./notebookProcurement";
import { NOTEBOOK_LEGACY_KIND, NOTEBOOK_VARIANT_WHERE } from "./notebookVariant";

type Tx = Prisma.TransactionClient;

/** Notebook order stock on the unified ledger (shared single-variant product logic). */
export const NOTEBOOK_ORDER_STOCK: SingleVariantOrderStockConfig = {
  productType: NOTEBOOK_PRODUCT_TYPE,
  variantWhere: NOTEBOOK_VARIANT_WHERE,
  legacyKind: NOTEBOOK_LEGACY_KIND,
  legacyLabelPrefix: "Блокнот",
  label: (snapshot) => notebookProcurementLabel(parseNotebookProductSnapshot(snapshot)),
  quantityFromFiles: notebookOrderStockQuantityFromFiles,
};

export type NotebookOrderStockParams = SingleVariantOrderStockParams;

/**
 * Take notebooks for one order line from the unified ledger (never below zero).
 * Returns a `stock_variant` procurement entry when stock is short — nothing
 * is taken then, the order waits for a receipt.
 */
export async function consumeNotebookLineStock(
  tx: Tx,
  params: NotebookOrderStockParams & {
    variantId: string;
    quantity: number;
    orderLineId: string | null;
    snapshot: unknown;
  },
): Promise<OrderProcurementMetaItem | null> {
  return consumeSingleVariantLineStock(tx, NOTEBOOK_ORDER_STOCK, params);
}

/** Notebooks the order still holds per variant (netted by order, see the shared helper). */
export async function notebookStockHeldByOrder(tx: Tx, orderId: string): Promise<Map<string, number>> {
  return singleVariantStockHeldByOrder(tx, NOTEBOOK_ORDER_STOCK, orderId);
}

/** Put back every notebook the order still holds (delete, structure edit, restore pre-settle). */
export async function returnNotebookStockForOrder(tx: Tx, params: NotebookOrderStockParams): Promise<void> {
  return returnSingleVariantStockForOrder(tx, NOTEBOOK_ORDER_STOCK, params);
}

/**
 * After a receipt of a notebook variant, take stock for orders that waited for
 * it (FIFO). Legacy `notebook` procurement entries are mapped via the legacy id.
 */
export async function allocateNotebookVariantProcurementBacklog(
  tx: Tx,
  params: { variantId: string; createdById: string | null },
): Promise<void> {
  return allocateSingleVariantProcurementBacklog(tx, NOTEBOOK_ORDER_STOCK, params);
}
