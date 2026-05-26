"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import type { PrintProcess } from "@/lib/printProcess";
import { DEFAULT_PRINT_PROCESS, PRINT_PROCESSES } from "@/lib/printProcess";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { stockConsumptionKindLabel } from "@/lib/stockConsumptionUi";
import { useInkInventory, useInkReceipts, useInkConsumption } from "@/lib/swr";

type TankRow = {
  printProcess: PrintProcess;
  stockMl: number;
  avgCostPerMlMdl: number;
};

type ReceiptRow = {
  id: string;
  printProcess?: string;
  quantityMl: number;
  totalCostMdl: number;
  purchasedAt: string;
  note: string | null;
  createdBy: { id: string; name: string } | null;
};

type ConsumptionRow = {
  id: string;
  quantityMl: number;
  kind: string;
  orderId: string | null;
  orderNumber: number | null;
  inkCostMdl: number | null;
  inkSellPriceMdl: number | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

function processTabLabel(
  p: PrintProcess,
  admin: TranslationDictionary["admin"],
): string {
  switch (p) {
    case "large_format_roll":
      return admin.printProcessLargeFormatRoll;
    case "uv_rigid":
      return admin.printProcessUvRigid;
    case "dtf_textile":
      return admin.printProcessDtfTextile;
    default: {
      const _x: never = p;
      return String(_x);
    }
  }
}

export default function InkStockPageClient() {
  const { t, locale } = useLanguageStore();
  const admin = t.admin;
  const [selectedProcess, setSelectedProcess] =
    useState<PrintProcess>(DEFAULT_PRINT_PROCESS);
  const [qtyStr, setQtyStr] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [normByProcess, setNormByProcess] = useState<
    Partial<Record<PrintProcess, number>>
  >({});

  const { tanks, isLoading: loading, mutate: mutateInv } = useInkInventory();
  const { receipts: history, isLoading: histLoading, mutate: mutateHist } = useInkReceipts(selectedProcess);
  const { consumption, isLoading: consumptionLoading, mutate: mutateConsumption } = useInkConsumption(selectedProcess);

  const loadInv = useCallback(() => { mutateInv(); }, [mutateInv]);
  const loadHist = useCallback(() => { mutateHist(); }, [mutateHist]);
  const loadConsumption = useCallback(() => { mutateConsumption(); }, [mutateConsumption]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/print-economics-settings", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { tanks?: { printProcess: string; inkMlPerSqm: number }[] } | null) => {
        if (cancelled || !d?.tanks) return;
        const m: Partial<Record<PrintProcess, number>> = {};
        for (const t of d.tanks) {
          if (
            t.printProcess === "large_format_roll" ||
            t.printProcess === "uv_rigid" ||
            t.printProcess === "dtf_textile"
          ) {
            m[t.printProcess] = t.inkMlPerSqm;
          }
        }
        setNormByProcess(m);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setDeleteMessage(null);
  }, [selectedProcess]);

  // SWR handles automatic fetching; these calls are kept as no-ops for compatibility
  // with other code that calls loadInv()/loadHist()/loadConsumption() after mutations.

  async function submitReceipt(): Promise<void> {
    setError(null);
    const qty = Number.parseFloat(qtyStr.replace(",", "."));
    const total = Number.parseInt(totalStr.replace(/\s/g, ""), 10);
    if (!(qty > 0) || !Number.isFinite(qty)) {
      setError("qty");
      return;
    }
    if (!Number.isFinite(total) || total < 0) {
      setError("total");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/ink-stock/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          printProcess: selectedProcess,
          quantityMl: qty,
          totalCostMdl: total,
          purchasedAt,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setError("fail");
        return;
      }
      setQtyStr("");
      setTotalStr("");
      setNote("");
      await loadInv();
      await loadHist();
      await loadConsumption();
    } finally {
      setSaving(false);
    }
  }

  async function deleteReceipt(receiptId: string): Promise<void> {
    if (!window.confirm(admin.inkReceiptDeleteConfirm)) {
      return;
    }
    setDeleteMessage(null);
    setDeletingId(receiptId);
    try {
      const res = await fetch(`/api/admin/ink-stock/receipt/${receiptId}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (res.status === 409) {
        setDeleteMessage(admin.inkReceiptDeleteNegative);
        return;
      }
      if (!res.ok) {
        setDeleteMessage(admin.inkReceiptFailed);
        return;
      }
      await loadInv();
      await loadHist();
      await loadConsumption();
    } finally {
      setDeletingId(null);
    }
  }

  const activeTank = tanks?.find((x) => x.printProcess === selectedProcess);

  const dateLoc =
    locale === "ro" ? "ro-RO" : locale === "ru" ? "ru-RU" : "en-US";

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link
        href="/admin/stock"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{admin.inkStockTitle}</h1>
        <p className="mt-1 text-sm text-gray-600">{admin.inkStockIntro}</p>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <span className="mr-2 self-center text-xs font-medium text-gray-500">
          {admin.inkStockSelectLine}
        </span>
        {PRINT_PROCESSES.map((p) => (
          <Button
            key={p}
            type="button"
            variant={selectedProcess === p ? "default" : "outline"}
            size="sm"
            className={cn(
              "h-8 max-w-[280px] whitespace-normal text-left text-xs leading-snug",
              selectedProcess === p ? "" : "bg-white",
            )}
            onClick={() => setSelectedProcess(p)}
          >
            {processTabLabel(p, admin)}
          </Button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">{admin.inkStockOnHand}</h2>
            <p className="mt-1 text-xs text-gray-500">{processTabLabel(selectedProcess, admin)}</p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
              {activeTank != null
                ? activeTank.stockMl.toLocaleString(undefined, { maximumFractionDigits: 3 })
                : "—"}{" "}
              <span className="text-base font-normal text-gray-500">ml</span>
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
              {admin.inkStockAvgCost}
            </p>
            <p className="mt-1 text-lg tabular-nums text-gray-800">
              {activeTank != null
                ? activeTank.avgCostPerMlMdl.toLocaleString(undefined, { maximumFractionDigits: 6 })
                : "—"}{" "}
              {t.admin.currency}/ml
            </p>
            <p className="mt-4 text-xs font-medium uppercase tracking-wide text-gray-500">
              {admin.inkStockNormPerSqm}
            </p>
            <p className="mt-1 text-sm tabular-nums text-gray-800">
              {normByProcess[selectedProcess] != null
                ? normByProcess[selectedProcess]!.toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })
                : "—"}{" "}
              <span className="font-normal text-gray-500">ml/m²</span>
            </p>
            <p className="mt-2 text-xs text-gray-500">{admin.inkStockNormAccountingHint}</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-gray-900">{admin.inkReceiptTitle}</h2>
            <p className="mt-1 text-xs text-gray-500">{processTabLabel(selectedProcess, admin)}</p>
            <div className="mt-4 grid gap-3">
              <label className="block text-xs text-gray-600">
                {admin.inkReceiptQtyMl}
                <Input
                  className="mt-1 h-9"
                  inputMode="decimal"
                  value={qtyStr}
                  onChange={(e) => setQtyStr(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="block text-xs text-gray-600">
                {admin.inkReceiptTotalMdl}
                <Input
                  className="mt-1 h-9"
                  inputMode="numeric"
                  value={totalStr}
                  onChange={(e) => setTotalStr(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="block text-xs text-gray-600">
                {admin.inkReceiptDate}
                <Input
                  type="date"
                  className="mt-1 h-9"
                  value={purchasedAt}
                  onChange={(e) => setPurchasedAt(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="block text-xs text-gray-600">
                {admin.inkReceiptNote}
                <Input
                  className="mt-1 h-9"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
            {error ? (
              <p className="mt-2 text-sm text-red-600">{admin.inkReceiptFailed}</p>
            ) : null}
            <div className="mt-4">
              <Button type="button" size="sm" onClick={() => void submitReceipt()} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {admin.inkReceiptSave}
              </Button>
            </div>
          </div>
        </div>
      )}

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">{admin.inkReceiptHistory}</h2>
        <p className="mt-1 text-xs text-gray-500">{processTabLabel(selectedProcess, admin)}</p>
        {deleteMessage ? (
          <p className="mt-2 text-sm text-red-600">{deleteMessage}</p>
        ) : null}
        {histLoading ? (
          <p className="mt-3 text-sm text-gray-500">…</p>
        ) : history.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">—</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {history.map((h) => (
              <li
                key={h.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2"
              >
                <span className="min-w-0 flex-1 text-gray-800">
                  {h.purchasedAt}: +{h.quantityMl} ml · {h.totalCostMdl} {t.admin.currency}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  {h.createdBy ? (
                    <span className="text-xs text-gray-500">{h.createdBy.name}</span>
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 shrink-0 p-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                    disabled={deletingId !== null}
                    onClick={() => void deleteReceipt(h.id)}
                    aria-label={admin.inkReceiptDelete}
                    title={admin.inkReceiptDelete}
                  >
                    {deletingId === h.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="h-4 w-4" aria-hidden />
                    )}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-900">{admin.inkConsumptionHistory}</h2>
        <p className="mt-1 text-xs text-gray-500">{processTabLabel(selectedProcess, admin)}</p>
        {consumptionLoading ? (
          <p className="mt-3 text-sm text-gray-500">…</p>
        ) : consumption.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">{admin.stockConsumptionEmpty}</p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 text-sm">
            {consumption.map((row) => {
              const when = new Date(row.createdAt).toLocaleString(dateLoc, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
              const qtyStrSigned =
                row.quantityMl > 0
                  ? `+${row.quantityMl.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    })}`
                  : row.quantityMl.toLocaleString(undefined, {
                      maximumFractionDigits: 3,
                    });
              return (
                <li key={row.id} className="py-3">
                  <p className="text-[11px] text-gray-500">{when}</p>
                  <p className="mt-1 font-medium text-gray-900">
                    {qtyStrSigned} ml · {stockConsumptionKindLabel(row.kind, admin)}
                  </p>
                  {row.orderNumber != null && row.orderId ? (
                    <p className="mt-1">
                      <Link
                        href={`/admin/orders/${row.orderId}/edit`}
                        prefetch={false}
                        className="text-gold underline decoration-gold/30 hover:text-amber-900"
                      >
                        {admin.stockConsumptionOrderNumber(row.orderNumber)}
                      </Link>
                    </p>
                  ) : row.orderNumber != null ? (
                    <p className="mt-1 text-gray-800">
                      {admin.stockConsumptionOrderNumber(row.orderNumber)}
                    </p>
                  ) : null}
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                    <span>
                      {admin.stockConsumptionLabelInkCost}:{" "}
                      {row.inkCostMdl != null
                        ? `${row.inkCostMdl} ${t.admin.currency}`
                        : "—"}
                    </span>
                    <span>
                      {admin.stockConsumptionLabelInkSell}:{" "}
                      {row.inkSellPriceMdl != null
                        ? `${row.inkSellPriceMdl} ${t.admin.currency}`
                        : "—"}
                    </span>
                  </div>
                  {row.createdBy ? (
                    <p className="mt-1 text-xs text-gray-500">{row.createdBy.name}</p>
                  ) : null}
                  {row.note ? (
                    <p className="mt-1 text-xs text-gray-500">{row.note}</p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
