import type { TranslationDictionary } from "@/lib/i18n/types";

/** Client helpers for `/api/admin/stock/**`. */

export type StockApiErrorBody = {
  error?: string;
  skus?: string[];
  available?: number;
  details?: unknown;
};

export class StockRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: StockApiErrorBody,
  ) {
    super(body.error ?? `http_${status}`);
    this.name = "StockRequestError";
  }
}

export async function stockFetch<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as T & StockApiErrorBody;
  if (!res.ok) throw new StockRequestError(res.status, json);
  return json;
}

export const stockSwrFetcher = <T,>(url: string): Promise<T> => stockFetch<T>(url);

/** Human message for a failed stock request. */
export function stockErrorMessage(e: unknown, s: TranslationDictionary["stock"]): string {
  if (!(e instanceof StockRequestError)) return s.errorGeneric;
  switch (e.body.error) {
    case "sku_taken":
      return s.errorSkuTaken((e.body.skus ?? []).join(", "));
    case "code_taken":
      return s.errorCodeTaken;
    case "insufficient_stock":
      return s.errorInsufficientStock(String(e.body.available ?? 0));
    case "invalid_quantity":
      return s.errorInvalidQuantity;
    case "has_movements":
      return s.errorVariantHasMovements;
    case "last_variant":
      return s.errorLastVariant;
    case "receipt_from_invoice":
      return s.errorReceiptFromInvoice;
    case "unit_locked":
      return s.errorUnitLocked;
    case "validation_failed":
      return s.errorValidation;
    default:
      return s.errorGeneric;
  }
}

/** Upload a photo to the long-lived catalog bucket; returns the storage key. */
export async function uploadStockPhoto(file: File): Promise<string> {
  const urlRes = await fetch("/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: file.name,
      contentType: file.type || "image/jpeg",
      scope: "stockCatalog",
    }),
  });
  if (!urlRes.ok) throw new Error("upload_url");
  const { uploadUrl, fileKey } = (await urlRes.json()) as { uploadUrl: string; fileKey: string };
  const up = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!up.ok) throw new Error("upload_put");
  return fileKey;
}
