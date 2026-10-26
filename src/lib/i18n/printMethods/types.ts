import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import type { PrintMethodCode } from "@/lib/printMethods/methods";
import type { SettingsFieldUnit } from "@/lib/printMethods/settings";
import type { UvSettings } from "@/lib/printMethods/uvSettings";
import type { SublimationSettings } from "@/lib/printMethods/sublimationSettings";

export interface SettingsFieldText {
  label: string;
  hint?: string;
}

interface MethodPageText {
  title: string;
  subtitle: string;
  presetsTitle: string;
  presetsHint: string;
  settingsTitle: string;
}

/** «DTF / UV: прайс и нормы» and «Сублимация: нормы расхода» pages (`/admin/stock/print/[code]`). */
export interface PrintMethodsDictionary {
  loading: string;
  loadFailed: string;
  save: string;
  saving: string;
  saved: string;
  presetLabel: string;
  presetWidth: string;
  presetHeight: string;
  presetRetail: string;
  presetDealer: string;
  presetActive: string;
  presetInvalid: string;
  addPreset: string;
  deletePreset: string;
  confirmDeletePreset: (label: string) => string;
  fieldInvalid: (label: string) => string;
  units: Record<SettingsFieldUnit, string>;
  methods: Record<PrintMethodCode, MethodPageText>;
  fields: {
    dtf: Record<keyof DtfSettings, SettingsFieldText>;
    uv: Record<keyof UvSettings, SettingsFieldText>;
    sublimation: Record<Exclude<keyof SublimationSettings, "norms">, SettingsFieldText>;
  };
  /** Sublimation: usage per printed item, one row per category marked «Сублимация». */
  norms: {
    title: string;
    hint: string;
    colCategory: string;
    colPaper: string;
    colTape: string;
    colInk: string;
    unitSheets: string;
    unitCm: string;
    unitMl: string;
    empty: string;
    categoriesLink: string;
    printerLink: string;
  };
}
