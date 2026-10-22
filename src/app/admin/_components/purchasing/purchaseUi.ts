import type { TranslationDictionary } from "@/lib/i18n/types";
import { isPrintProcess, type PrintProcess } from "@/lib/printProcess";
import {
  isPostableKind,
  STOCK_TARGET_UNIT,
  StockTargetKind,
  type StockTargetOption,
} from "@/lib/purchasing/types";

export const PURCHASE_API = {
  list: "/api/admin/purchase-invoices",
  detail: (id: string): string => `/api/admin/purchase-invoices/${id}`,
  postLine: (id: string, lineId: string): string =>
    `/api/admin/purchase-invoices/${id}/lines/${lineId}`,
  mappings: "/api/admin/supplier-mappings",
  mapping: (id: string): string => `/api/admin/supplier-mappings/${id}`,
} as const;

/** Auto-sync from the page when the last e-Factura check is older than this. */
export const STALE_SYNC_MS = 60 * 60 * 1000;

function printProcessLabel(p: PrintProcess, admin: TranslationDictionary["admin"]): string {
  switch (p) {
    case "large_format_roll":
      return admin.printProcessLargeFormatRoll;
    case "uv_rigid":
      return admin.printProcessUvRigid;
    case "dtf_textile":
      return admin.printProcessDtfTextile;
  }
}

/** Display name for a stock target (ink tanks are named by print process). */
export function targetDisplayName(
  kind: StockTargetKind,
  targetId: string | null,
  fallbackName: string | null,
  t: TranslationDictionary,
): string {
  if (kind === StockTargetKind.Ink && targetId && isPrintProcess(targetId)) {
    return `${t.purchases.kinds.ink} · ${printProcessLabel(targetId, t.admin)}`;
  }
  return fallbackName ?? t.purchases.unknownTarget;
}

export function optionLabel(option: StockTargetOption, t: TranslationDictionary): string {
  return targetDisplayName(option.kind, option.id, option.name, t);
}

export function stockUnitLabel(kind: StockTargetKind, t: TranslationDictionary): string {
  return isPostableKind(kind) ? t.purchases.stockUnits[STOCK_TARGET_UNIT[kind]] : "";
}

export function formatMdl(value: number, locale: string): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatQty(value: number, locale: string): string {
  return value.toLocaleString(locale, { maximumFractionDigits: 3 });
}

export function formatDate(iso: string | null, locale: string): string {
  return iso ? new Date(iso).toLocaleDateString(locale) : "—";
}

export function formatDateTime(iso: string, locale: string): string {
  return new Date(iso).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" });
}

export async function readApiError(res: Response): Promise<string | null> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
      return body.error;
    }
  } catch {
    /* non-JSON error body */
  }
  return null;
}
