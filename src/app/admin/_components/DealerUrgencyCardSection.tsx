"use client";

import { useEffect, useState } from "react";
import { Flame, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { DealerUrgencyMode } from "@/lib/dealerUrgency";
import { cn } from "@/lib/utils";

export interface DealerUrgencyCardValue {
  mode: DealerUrgencyMode;
  amountMdl: number | null;
  globalFeeMdl: number;
}

/**
 * Client card: the dealer's «Срочно» override — «как у всех» (global setting),
 * own amount (0 = free) or «срочность недоступна». Saving is superadmin only
 * (`PUT /api/admin/clients/[id]/urgency`); others see it read-only.
 */
export default function DealerUrgencyCardSection({
  clientId,
  value,
  canEdit,
  onSaved,
}: {
  clientId: string;
  value: DealerUrgencyCardValue;
  canEdit: boolean;
  onSaved?: (next: DealerUrgencyCardValue) => void;
}) {
  const { t } = useLanguageStore();
  const du = t.dealerUrgency;
  const [mode, setMode] = useState<DealerUrgencyMode>(value.mode);
  const [amount, setAmount] = useState<string>(value.amountMdl != null ? String(value.amountMdl) : "");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    setMode(value.mode);
    setAmount(value.amountMdl != null ? String(value.amountMdl) : "");
  }, [value.mode, value.amountMdl]);

  const parsedAmount = (() => {
    const n = Number(amount.replace(",", "."));
    return amount.trim() !== "" && Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
  })();
  const invalid = mode === "custom" && parsedAmount === null;

  async function save() {
    if (invalid) return;
    setState("saving");
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/urgency`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, amountMdl: mode === "custom" ? parsedAmount : null }),
      });
      if (!res.ok) throw new Error(String(res.status));
      const next = (await res.json()) as DealerUrgencyCardValue;
      onSaved?.(next);
      setState("saved");
      setTimeout(() => setState((s) => (s === "saved" ? "idle" : s)), 2000);
    } catch {
      setState("error");
    }
  }

  const options: { id: DealerUrgencyMode; label: string }[] = [
    { id: "default", label: du.cardModeDefault(du.feeShort(value.globalFeeMdl).replace(/^\+/, "")) },
    { id: "custom", label: du.cardModeCustom },
    { id: "unavailable", label: du.cardModeUnavailable },
  ];

  return (
    <section
      data-testid="client-dealer-urgency"
      className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-sm"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h2 className="inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Flame className="h-4 w-4 text-red-500" aria-hidden />
          {du.cardTitle}
        </h2>
        <div role="radiogroup" aria-label={du.cardTitle} className="flex flex-wrap gap-1.5">
          {options.map((o) => (
            <button
              key={o.id}
              type="button"
              role="radio"
              aria-checked={mode === o.id}
              disabled={!canEdit}
              onClick={() => setMode(o.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium ring-1 ring-inset transition-colors disabled:cursor-default",
                mode === o.id
                  ? "bg-gray-900 text-white ring-gray-900"
                  : "bg-white text-gray-700 ring-gray-200 hover:bg-gray-50",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
        {mode === "custom" ? (
          <label className="inline-flex items-center gap-2 text-xs text-gray-600">
            {du.cardAmountLabel}
            <Input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={amount}
              disabled={!canEdit}
              onChange={(e) => setAmount(e.target.value)}
              className={cn("h-8 w-24 text-sm", invalid && "border-red-300")}
            />
          </label>
        ) : null}
        {canEdit ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-3 text-xs"
            disabled={state === "saving" || invalid}
            onClick={() => void save()}
          >
            {state === "saving" ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
            {du.cardSave}
          </Button>
        ) : null}
        {state === "saved" ? <span className="text-xs font-medium text-emerald-700">{du.cardSaved}</span> : null}
        {state === "error" ? <span className="text-xs text-red-600">{du.cardSaveFailed}</span> : null}
      </div>
      <p className="mt-1.5 text-xs text-gray-500">{du.cardHint}</p>
    </section>
  );
}
