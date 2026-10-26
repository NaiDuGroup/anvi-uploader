import type { PrintMethodCode } from "@/lib/printMethods/methods";
import type { PrintPresetJson } from "@/lib/printMethods/presets";
import type { PrintMethodSettingsMap } from "@/lib/printMethods/settings";

export interface PrintMethodJson<C extends PrintMethodCode = PrintMethodCode> {
  code: C;
  names: { ro: string; ru: string; en: string };
  printerCode: string | null;
  isActive: boolean;
  settings: PrintMethodSettingsMap[C];
}

/** `GET /api/admin/print-methods/[code]`. */
export interface PrintMethodResponse<C extends PrintMethodCode = PrintMethodCode> {
  method: PrintMethodJson<C>;
  presets: PrintPresetJson[];
}

/** `PATCH /api/admin/print-methods/[code]`. */
export interface PrintMethodSettingsResponse<C extends PrintMethodCode = PrintMethodCode> {
  settings: PrintMethodSettingsMap[C];
}

export const PRINT_METHOD_API = {
  method: (code: PrintMethodCode): string => `/api/admin/print-methods/${code}`,
  presets: (code: PrintMethodCode): string => `/api/admin/print-methods/${code}/presets`,
  preset: (code: PrintMethodCode, id: string): string =>
    `/api/admin/print-methods/${code}/presets/${encodeURIComponent(id)}`,
} as const;
