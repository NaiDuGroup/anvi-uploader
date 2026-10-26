"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dtfErrorText, dtfRequest, parseDecimal } from "@/lib/dtf/dtfClientApi";
import type { SettingsFieldText } from "@/lib/i18n/printMethods/types";
import { PRINT_METHOD_API, type PrintMethodSettingsResponse } from "@/lib/printMethods/dto";
import type { PrintMethodCode } from "@/lib/printMethods/methods";
import { PRINT_METHOD_SETTINGS, type PrintMethodSettingsMap } from "@/lib/printMethods/settings";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { Feedback } from "./PrintPresetsEditor";

type Draft = Record<string, string>;

/** A method's norms and pricing options: one number per field, with its unit and hint. */
export default function PrintMethodSettingsEditor<C extends PrintMethodCode>({
  code,
  initial,
  onSaved,
  onFeedback,
}: {
  code: C;
  initial: PrintMethodSettingsMap[C];
  onSaved: (settings: PrintMethodSettingsMap[C]) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t } = useLanguageStore();
  const p = t.printMethods;
  const fields = PRINT_METHOD_SETTINGS[code].fields as readonly { key: string; unit: keyof typeof p.units }[];
  const fieldText = p.fields[code] as Record<string, SettingsFieldText>;
  const values = initial as unknown as Record<string, number>;
  const [draft, setDraft] = useState<Draft>(() =>
    Object.fromEntries(fields.map((f) => [f.key, String(values[f.key] ?? "")])),
  );
  const [saving, setSaving] = useState<boolean>(false);

  async function save(): Promise<void> {
    const body: Record<string, number> = {};
    for (const field of fields) {
      const value: number | null = parseDecimal(draft[field.key] ?? "");
      if (value == null || value < 0) {
        onFeedback({ ok: false, text: p.fieldInvalid(fieldText[field.key]?.label ?? field.key) });
        return;
      }
      body[field.key] = value;
    }
    setSaving(true);
    onFeedback(null);
    try {
      const res = await dtfRequest<PrintMethodSettingsResponse<C>>(PRINT_METHOD_API.method(code), "PATCH", body);
      const saved = res.settings as unknown as Record<string, number>;
      setDraft(Object.fromEntries(fields.map((f) => [f.key, String(saved[f.key] ?? "")])));
      onSaved(res.settings);
      onFeedback({ ok: true, text: p.saved });
    } catch (e) {
      onFeedback({ ok: false, text: dtfErrorText(e, t) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-gray-900">{p.methods[code].settingsTitle}</h2>
      <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
        {fields.map((field) => {
          const text: SettingsFieldText | undefined = fieldText[field.key];
          const unit: string = p.units[field.unit];
          return (
            <label key={field.key} className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600">{text?.label ?? field.key}</span>
              <div className="relative">
                <Input
                  inputMode="decimal"
                  className="pr-20"
                  value={draft[field.key] ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))}
                />
                <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">
                  {unit}
                </span>
              </div>
              {text?.hint && <span className="mt-1 block text-[11px] leading-snug text-gray-500">{text.hint}</span>}
            </label>
          );
        })}
      </div>
      <Button type="button" className="mt-4" disabled={saving} onClick={() => void save()}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {saving ? p.saving : p.save}
      </Button>
    </div>
  );
}
