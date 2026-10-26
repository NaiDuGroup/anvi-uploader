"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dtfErrorText, dtfRequest, parseDecimal } from "@/lib/dtf/dtfClientApi";
import { PRINT_METHOD_API } from "@/lib/printMethods/dto";
import type { PrintMethodCode } from "@/lib/printMethods/methods";
import type { PrintPresetInput, PrintPresetJson } from "@/lib/printMethods/presets";
import { useLanguageStore } from "@/stores/useLanguageStore";

export type Feedback = { ok: boolean; text: string } | null;

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

function toPresetDraft(p: PrintPresetJson): PresetDraft {
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

function presetBody(d: PresetDraft): PrintPresetInput | null {
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

/** Format price list of one print method: size → retail / dealer price. */
export default function PrintPresetsEditor({
  code,
  initial,
  onChanged,
  onFeedback,
}: {
  code: PrintMethodCode;
  initial: PrintPresetJson[];
  onChanged: () => Promise<unknown>;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t } = useLanguageStore();
  const p = t.printMethods;
  const text = p.methods[code];
  const [rows, setRows] = useState<PresetDraft[]>(() => initial.map(toPresetDraft));
  const [busyRow, setBusyRow] = useState<number | null>(null);

  function update(index: number, patch: Partial<PresetDraft>): void {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  async function save(index: number): Promise<void> {
    const row: PresetDraft | undefined = rows[index];
    const body = row ? presetBody(row) : null;
    if (!row || !body) {
      onFeedback({ ok: false, text: p.presetInvalid });
      return;
    }
    setBusyRow(index);
    onFeedback(null);
    try {
      if (row.id) await dtfRequest(PRINT_METHOD_API.preset(code, row.id), "PATCH", body);
      else await dtfRequest(PRINT_METHOD_API.presets(code), "POST", body);
      onFeedback({ ok: true, text: p.saved });
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
      await dtfRequest(PRINT_METHOD_API.preset(code, row.id), "DELETE");
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
        sortOrder: prev.reduce((max, r) => Math.max(max, r.sortOrder + 1), 0),
      },
    ]);
  }

  const cell = "h-8";
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="font-semibold text-gray-900">{text.presetsTitle}</h2>
      <p className="mb-3 text-xs text-gray-500">{text.presetsHint}</p>
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
                  <input
                    type="checkbox"
                    aria-label={p.presetActive}
                    checked={row.isActive}
                    onChange={(e) => update(i, { isActive: e.target.checked })}
                  />
                </td>
                <td className="whitespace-nowrap py-1">
                  <Button type="button" size="sm" variant="outline" disabled={busyRow !== null} onClick={() => void save(i)}>
                    {busyRow === i ? <Loader2 className="h-4 w-4 animate-spin" /> : p.save}
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
