import type { TranslationDictionary } from "@/lib/i18n/types";
import type { CatalogStockMovementItem } from "@/lib/stock/catalogStockReceiptSchema";

/** Piece-counted catalogs that share the detailed receipt flow. */
export enum CatalogStockKind {
  Mug = "mug",
  Notebook = "notebook",
  Pen = "pen",
}

export type CatalogStockEndpoints = {
  receiptUrl: string;
  receiptsUrl: (productId: string) => string;
  movementsUrl: (productId: string) => string;
};

export function catalogStockEndpoints(kind: CatalogStockKind): CatalogStockEndpoints {
  return {
    receiptUrl: `/api/admin/${kind}-stock/receipt`,
    receiptsUrl: (productId: string): string =>
      `/api/admin/${kind}-products/${productId}/receipts`,
    movementsUrl: (productId: string): string =>
      `/api/admin/${kind}-products/${productId}/stock-movements`,
  };
}

/** Minimal SKU shape the receipt modals need; each catalog maps its row onto it. */
export type CatalogStockProduct = {
  id: string;
  sku: string;
  name: string;
  stockQuantity: number;
  avgPurchaseCost: number | null;
  purchaseCost: number | null;
};

/** `StockMovement.kind` values with their own label in the catalog history. */
const MOVEMENT_KIND = {
  ORDER_SALE: "ORDER_SALE",
  ORDER_RETURN: "ORDER_RETURN",
  RECEIPT: "RECEIPT",
} as const;

export function isReceiptMovement(movement: CatalogStockMovementItem): boolean {
  return movement.kind === MOVEMENT_KIND.RECEIPT;
}

export function catalogStockMovementLabel(
  movement: CatalogStockMovementItem,
  lf: TranslationDictionary["admin"],
): string {
  switch (movement.kind) {
    case MOVEMENT_KIND.ORDER_SALE:
      return lf.catalogStockMovementSale(movement.orderNumber ?? 0);
    case MOVEMENT_KIND.ORDER_RETURN:
      return lf.catalogStockMovementReturn;
    case MOVEMENT_KIND.RECEIPT:
      return lf.catalogStockMovementReceipt;
    default:
      return lf.catalogStockMovementAdjust;
  }
}

export function dateLocaleFor(locale: string): string {
  return locale === "ro" ? "ro-RO" : locale === "ru" ? "ru-RU" : "en-US";
}

export function formatStockDate(iso: string, dateLoc: string): string {
  const normalized: string = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(dateLoc, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
