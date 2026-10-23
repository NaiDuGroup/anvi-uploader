"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { DtfPresetJson } from "@/lib/dtf/dtfDto";
import type { DtfSettings } from "@/lib/dtf/dtfSettings";
import { DTF_API, dtfErrorText, dtfRequest, parseDecimal, type SettingsResponse } from "@/lib/dtf/dtfClientApi";
import { useDtfPresets, useDtfSettings } from "@/lib/swr";
import { useLanguageStore } from "@/stores/useLanguageStore";

type Feedback = { ok: boolean; text: string } | null;

type PresetDraft = {
  /** Null for a row not saved yet. */
  id: string | null;
  label: string;
  widthCm: string;
  heightCm: string;
  retailPrice: string;
  dealerPrice: string;
  isActive: boolean;
  sortOrder: number;
};

type SettingsDraft = Record<keyof DtfSettings, string>;

const SETTINGS_KEYS: readonly (keyof DtfSettings)[] = [
  "filmWidthCm",
  "printableWidthCm",
  "gapCm",
  "inkMlPerLinearMeter",
  "powderGramsPerLinearMeter",
  "includedPrintCreditMdl",
  "pressFeePerZoneMdl",
  "minimumLineTotalMdl",
];

function toPresetDraft(p: DtfPresetJson): PresetDraft {
  return {
    id: p.id,
    label: p.label,
    widthCm: String(p.widthCm),
    heightCm: String(p.heightCm),
    retailPrice: String(p.retailPrice),
    dealerPrice: p.dealerPrice == null ? "" : String(p.dealerPrice),
    isActive: p.isActive,
    sortOrder: p.sortOrder,
  };
}

function toSettingsDraft(s: DtfSettings): SettingsDraft {
  const out = {} as SettingsDraft;
  for (const key of SETTINGS_KEYS) out[key] = String(s[key]);
  return out;
}

function presetBody(d: PresetDraft) {
  const widthCm: number | null = parseDecimal(d.widthCm);
  const heightCm: number | null = parseDecimal(d.heightCm);
  const retailPrice: number | null = parseDecimal(d.retailPrice);
  if (!d.label.trim() || widthCm == null || heightCm == null || retailPrice == null) return null;
  return {
    label: d.label.trim(),
    widthCm,
    heightCm,
    retailPrice,
    dealerPrice: parseDecimal(d.dealerPrice),
    isActive: d.isActive,
    sortOrder: d.sortOrder,
  };
}

function PresetsEditor({
  initial,
  onChanged,
  onFeedback,
}: {
  initial: DtfPresetJson[];
  onChanged: () => Promise<unknown>;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t } = useLanguageStore();
  const p = t.dtf.pricing;
  const [rows, setRows] = useState<PresetDraft[]>(() => initial.map(toPresetDraft));
  const [busyRow, setBusyRow] = useState<number | null>(null);

  function update(index: number, patch: Partial<PresetDraft>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save(index: number): Promise<void> {
    const row: PresetDraft | undefined = rows[index];
    const body = row ? presetBody(row) : null;
    if (!row || !body) {
      onFeedback({ ok: false, text: t.dtf.errors.dtf_zone_size_invalid });
      return;
    }
    setBusyRow(index);
    onFeedback(null);
    try {
      if (row.id) await dtfRequest(DTF_API.preset(row.id), "PATCH", body);
      else await dtfRequest(DTF_API.presets, "POST", body);
      onFeedback({ ok: true, text: t.dtf.stock.saved });
      await onChanged();
    } catch (e) {
      onFeedback({ ok: false, text: dtfErrorText(e, t) });
    } finally {
      setBusyRow(null);
    }
  }

  async function remove(index: number): Promise<void> {
    const row: PresetDraft | undefined = rows[index];
    if (!row) return;
    if (!row.id) {
      setRows((prev) => prev.filter((_, i) => i !== index));
      return;
    }
    if (!window.confirm(p.confirmDeletePreset(row.label))) return;
    setBusyRow(index);
    try {
      await dtfRequest(DTF_API.preset(row.id), "DELETE");
      await onChanged();
    } catch (e) {
      onFeedback({ ok: false, text: dtfErrorText(e, t) });
    } finally {
      setBusyRow(null);
    }
  }

  function addRow(): void {
    setRows((prev) => [
      ...prev,
      {
        id: null,
        label: "",
        widthCm: "",
        heightCm: "",
        retailPrice: "",
        dealerPrice: "",
        isActive: true,
        sortOrder: prev.length * 10,
      },
    ]);
  }

  const cell = "h-8";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-gray-900">{p.presetsTitle}</h2>
      <p className="mb-3 text-xs text-gray-500">{p.presetsHint}</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="pb-1 pr-2 font-medium">{p.presetLabel}</th>
              <th className="pb-1 pr-2 font-medium">{p.presetWidth}</th>
              <th className="pb-1 pr-2 font-medium">{p.presetHeight}</th>
              <th className="pb-1 pr-2 font-medium">{p.presetRetail}</th>
              <th className="pb-1 pr-2 font-medium">{p.presetDealer}</th>
              <th className="pb-1 pr-2 font-medium">{p.presetActive}</th>
              <th className="pb-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? `new-${i}`} className="align-middle">
                <td className="py-1 pr-2">
                  <Input className={cell} value={row.label} onChange={(e) => update(i, { label: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className={`${cell} w-20`} inputMode="decimal" value={row.widthCm} onChange={(e) => update(i, { widthCm: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className={`${cell} w-20`} inputMode="decimal" value={row.heightCm} onChange={(e) => update(i, { heightCm: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className={`${cell} w-24`} inputMode="decimal" value={row.retailPrice} onChange={(e) => update(i, { retailPrice: e.target.value })} />
                </td>
                <td className="py-1 pr-2">
                  <Input className={`${cell} w-24`} inputMode="decimal" placeholder="—" value={row.dealerPrice} onChange={(e) => update(i, { dealerPrice: e.target.value })} />
                </td>
                <td className="py-1 pr-2 text-center">
                  <input type="checkbox" checked={row.isActive} onChange={(e) => update(i, { isActive: e.target.checked })} />
                </td>
                <td className="whitespace-nowrap py-1">
                  <Button type="button" size="sm" variant="outline" disabled={busyRow !== null} onClick={() => void save(i)}>
                    {busyRow === i ? <Loader2 className="h-4 w-4 animate-spin" /> : t.dtf.stock.save}
                  </Button>
                  <button
                    type="button"
                    className="ml-1 rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                    aria-label={p.deletePreset}
                    disabled={busyRow !== null}
                    onClick={() => void remove(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={addRow}>
        <Plus className="mr-1 h-4 w-4" />
        {p.addPreset}
      </Button>
    </div>
  );
}

function SettingsEditor({
  initial,
  onSaved,
  onFeedback,
}: {
  initial: DtfSettings;
  onSaved: (settings: DtfSettings) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t } = useLanguageStore();
  const p = t.dtf.pricing;
  const [draft, setDraft] = useState<SettingsDraft>(() => toSettingsDraft(initial));
  const [saving, setSaving] = useState<boolean>(false);

  async function save(): Promise<void> {
    const body = {} as DtfSettings;
    for (const key of SETTINGS_KEYS) {
      const value: number | null = parseDecimal(draft[key]);
      if (value == null || value < 0) {
        onFeedback({ ok: false, text: `${p[key]}?` });
        return;
      }
      body[key] = value;
    }
    setSaving(true);
    onFeedback(null);
    try {
      const res = await dtfRequest<SettingsResponse>(DTF_API.settings, "PATCH", body);
      onSaved(res.settings);
      onFeedback({ ok: true, text: t.dtf.stock.saved });
    } catch (e) {
      onFeedback({ ok: false, text: dtfErrorText(e, t) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 font-semibold text-gray-900">{p.settingsTitle}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SETTINGS_KEYS.map((key) => (
          <label key={key} className="block">
            <span className="mb-1 block text-xs font-medium text-gray-600">{p[key]}</span>
            <Input
              inputMode="decimal"
              value={draft[key]}
              onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
            />
            {key === "includedPrintCreditMdl" && (
              <span className="mt-1 block text-[11px] text-gray-500">{p.includedPrintCreditHint}</span>
            )}
          </label>
        ))}
      </div>
      <Button type="button" className="mt-4" disabled={saving} onClick={() => void save()}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {saving ? t.dtf.stock.saving : t.dtf.stock.save}
      </Button>
    </div>
  );
}

export default function PricingTab() {
  const { t } = useLanguageStore();
  const presets = useDtfPresets();
  const settings = useDtfSettings();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const loadError: unknown = presets.error ?? settings.error;
  if (loadError) return <p className="text-sm text-red-600">{dtfErrorText(loadError, t)}</p>;
  if (!presets.data || !settings.data) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.dtf.stock.loading}
      </p>
    );
  }

  const presetsKey: string = presets.data.items.map((p) => `${p.id}:${p.label}:${p.retailPrice}:${p.isActive}`).join("|");

  return (
    <section className="grid gap-6">
      {feedback && (
        <p className={feedback.ok ? "text-sm text-emerald-700" : "text-sm text-red-600"}>{feedback.text}</p>
      )}
      <PresetsEditor
        key={presetsKey}
        initial={presets.data.items}
        onChanged={() => presets.mutate()}
        onFeedback={setFeedback}
      />
      <SettingsEditor
        initial={settings.data.settings}
        onSaved={(next) => void settings.mutate({ settings: next }, { revalidate: false })}
        onFeedback={setFeedback}
      />
    </section>
  );
}
