"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GarmentProductJson } from "@/lib/dtf/dtfDto";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { DTF_API, dtfErrorText, dtfRequest, formatMdl, parseDecimal, todayIsoDate } from "@/lib/dtf/dtfClientApi";

type RowDraft = { quantity: string; unitCost: string };

const EMPTY_ROW: RowDraft = { quantity: "", unitCost: "" };

type ReceiptLine = { garmentVariantId: string; quantity: number; totalCostMdl: number };

export interface GarmentReceiptFormProps {
  garment: GarmentProductJson;
  onSaved: () => void;
  onCancel: () => void;
}

export default function GarmentReceiptForm({ garment, onSaved, onCancel }: GarmentReceiptFormProps) {
  const { t, locale } = useLanguageStore();
  const r = t.dtf.receipt;
  const [purchasedAt, setPurchasedAt] = useState<string>(todayIsoDate);
  const [supplier, setSupplier] = useState<string>("");
  const [note, setNote] = useState<string>("");
  const [defaultUnitCost, setDefaultUnitCost] = useState<string>(
    garment.purchaseCost == null ? "" : String(garment.purchaseCost),
  );
  const [rows, setRows] = useState<Record<string, RowDraft>>({});
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const lines: ReceiptLine[] = useMemo(() => {
    const fallback: number = parseDecimal(defaultUnitCost) ?? 0;
    const out: ReceiptLine[] = [];
    for (const v of garment.variants) {
      const row: RowDraft | undefined = rows[v.id];
      const quantity: number = Math.trunc(parseDecimal(row?.quantity ?? "") ?? 0);
      if (quantity <= 0) continue;
      const unit: number = parseDecimal(row?.unitCost ?? "") ?? fallback;
      out.push({
        garmentVariantId: v.id,
        quantity,
        totalCostMdl: Math.round(quantity * unit * 100) / 100,
      });
    }
    return out;
  }, [garment.variants, rows, defaultUnitCost]);

  const totalPieces: number = lines.reduce((sum, l) => sum + l.quantity, 0);
  const totalCost: number = lines.reduce((sum, l) => sum + l.totalCostMdl, 0);

  function updateRow(variantId: string, patch: Partial<RowDraft>): void {
    setRows((prev) => ({
      ...prev,
      [variantId]: { ...(prev[variantId] ?? EMPTY_ROW), ...patch },
    }));
  }

  async function submit(): Promise<void> {
    setError(null);
    if (lines.length === 0) {
      setError(r.empty);
      return;
    }
    setSaving(true);
    try {
      await dtfRequest(DTF_API.garmentReceipt, "POST", {
        purchasedAt,
        supplier: supplier.trim() || null,
        note: note.trim() || null,
        lines,
      });
      onSaved();
    } catch (e) {
      setError(dtfErrorText(e, t));
    } finally {
      setSaving(false);
    }
  }

  const labelClass = "mb-1 block text-xs font-medium text-gray-600";

  return (
    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="text-sm font-semibold text-gray-900">
        {r.title(`${garment.name} · ${garment.colorName}`)}
      </h3>
      <p className="mt-0.5 text-xs text-gray-600">{r.hint}</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <label className="block">
          <span className={labelClass}>{r.date}</span>
          <Input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>{r.unitCost}</span>
          <Input
            inputMode="decimal"
            value={defaultUnitCost}
            placeholder={r.unitCostPlaceholder}
            onChange={(e) => setDefaultUnitCost(e.target.value)}
          />
        </label>
        <label className="block">
          <span className={labelClass}>{r.supplier}</span>
          <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </label>
        <label className="block">
          <span className={labelClass}>{r.note}</span>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr className="text-xs text-gray-500">
              <th className="px-1 pb-1 text-left font-medium">{t.dtf.editor.size}</th>
              {garment.variants.map((v) => (
                <th key={v.id} className="px-1 pb-1 text-center font-semibold text-gray-800">
                  {v.size}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="px-1 py-1 text-xs text-gray-500">{r.quantity}</td>
              {garment.variants.map((v) => (
                <td key={v.id} className="px-1 py-1">
                  <Input
                    className="h-8 w-16 text-center"
                    inputMode="numeric"
                    value={rows[v.id]?.quantity ?? ""}
                    onChange={(e) => updateRow(v.id, { quantity: e.target.value })}
                  />
                </td>
              ))}
            </tr>
            <tr>
              <td className="px-1 py-1 text-xs text-gray-500">{r.unitCost}</td>
              {garment.variants.map((v) => (
                <td key={v.id} className="px-1 py-1">
                  <Input
                    className="h-8 w-16 text-center"
                    inputMode="decimal"
                    placeholder={defaultUnitCost || "—"}
                    value={rows[v.id]?.unitCost ?? ""}
                    onChange={(e) => updateRow(v.id, { unitCost: e.target.value })}
                  />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-sm font-medium text-gray-800">
        {r.totalLine(totalPieces, formatMdl(totalCost, locale))}
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

      <div className="mt-3 flex gap-2">
        <Button type="button" disabled={saving} onClick={() => void submit()}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {r.submit}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {t.dtf.stock.cancel}
        </Button>
      </div>
    </div>
  );
}
