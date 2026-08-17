import type { TranslationDictionary } from "@/lib/i18n/types";

export function stockConsumptionKindLabel(
  kind: string,
  admin: TranslationDictionary["admin"],
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
      return kind;
  }
}
