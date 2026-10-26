import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import type { PrintMethodCode } from "@/lib/printMethods/methods";
import type { SettingsFieldUnit } from "@/lib/printMethods/settings";
import type { UvSettings } from "@/lib/printMethods/uvSettings";

export interface SettingsFieldText {
  label: string;
  hint?: string;
}

interface MethodPageText {
  subtitle: string;
  presetsTitle: string;
  presetsHint: string;
  settingsTitle: string;
}

/** «DTF / UV: прайс и нормы» pages (`/admin/stock/print/[code]`). */
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
  };
}
