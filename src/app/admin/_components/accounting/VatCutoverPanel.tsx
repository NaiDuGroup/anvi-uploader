"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { VatCutoverPreview } from "@/lib/accounting/vatCutover";
import { VAT_CUTOVER_CONFIRMATION } from "@/lib/accounting/vatBasis";

const ENDPOINT = "/api/admin/accounting/vat-cutover";

type Props = { onApplied: () => void };

/** Superadmin: one-time switch of purchase costs to the ex-VAT basis. */
export default function VatCutoverPanel({ onApplied }: Props) {
  const { t, locale } = useLanguageStore();
  const a = t.accounting;
  const [preview, setPreview] = useState<VatCutoverPreview | null>(null);
  const [convertNorms, setConvertNorms] = useState<boolean>(false);
  const [confirmText, setConfirmText] = useState<string>("");
  const [busy, setBusy] = useState<boolean>(false);
  const [failed, setFailed] = useState<boolean>(false);

  const fetchPreview = useCallback(async (): Promise<VatCutoverPreview | null> => {
    const res = await fetch(ENDPOINT, { cache: "no-store" });
    return res.ok ? ((await res.json()) as VatCutoverPreview) : null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchPreview().then((p) => {
      if (!cancelled) setPreview(p);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPreview]);

  const apply = async (): Promise<void> => {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ convertProductionNorms: convertNorms, confirm: confirmText }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setPreview((await res.json()) as VatCutoverPreview);
      onApplied();
    } finally {
      setBusy(false);
    }
  };

  if (!preview) return null;

  if (preview.appliedAt) {
    return (
      <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
        {a.vatCutoverApplied(new Date(preview.appliedAt).toLocaleDateString(locale))}
      </section>
    );
  }

  const c = preview.counts;
  const items: number = c.mugs + c.notebooks + c.pens + c.lfMaterials + c.sheetPapers + c.inkTanks;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 text-sm text-gray-800">
      <h2 className="text-base font-semibold text-gray-900">{a.vatCutoverTitle}</h2>
      <p className="mt-1 text-gray-700">{a.vatCutoverIntro}</p>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-gray-700">
        {a.vatCutoverPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <p className="mt-3 font-medium">{a.vatCutoverCounts(items)}</p>

      {preview.markups.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{a.vatCutoverMarkups}</p>
          <ul className="mt-1 text-xs tabular-nums text-gray-700">
            {preview.markups.map((m) => (
              <li key={m.key}>
                {m.key}: {m.from} → {m.to}
              </li>
            ))}
          </ul>
        </div>
      )}

      {preview.productionNorms.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{a.vatCutoverNorms}</p>
          <ul className="mt-1 text-xs tabular-nums text-gray-700">
            {preview.productionNorms.map((m) => (
              <li key={m.key}>
                {m.key}: {m.from} → {m.to}
              </li>
            ))}
          </ul>
          <label className="mt-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={convertNorms}
              onChange={(e) => setConvertNorms(e.target.checked)}
            />
            {a.vatCutoverConvertNorms}
          </label>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-gray-600">
          {a.vatCutoverConfirmLabel(VAT_CUTOVER_CONFIRMATION)}
          <Input
            className="mt-1 h-9 w-40 bg-white"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value.trim())}
          />
        </label>
        <Button
          variant="destructive"
          disabled={busy || confirmText !== VAT_CUTOVER_CONFIRMATION}
          onClick={() => void apply()}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {a.vatCutoverApply}
        </Button>
      </div>
      {failed && <p className="mt-2 text-sm text-red-700">{a.vatCutoverFailed}</p>}
    </section>
  );
}
