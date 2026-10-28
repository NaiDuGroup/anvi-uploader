"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dtfErrorText, dtfRequest } from "@/lib/dtf/dtfClientApi";
import { localizedDtfName } from "@/lib/dtf/stockGarments";
import { PRINT_METHOD_API, type PrintMethodCategoryJson, type PrintMethodSettingsResponse } from "@/lib/printMethods/dto";
import { PrintMethodCode } from "@/lib/printMethods/methods";
import { SettingsFieldUnit } from "@/lib/printMethods/settings";
import {
  parseSublimationClientItemDraft,
  parseSublimationNormsDraft,
  sublimationClientItemDraft,
  sublimationNormsDraft,
  type SublimationClientItemDraft,
  type SublimationNormKey,
  type SublimationNormsDraft,
} from "@/lib/printMethods/sublimationNormsForm";
import type { SublimationClientItemSettings, SublimationSettings } from "@/lib/printMethods/sublimationSettings";
import { PrinterCode } from "@/lib/stock/unified/printerMath";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { Feedback } from "./PrintPresetsEditor";

const cellClass = "h-8 w-20 px-2 text-right tabular-nums";

/** «Изделие клиента: цены» fields in display order, with their units. */
const CLIENT_ITEM_FIELDS: readonly { key: keyof SublimationClientItemSettings; unit: SettingsFieldUnit }[] = [
  { key: "retailPricePerSqmMdl", unit: SettingsFieldUnit.MdlPerSqm },
  { key: "dealerPricePerSqmMdl", unit: SettingsFieldUnit.MdlPerSqm },
  { key: "minimumPriceRetailMdl", unit: SettingsFieldUnit.Mdl },
  { key: "minimumPriceDealerMdl", unit: SettingsFieldUnit.Mdl },
  { key: "setupFeeMdl", unit: SettingsFieldUnit.Mdl },
  { key: "minimumLineTotalMdl", unit: SettingsFieldUnit.Mdl },
  { key: "inkMlPerSqm", unit: SettingsFieldUnit.MlPerSqm },
  { key: "tapeCmPerPiece", unit: SettingsFieldUnit.Cm },
];

/**
 * «Сублимация: нормы расхода»: Epson L1800 paper, heat tape and ink per printed
 * item, one row per stock category marked «Сублимация», plus the waste %;
 * and the prices / norms of prints on the client's own item.
 */
export default function SublimationNormsEditor({
  initial,
  categories,
  onSaved,
  onFeedback,
}: {
  initial: SublimationSettings;
  categories: readonly PrintMethodCategoryJson[];
  onSaved: (settings: SublimationSettings) => void;
  onFeedback: (feedback: Feedback) => void;
}) {
  const { t, locale } = useLanguageStore();
  const p = t.printMethods;
  const n = p.norms;
  const codes: string[] = categories.map((c) => c.code);
  const [draft, setDraft] = useState<SublimationNormsDraft>(() => sublimationNormsDraft(initial, codes));
  const [client, setClient] = useState<SublimationClientItemDraft>(() => sublimationClientItemDraft(initial));
  const [saving, setSaving] = useState<boolean>(false);

  const columns: { key: SublimationNormKey; label: string; unit: string }[] = [
    { key: "paperSheets", label: n.colPaper, unit: n.unitSheets },
    { key: "tapeCm", label: n.colTape, unit: n.unitCm },
    { key: "inkMl", label: n.colInk, unit: n.unitMl },
  ];

  function setCell(code: string, key: SublimationNormKey, value: string): void {
    setDraft((prev) => ({
      ...prev,
      norms: { ...prev.norms, [code]: { ...(prev.norms[code] ?? { paperSheets: "", tapeCm: "", inkMl: "" }), [key]: value } },
    }));
  }

  async function save(): Promise<void> {
    const parsed = parseSublimationNormsDraft(draft);
    if (!parsed.ok) {
      const field = parsed.field;
      let label: string = p.fields.sublimation.wastePct.label;
      if (field !== "wastePct") {
        const category = categories.find((c) => c.code === field.categoryCode);
        const column = columns.find((c) => c.key === field.key);
        label = [category ? localizedDtfName(category.names, locale) : field.categoryCode, column?.label]
          .filter(Boolean)
          .join(" · ");
      }
      onFeedback({ ok: false, text: p.fieldInvalid(label) });
      return;
    }
    const clientParsed = parseSublimationClientItemDraft(client);
    if (!clientParsed.ok) {
      onFeedback({ ok: false, text: p.fieldInvalid(n.clientItemFields[clientParsed.field].label) });
      return;
    }
    setSaving(true);
    onFeedback(null);
    try {
      const res = await dtfRequest<PrintMethodSettingsResponse<PrintMethodCode.Sublimation>>(
        PRINT_METHOD_API.method(PrintMethodCode.Sublimation),
        "PATCH",
        { ...parsed.patch, clientItem: clientParsed.clientItem },
      );
      setDraft(sublimationNormsDraft(res.settings, codes));
      setClient(sublimationClientItemDraft(res.settings));
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
      <h2 className="font-semibold text-gray-900">{n.title}</h2>
      <p className="mb-3 mt-0.5 text-xs text-gray-500">
        {n.hint}{" "}
        <Link href={`/admin/stock/printers#${PrinterCode.Sublimation}`} className="underline hover:text-gray-800">
          {n.printerLink}
        </Link>
        {" · "}
        <Link href="/admin/stock/categories" className="underline hover:text-gray-800">
          {n.categoriesLink}
        </Link>
      </p>

      {categories.length === 0 ? (
        <p className="text-sm text-amber-700">{n.empty}</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                <th className="p-2">{n.colCategory}</th>
                {columns.map((c) => (
                  <th key={c.key} className="p-2 text-right">
                    {c.label}, {c.unit}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.code} className={cn("border-b border-gray-100 last:border-0", !c.isActive && "text-gray-400")}>
                  <td className="p-2">
                    <span className="font-medium">{localizedDtfName(c.names, locale)}</span>
                    <span className="ml-2 font-mono text-xs text-gray-400">{c.code}</span>
                  </td>
                  {columns.map((col) => (
                    <td key={col.key} className="p-2 text-right">
                      <Input
                        inputMode="decimal"
                        aria-label={`${localizedDtfName(c.names, locale)} · ${col.label}`}
                        className={cn(cellClass, "ml-auto")}
                        value={draft.norms[c.code]?.[col.key] ?? ""}
                        placeholder="0"
                        disabled={saving}
                        onChange={(e) => setCell(c.code, col.key, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <label className="mt-4 block w-56">
        <span className="mb-1 block text-xs font-medium text-gray-600">{p.fields.sublimation.wastePct.label}</span>
        <div className="relative">
          <Input
            inputMode="decimal"
            className="pr-10"
            value={draft.wastePct}
            disabled={saving}
            onChange={(e) => setDraft((prev) => ({ ...prev, wastePct: e.target.value }))}
          />
          <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">
            {p.units.pct}
          </span>
        </div>
        {p.fields.sublimation.wastePct.hint && (
          <span className="mt-1 block text-[11px] leading-snug text-gray-500">{p.fields.sublimation.wastePct.hint}</span>
        )}
      </label>

      <div className="mt-6 border-t border-gray-100 pt-4">
        <h3 className="font-semibold text-gray-900">{n.clientItemTitle}</h3>
        <p className="mb-3 mt-0.5 text-xs text-gray-500">{n.clientItemHint}</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CLIENT_ITEM_FIELDS.map(({ key, unit }) => {
            const text = n.clientItemFields[key];
            return (
              <label key={key} className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">{text.label}</span>
                <div className="relative">
                  <Input
                    inputMode="decimal"
                    className="pr-14"
                    value={client[key]}
                    placeholder="0"
                    disabled={saving}
                    onChange={(e) => setClient((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-gray-400">
                    {p.units[unit]}
                  </span>
                </div>
                {text.hint && <span className="mt-1 block text-[11px] leading-snug text-gray-500">{text.hint}</span>}
              </label>
            );
          })}
        </div>
      </div>

      <Button type="button" className="mt-4" disabled={saving} onClick={() => void save()}>
        {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
        {saving ? p.saving : p.save}
      </Button>
    </div>
  );
}
