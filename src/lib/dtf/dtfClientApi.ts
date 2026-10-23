import type { DtfConsumableJson, DtfPresetJson, GarmentProductJson } from "@/lib/dtf/dtfDto";
import { isDtfErrorCode } from "@/lib/dtf/dtfErrors";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import type { TranslationDictionary } from "@/lib/i18n/types";

export const DTF_API = {
  garments: "/api/admin/dtf/garments",
  garment: (id: string): string => `/api/admin/dtf/garments/${id}`,
  garmentReceipt: "/api/admin/dtf/garments/receipt",
  consumables: "/api/admin/dtf/consumables",
  consumableReceipt: "/api/admin/dtf/consumables/receipt",
  presets: "/api/admin/dtf/presets",
  preset: (id: string): string => `/api/admin/dtf/presets/${id}`,
  settings: "/api/admin/dtf/settings",
  catalog: "/api/admin/dtf/catalog",
  quote: "/api/admin/dtf/quote",
} as const;

export type GarmentListResponse = { items: GarmentProductJson[] };
export type PresetListResponse = { items: DtfPresetJson[] };
export type SettingsResponse = { settings: DtfSettings };
export type ConsumablesResponse = {
  items: DtfConsumableJson[];
  ink: { stockMl: number; avgCostPerMl: number };
};

export class DtfApiError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DtfApiError";
  }
}

type HttpMethod = "GET" | "POST" | "PATCH" | "DELETE";

export async function dtfRequest<T>(url: string, method: HttpMethod = "GET", body?: unknown): Promise<T> {
  const res: Response = await fetch(url, {
    method,
    cache: "no-store",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const code: string =
      json && typeof json === "object" && "error" in json && typeof json.error === "string"
        ? json.error
        : `http_${res.status}`;
    throw new DtfApiError(code);
  }
  return json as T;
}

/** Translated message for a DTF API failure (falls back to the raw code). */
export function dtfErrorText(error: unknown, t: TranslationDictionary): string {
  const code: string = error instanceof DtfApiError ? error.code : "";
  if (isDtfErrorCode(code)) return t.dtf.errors[code];
  return code ? `${t.dtf.stock.loadFailed} (${code})` : t.dtf.stock.loadFailed;
}

/** «12,5» / «12.5» / «» → 12.5 / null. */
export function parseDecimal(value: string): number | null {
  const trimmed: string = value.trim().replace(/\s/g, "").replace(",", ".");
  if (trimmed === "") return null;
  const n: number = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function formatNumber(value: number, locale: string, maxFractionDigits = 2): string {
  return value.toLocaleString(locale, { maximumFractionDigits: maxFractionDigits });
}

export function formatMdl(value: number, locale: string): string {
  return `${value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MDL`;
}

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}
