import type { TranslationDictionary } from "@/lib/i18n/types";

/**
 * Label of an order-related stock movement; other unified kinds (stocktake,
 * receipt cancel…) fall back to `stock.movementKinds` when given.
 */
export function stockConsumptionKindLabel(
  kind: string,
  admin: TranslationDictionary["admin"],
  stock?: TranslationDictionary["stock"],
): string {
  switch (kind) {
    case "ORDER_SALE":
      return admin.stockConsumptionKindOrderSale;
    case "ORDER_RETURN":
      return admin.stockConsumptionKindOrderReturn;
    case "PROCUREMENT_BACKLOG":
      return admin.stockConsumptionKindProcurementBacklog;
    case "LAYOUT_TRANSFER_OUT":
      return admin.stockConsumptionKindLayoutTransferOut;
    case "LAYOUT_TRANSFER_BACK":
      return admin.stockConsumptionKindLayoutTransferBack;
    default:
      return (stock?.movementKinds as Record<string, string> | undefined)?.[kind] ?? kind;
  }
}
