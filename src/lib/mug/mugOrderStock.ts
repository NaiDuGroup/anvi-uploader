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
import { mugOrderStockQuantityFromFiles } from "./mugOrderStockQuantity";
import { parseMugProductSnapshot } from "./mugProductSnapshot";
import { MUG_PRODUCT_TYPE, mugProcurementLabel } from "./mugProcurement";
import { MUG_LEGACY_KIND, MUG_VARIANT_WHERE } from "./mugVariant";

type Tx = Prisma.TransactionClient;

/** Mug order stock on the unified ledger (shared single-variant product logic). */
export const MUG_ORDER_STOCK: SingleVariantOrderStockConfig = {
  productType: MUG_PRODUCT_TYPE,
  variantWhere: MUG_VARIANT_WHERE,
  legacyKind: MUG_LEGACY_KIND,
  legacyLabelPrefix: "Кружка",
  label: (snapshot) => mugProcurementLabel(parseMugProductSnapshot(snapshot)),
  quantityFromFiles: mugOrderStockQuantityFromFiles,
};

export type MugOrderStockParams = SingleVariantOrderStockParams;

/**
 * Take mugs for one order line from the unified ledger (never below zero).
 * Returns a `stock_variant` procurement entry when stock is short — nothing
 * is taken then, the order waits for a receipt.
 */
export async function consumeMugLineStock(
  tx: Tx,
  params: MugOrderStockParams & {
    variantId: string;
    quantity: number;
    orderLineId: string | null;
    snapshot: unknown;
  },
): Promise<OrderProcurementMetaItem | null> {
  return consumeSingleVariantLineStock(tx, MUG_ORDER_STOCK, params);
}

/**
 * Mugs the order still holds per variant: −Σ delta of its sale / return /
 * backlog movements. Netted by order (not by line) because mug sales copied
 * from the legacy ledger carry no `orderLineId`.
 */
export async function mugStockHeldByOrder(tx: Tx, orderId: string): Promise<Map<string, number>> {
  return singleVariantStockHeldByOrder(tx, MUG_ORDER_STOCK, orderId);
}

/**
 * Put back every mug the order still holds (delete, structure edit, restore
 * pre-settle). Only what the ledger says was taken comes back.
 */
export async function returnMugStockForOrder(tx: Tx, params: MugOrderStockParams): Promise<void> {
  return returnSingleVariantStockForOrder(tx, MUG_ORDER_STOCK, params);
}

/**
 * After a receipt of a mug variant, take stock for orders that waited for it
 * (FIFO by creation; stops at the first order that still cannot be covered).
 * Legacy `mug` procurement entries (orders that waited before the switch) are
 * mapped to the variant via the legacy id.
 */
export async function allocateMugVariantProcurementBacklog(
  tx: Tx,
  params: { variantId: string; createdById: string | null },
): Promise<void> {
  return allocateSingleVariantProcurementBacklog(tx, MUG_ORDER_STOCK, params);
}
