"use client";

import { useState } from "react";
import Link from "next/link";
import { Droplet, Layers, Loader2, PackagePlus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DtfConsumable } from "@/lib/dtf/dtfConstants";
import type { DtfConsumableJson } from "@/lib/dtf/dtfDto";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  DTF_API,
  dtfErrorText,
  dtfRequest,
  formatMdl,
  formatNumber,
  parseDecimal,
  todayIsoDate,
} from "@/lib/dtf/dtfClientApi";
import { useDtfConsumables } from "@/lib/swr";

function ConsumableReceiptForm({
  consumable,
  onSaved,
  onCancel,
}: {
  consumable: DtfConsumable;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useLanguageStore();
  const c = t.dtf.consumables;
  const unit: string = t.dtf.consumableUnits[consumable];
  const [purchasedAt, setPurchasedAt] = useState<string>(todayIsoDate);
  const [quantity, setQuantity] = useState<string>("");
  const [totalCost, setTotalCost] = useState<string>("");
  const [supplier, setSupplier] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    const qty: number | null = parseDecimal(quantity);
    const cost: number | null = parseDecimal(totalCost);
    if (qty == null || qty <= 0 || cost == null || cost < 0) {
      setError(t.dtf.receipt.empty);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await dtfRequest(DTF_API.consumableReceipt, "POST", {
        consumable,
        quantity: qty,
        totalCostMdl: cost,
        purchasedAt,
        supplier: supplier.trim() || null,
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
    <div className="mt-3 grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 sm:grid-cols-2">
      <label className="block">
        <span className={labelClass}>{t.dtf.receipt.date}</span>
        <Input type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
      </label>
      <label className="block">
        <span className={labelClass}>{t.dtf.receipt.supplier}</span>
        <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
      </label>
      <label className="block">
        <span className={labelClass}>{c.quantity(unit)}</span>
        <Input inputMode="decimal" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
      </label>
      <label className="block">
        <span className={labelClass}>{c.totalCost}</span>
        <Input inputMode="decimal" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
      </label>
      {error && <p className="text-sm text-red-600 sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <Button type="button" disabled={saving} onClick={() => void submit()}>
          {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t.dtf.receipt.submit}
        </Button>
        <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>
          {t.dtf.stock.cancel}
        </Button>
      </div>
    </div>
  );
}

const CONSUMABLE_ICON: Record<DtfConsumable, typeof Layers> = {
  [DtfConsumable.Film]: Layers,
  [DtfConsumable.Powder]: Sparkles,
};

export default function ConsumablesTab() {
  const { t, locale } = useLanguageStore();
  const c = t.dtf.consumables;
  const { data, error, mutate } = useDtfConsumables();
  const [receiving, setReceiving] = useState<DtfConsumable | null>(null);

  if (error) return <p className="text-sm text-red-600">{dtfErrorText(error, t)}</p>;
  if (!data) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t.dtf.stock.loading}
      </p>
    );
  }

  const anyNegative: boolean = data.items.some((i) => i.stockQuantity < 0) || data.ink.stockMl < 0;

  return (
    <section className="grid max-w-3xl gap-4">
      {data.items.map((item: DtfConsumableJson) => {
        const Icon = CONSUMABLE_ICON[item.id];
        const unit: string = t.dtf.consumableUnits[item.id];
        return (
          <div key={item.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-fuchsia-50 text-fuchsia-800 ring-1 ring-fuchsia-100">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold text-gray-900">{t.dtf.consumableNames[item.id]}</p>
                  <p className="text-xs text-gray-500">
                    {c.avgCost(unit)}: {formatMdl(item.avgCostPerUnit, locale)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <p
                  className={cn(
                    "text-xl font-bold tabular-nums",
                    item.stockQuantity < 0 ? "text-red-700" : "text-gray-900",
                  )}
                >
                  {formatNumber(item.stockQuantity, locale)} {unit}
                </p>
                <Button type="button" variant="outline" size="sm" onClick={() => setReceiving(item.id)}>
                  <PackagePlus className="mr-1.5 h-4 w-4" />
                  {c.receive}
                </Button>
              </div>
            </div>
            {receiving === item.id && (
              <ConsumableReceiptForm
                consumable={item.id}
                onCancel={() => setReceiving(null)}
                onSaved={() => {
                  setReceiving(null);
                  void mutate();
                }}
              />
            )}
          </div>
        );
      })}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 text-violet-800 ring-1 ring-violet-100">
              <Droplet className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold text-gray-900">{c.inkTitle}</p>
              <p className="text-xs text-gray-500">
                {c.inkHint} · {c.avgCost("ml")}: {formatMdl(data.ink.avgCostPerMl, locale)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <p className={cn("text-xl font-bold tabular-nums", data.ink.stockMl < 0 ? "text-red-700" : "text-gray-900")}>
              {formatNumber(data.ink.stockMl, locale, 0)} ml
            </p>
            <Link href="/admin/stock/ink" className="text-sm font-medium text-violet-700 hover:underline">
              {c.inkLink}
            </Link>
          </div>
        </div>
      </div>

      {anyNegative && <p className="text-xs text-red-700">{c.negativeHint}</p>}
    </section>
  );
}
