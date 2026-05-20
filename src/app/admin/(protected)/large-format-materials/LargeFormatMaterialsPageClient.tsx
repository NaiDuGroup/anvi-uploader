"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  ArrowLeft,
  Loader2,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { AdminLargeFormatMaterialJson } from "@/lib/largeFormat/toAdminLargeFormatMaterialJson";
import {
  AdminTableIconActions,
  adminTableOutlineIconButtonClass,
  adminTableOutlineLabeledButtonClass,
} from "@/app/admin/_components/AdminTableIconActions";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { cn } from "@/lib/utils";
import { stockConsumptionKindLabel } from "@/lib/stockConsumptionUi";

type Row = AdminLargeFormatMaterialJson;

type LfRollConsumptionMovementRow = {
  id: string;
  quantityLinearMeters: number;
  kind: string;
  orderId: string | null;
  orderNumber: number | null;
  materialCostMdl: number | null;
  materialSellPriceMdl: number | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

function formatLfRollModalDateOnly(isoDate: string, dateLoc: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(isoDate) ? `${isoDate}T12:00:00` : isoDate;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString(dateLoc, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function rowMatchesSearch(r: Row, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return r.name.toLowerCase().includes(s);
}

export default function LargeFormatMaterialsPageClient() {
  const { t } = useLanguageStore();
  const lf = t.admin;
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<null | { mode: "add" } | { mode: "edit"; row: Row }>(
    null,
  );
  const [receiptFor, setReceiptFor] = useState<Row | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(
    () => items.filter((r) => rowMatchesSearch(r, search)),
    [items, search],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/large-format-materials");
      const raw = (await res.json().catch(() => ({}))) as {
        items?: Row[];
        error?: string;
        details?: string;
        prismaMessage?: string;
        hint?: string;
      };
      if (!res.ok) {
        if (res.status === 401) {
          setError(lf.lfMaterialCatalogLoadErrorUnauthorized);
          return;
        }
        if (
          res.status === 503 &&
          (raw.error === "prisma_client_outdated" ||
            raw.error === "database_schema_outdated")
        ) {
          setError(lf.lfMaterialCatalogLoadErrorSetup);
          return;
        }
        setError(lf.lfMaterialCatalogLoadErrorGeneric);
        return;
      }
      setItems(raw.items ?? []);
    } catch {
      setError(lf.lfMaterialCatalogLoadErrorGeneric);
    } finally {
      setLoading(false);
    }
  }, [lf]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link
        href="/admin/stock"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-gray-900">
            {lf.lfMaterialCatalogTitle}
          </h1>
          <div className="relative w-full min-w-0 sm:max-w-sm sm:w-72">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lf.lfMaterialCatalogSearchPlaceholder}
              className="h-10 w-full pl-9 pr-3"
              autoComplete="off"
              aria-label={lf.lfMaterialCatalogSearchPlaceholder}
            />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <Button
            type="button"
            size="sm"
            className="shrink-0"
            onClick={() => setModal({ mode: "add" })}
          >
            <Plus className="h-4 w-4" aria-hidden />
            {lf.lfMaterialCatalogAdd}
          </Button>
        </div>
      </div>

      {error ? (
        <p className="mb-4 text-sm text-red-600">{error}</p>
      ) : null}

      {!error && loading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      ) : !error && filtered.length === 0 ? (
        <p className="text-sm text-gray-600">{lf.lfMaterialCatalogSearchEmpty}</p>
      ) : !error ? (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[1280px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColName}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColRollWidthM}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColPrintableWidthM}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColRollLengthM}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColStockLm}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColAvgLm}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColPurchaseM2}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColEffectiveCostLm}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColFinalRetailLm}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColFinalDealerLm}</th>
                <th className="px-3 py-2.5">{lf.lfMaterialCatalogColActive}</th>
                <th className="px-3 py-2.5 text-right">{lf.lfMaterialCatalogColActions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-gray-100 align-middle transition-colors hover:bg-amber-50/40"
                >
                  <td className="px-3 py-2.5 font-medium text-gray-900">{r.name}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">{r.rollWidthMeters}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">
                    {r.printableWidthMeters ?? "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">{r.rollLengthMeters}</td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-800">
                    {Number.isFinite(r.stockLinearMeters) ? r.stockLinearMeters.toFixed(3) : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-800">
                    {r.avgPurchaseCostPerLinearMeter != null
                      ? Math.round(r.avgPurchaseCostPerLinearMeter * 10000) / 10000
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-800">
                    {r.purchaseCostPerSqmMdl != null ? r.purchaseCostPerSqmMdl : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-800">
                    {(() => {
                      const eff =
                        r.avgPurchaseCostPerLinearMeter != null
                          ? r.avgPurchaseCostPerLinearMeter
                          : r.costPerLinearMeter;
                      return typeof eff === "number" && Number.isFinite(eff)
                        ? Math.round(eff * 10000) / 10000
                        : "—";
                    })()}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">
                    <span className="inline-flex items-baseline gap-1">
                      {r.effectiveRetailPricePerLinearMeter}
                      {r.manualFinalRetailPricePerLinearMeter != null ? (
                        <span
                          className="rounded bg-amber-50 px-1 text-[10px] font-normal uppercase tracking-wide text-amber-900 ring-1 ring-amber-100"
                          title={lf.lfMaterialCatalogManualPriceHint}
                        >
                          {lf.lfMaterialCatalogManualPriceBadge}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">
                    <span className="inline-flex items-baseline gap-1">
                      {r.effectiveDealerPricePerLinearMeter}
                      {r.manualFinalDealerPricePerLinearMeter != null ? (
                        <span
                          className="rounded bg-amber-50 px-1 text-[10px] font-normal uppercase tracking-wide text-amber-900 ring-1 ring-amber-100"
                          title={lf.lfMaterialCatalogManualPriceHint}
                        >
                          {lf.lfMaterialCatalogManualPriceBadge}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        r.isActive
                          ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100"
                          : "bg-gray-100 text-gray-600 ring-1 ring-gray-200",
                      )}
                    >
                      {r.isActive
                        ? lf.lfMaterialCatalogBadgeActive
                        : lf.lfMaterialCatalogBadgeInactive}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <AdminTableIconActions aria-label={lf.lfMaterialCatalogColActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={adminTableOutlineLabeledButtonClass}
                        title={lf.lfMaterialCatalogReceiptBtn}
                        aria-label={lf.lfMaterialCatalogReceiptBtn}
                        onClick={() => setReceiptFor(r)}
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="hidden sm:inline">{lf.lfMaterialCatalogReceiptBtn}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={adminTableOutlineIconButtonClass}
                        title={lf.lfMaterialCatalogModalEditTitle}
                        aria-label={lf.lfMaterialCatalogModalEditTitle}
                        onClick={() => setModal({ mode: "edit", row: r })}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={cn(
                          adminTableOutlineIconButtonClass,
                          "border-red-100 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700",
                        )}
                        title={lf.lfMaterialCatalogDelete}
                        aria-label={lf.lfMaterialCatalogDelete}
                        onClick={() => setPendingDelete(r)}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </Button>
                    </AdminTableIconActions>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={pendingDelete != null}
        title={lf.lfMaterialCatalogDeleteConfirmTitle}
        description={
          pendingDelete != null
            ? lf.lfMaterialCatalogDeleteConfirmDescription(pendingDelete.name)
            : ""
        }
        confirmLabel={lf.lfMaterialCatalogDelete}
        cancelLabel={lf.lfMaterialCatalogCancel}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setPendingDelete(null);
        }}
        onConfirm={() => {
          void (async () => {
            if (!pendingDelete) return;
            setDeleteBusy(true);
            try {
              const res = await fetch(
                `/api/admin/large-format-materials/${pendingDelete.id}`,
                { method: "DELETE" },
              );
              if (res.ok) void load();
            } finally {
              setDeleteBusy(false);
              setPendingDelete(null);
            }
          })();
        }}
      />

      {receiptFor ? (
        <LfRollReceiptModal
          material={receiptFor}
          onClose={() => setReceiptFor(null)}
          onReceiptSaved={load}
        />
      ) : null}

      {modal ? (
        <LfMaterialModal
          mode={modal.mode}
          initial={modal.mode === "edit" ? modal.row : null}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
          saving={saving}
          setSaving={setSaving}
        />
      ) : null}
    </main>
  );
}

function LfRollReceiptModal({
  material,
  onClose,
  onReceiptSaved,
}: {
  material: Row;
  onClose: () => void;
  onReceiptSaved: () => Promise<void>;
}) {
  const { t, locale } = useLanguageStore();
  const lf = t.admin;
  const [qtyStr, setQtyStr] = useState("");
  const [totalStr, setTotalStr] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<
    {
      id: string;
      quantityLinearMeters: number;
      totalCostMdl: number;
      purchasedAt: string;
      supplier: string | null;
      note: string | null;
      createdBy: { id: string; name: string } | null;
    }[]
  >([]);
  const [histLoading, setHistLoading] = useState(true);
  const [consumptionRows, setConsumptionRows] = useState<LfRollConsumptionMovementRow[]>(
    [],
  );
  const [consumeLoading, setConsumeLoading] = useState(true);

  const loadHist = useCallback(() => {
    setHistLoading(true);
    void fetch(`/api/admin/large-format-materials/${material.id}/receipts`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: { items?: typeof history } | null) => {
        setHistory(raw?.items ?? []);
      })
      .catch(() => setHistory([]))
      .finally(() => setHistLoading(false));
  }, [material.id]);

  const loadConsume = useCallback(() => {
    setConsumeLoading(true);
    void fetch(`/api/admin/large-format-materials/${material.id}/stock-movements`)
      .then((r) => (r.ok ? r.json() : null))
      .then((raw: { items?: LfRollConsumptionMovementRow[] } | null) => {
        setConsumptionRows(raw?.items ?? []);
      })
      .catch(() => setConsumptionRows([]))
      .finally(() => setConsumeLoading(false));
  }, [material.id]);

  useEffect(() => {
    loadHist();
    loadConsume();
  }, [loadHist, loadConsume]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !saving) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function submit(): Promise<void> {
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
      const res = await fetch(`/api/admin/large-format-materials/${material.id}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantityLinearMeters: qty,
          totalCostMdl: total,
          purchasedAt,
          supplier: supplier.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setError("fail");
        return;
      }
      setQtyStr("");
      setTotalStr("");
      loadHist();
      loadConsume();
      await onReceiptSaved();
    } finally {
      setSaving(false);
    }
  }

  const dateLoc =
    locale === "ro" ? "ro-RO" : locale === "ru" ? "ru-RU" : "en-US";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={t.cabinet.orderFileClose}
        onClick={() => {
          if (!saving) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lf-roll-receipt-modal-title"
        className="relative flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
          <div className="min-w-0 pr-2">
            <h2
              id="lf-roll-receipt-modal-title"
              className="text-lg font-bold tracking-tight text-gray-900"
            >
              {lf.lfRollReceiptModalTitle}
            </h2>
            <p className="mt-1 line-clamp-2 text-sm leading-snug text-gray-600">{material.name}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-50"
            aria-label={t.cabinet.orderFileClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
                {lf.lfRollReceiptQtyLm}
                <Input
                  className="mt-1 h-9 bg-white"
                  inputMode="decimal"
                  value={qtyStr}
                  onChange={(e) => setQtyStr(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                {lf.lfRollReceiptTotalMdl}
                <Input
                  className="mt-1 h-9 bg-white"
                  inputMode="numeric"
                  value={totalStr}
                  onChange={(e) => setTotalStr(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600">
                {lf.lfRollReceiptDate}
                <div className="mt-1">
                  <DatePicker
                    value={purchasedAt}
                    onChange={setPurchasedAt}
                    locale={locale}
                    t={t}
                    clearable={false}
                    disabled={saving}
                    ariaLabel={lf.lfRollReceiptDate}
                  />
                </div>
              </label>
              <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
                {lf.lfRollReceiptSupplier}
                <Input
                  className="mt-1 h-9 bg-white"
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  disabled={saving}
                />
              </label>
              <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
                {lf.lfRollReceiptNote}
                <Input
                  className="mt-1 h-9 bg-white"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  disabled={saving}
                />
              </label>
            </div>
            {error ? (
              <p className="mt-3 text-sm text-red-600">{lf.lfRollReceiptFailed}</p>
            ) : null}
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <section
              className="flex flex-col rounded-xl border border-emerald-200/80 bg-gradient-to-b from-emerald-50/90 to-white p-4 shadow-sm"
              aria-label={lf.lfRollReceiptHistory}
            >
              <div className="mb-3 flex items-center gap-2 text-emerald-950">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800 ring-1 ring-emerald-200/80">
                  <PackagePlus className="h-4 w-4 shrink-0" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold leading-tight">{lf.lfRollReceiptHistory}</h3>
              </div>
              {histLoading ? (
                <div className="flex flex-1 items-center justify-center py-8 text-gray-400">
                  <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                </div>
              ) : history.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">—</p>
              ) : (
                <ul className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
                  {history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded-lg border border-emerald-100/90 bg-white/90 px-3 py-2.5 shadow-sm"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold tabular-nums text-emerald-900">
                          +{h.quantityLinearMeters} m
                        </span>
                        <time
                          className="text-[11px] font-medium text-gray-500"
                          dateTime={h.purchasedAt}
                        >
                          {formatLfRollModalDateOnly(h.purchasedAt, dateLoc)}
                        </time>
                      </div>
                      <p className="mt-1 text-xs font-medium text-gray-900">
                        {h.totalCostMdl} {t.admin.currency}
                      </p>
                      {h.createdBy ? (
                        <p className="mt-1 text-[11px] text-gray-500">{h.createdBy.name}</p>
                      ) : null}
                      {h.supplier ? (
                        <p className="mt-1 text-[11px] text-gray-600">{h.supplier}</p>
                      ) : null}
                      {h.note ? (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-500">
                          {h.note}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section
              className="flex flex-col rounded-xl border border-amber-200/80 bg-gradient-to-b from-amber-50/80 to-white p-4 shadow-sm"
              aria-label={lf.lfRollConsumptionHistory}
            >
              <div className="mb-3 flex items-center gap-2 text-amber-950">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-900 ring-1 ring-amber-200/80">
                  <PackageMinus className="h-4 w-4 shrink-0" aria-hidden />
                </span>
                <h3 className="text-sm font-semibold leading-tight">{lf.lfRollConsumptionHistory}</h3>
              </div>
              {consumeLoading ? (
                <div className="flex flex-1 items-center justify-center py-8 text-gray-400">
                  <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
                </div>
              ) : consumptionRows.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-500">{lf.stockConsumptionEmpty}</p>
              ) : (
                <ul className="max-h-52 space-y-2 overflow-y-auto pr-0.5">
                  {consumptionRows.map((row) => {
                    const when = new Date(row.createdAt).toLocaleString(dateLoc, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const qtyDisp =
                      row.quantityLinearMeters > 0
                        ? `+${row.quantityLinearMeters}`
                        : String(row.quantityLinearMeters);
                    const outflow = row.quantityLinearMeters < 0;
                    return (
                      <li
                        key={row.id}
                        className={cn(
                          "rounded-lg border px-3 py-2.5 shadow-sm bg-white/90",
                          outflow ? "border-amber-100/90" : "border-gray-100",
                        )}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span
                            className={cn(
                              "text-sm font-semibold tabular-nums",
                              outflow ? "text-amber-900" : "text-gray-900",
                            )}
                          >
                            {qtyDisp} m
                          </span>
                          <time className="text-[11px] font-medium text-gray-500">{when}</time>
                        </div>
                        <p className="mt-0.5 text-xs font-medium text-gray-800">
                          {stockConsumptionKindLabel(row.kind, lf)}
                        </p>
                        {row.orderNumber != null && row.orderId ? (
                          <p className="mt-1">
                            <Link
                              href={`/admin/orders/${row.orderId}/edit`}
                              prefetch={false}
                              className="text-xs font-medium text-gold underline decoration-gold/30 hover:text-amber-900"
                            >
                              {lf.stockConsumptionOrderNumber(row.orderNumber)}
                            </Link>
                          </p>
                        ) : row.orderNumber != null ? (
                          <p className="mt-1 text-xs text-gray-700">
                            {lf.stockConsumptionOrderNumber(row.orderNumber)}
                          </p>
                        ) : null}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-gray-600">
                          <span>
                            {lf.stockConsumptionLabelMaterialCost}:{" "}
                            {row.materialCostMdl != null
                              ? `${row.materialCostMdl} ${t.admin.currency}`
                              : "—"}
                          </span>
                          <span>
                            {lf.stockConsumptionLabelMaterialSell}:{" "}
                            {row.materialSellPriceMdl != null
                              ? `${row.materialSellPriceMdl} ${t.admin.currency}`
                              : "—"}
                          </span>
                        </div>
                        {row.createdBy ? (
                          <p className="mt-1 text-[11px] text-gray-500">{row.createdBy.name}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-gray-100 bg-gray-50/90 px-4 py-3 sm:px-5">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
            size="sm"
          >
            {lf.lfMaterialCatalogCancel}
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {lf.lfRollReceiptSave}
          </Button>
        </div>
      </div>
    </div>
  );
}

function LfMaterialModal({
  mode,
  initial,
  onClose,
  onSaved,
  saving,
  setSaving,
}: {
  mode: "add" | "edit";
  initial: Row | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  saving: boolean;
  setSaving: (v: boolean) => void;
}) {
  const { t } = useLanguageStore();
  const lf = t.admin;
  const [name, setName] = useState(initial?.name ?? "");
  const [rollW, setRollW] = useState(initial?.rollWidthMeters ?? "1.07");
  const [printableW, setPrintableW] = useState(initial?.printableWidthMeters ?? "");
  const [rollL, setRollL] = useState(initial?.rollLengthMeters ?? "50");
  const [manualRetail, setManualRetail] = useState(
    initial?.manualFinalRetailPricePerLinearMeter != null
      ? String(initial.manualFinalRetailPricePerLinearMeter)
      : "",
  );
  const [manualDealer, setManualDealer] = useState(
    initial?.manualFinalDealerPricePerLinearMeter != null
      ? String(initial.manualFinalDealerPricePerLinearMeter)
      : "",
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [err, setErr] = useState("");
  const [refInkPerSqm, setRefInkPerSqm] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/print-economics-settings")
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (d: {
          inkMlPerSqmLargeFormatRoll?: number;
          inkMlPerSqm?: number;
          avgInkCostPerMlMdl?: number;
        } | null) => {
          if (
            cancelled ||
            !d ||
            (typeof d.inkMlPerSqmLargeFormatRoll !== "number" &&
              typeof d.inkMlPerSqm !== "number") ||
            typeof d.avgInkCostPerMlMdl !== "number"
          ) {
            return;
          }
          const norm =
            typeof d.inkMlPerSqmLargeFormatRoll === "number"
              ? d.inkMlPerSqmLargeFormatRoll
              : d.inkMlPerSqm ?? 0;
          setRefInkPerSqm(
            Math.round(norm * d.avgInkCostPerMlMdl * 100) / 100,
          );
        },
      );
    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveCogsLm =
    initial != null
      ? initial.avgPurchaseCostPerLinearMeter ?? initial.costPerLinearMeter
      : null;

  async function submit(): Promise<void> {
    setErr("");
    const parseOptionalNonneg = (s: string): number | "invalid" | null => {
      const t = s.trim().replace(/\s/g, "");
      if (t === "") return null;
      const n = Number.parseInt(t, 10);
      if (!Number.isFinite(n) || n < 0) return "invalid";
      return n;
    };
    const mr = parseOptionalNonneg(manualRetail);
    const md = parseOptionalNonneg(manualDealer);
    if (mr === "invalid" || md === "invalid") {
      setErr("validation");
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: name.trim(),
        rollWidthMeters: rollW,
        rollLengthMeters: rollL,
        finalRetailPricePerLinearMeter: 0,
        finalDealerPricePerLinearMeter: 0,
        manualFinalRetailPricePerLinearMeter: mr,
        manualFinalDealerPricePerLinearMeter: md,
        isActive,
      };
      if (printableW.trim() !== "") {
        payload.printableWidthMeters = printableW.trim();
      } else if (mode === "edit") {
        payload.printableWidthMeters = null;
      }
      const url =
        mode === "add"
          ? "/api/admin/large-format-materials"
          : `/api/admin/large-format-materials/${initial!.id}`;
      const res = await fetch(url, {
        method: mode === "add" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        setErr("Save failed");
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-200 bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">
          {mode === "add" ? lf.lfMaterialCatalogModalAddTitle : lf.lfMaterialCatalogModalEditTitle}
        </h2>
        <div className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-gray-700">{lf.lfMaterialCatalogColName}</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-10" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">{lf.lfMaterialCatalogColRollWidthM}</label>
              <Input value={rollW} onChange={(e) => setRollW(e.target.value)} className="h-9" />
            </div>
            <div>
              <label className="text-xs text-gray-600">{lf.lfMaterialCatalogColRollLengthM}</label>
              <Input value={rollL} onChange={(e) => setRollL(e.target.value)} className="h-9" />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-600">{lf.lfMaterialCatalogColPrintableWidthM}</label>
            <Input
              value={printableW}
              onChange={(e) => setPrintableW(e.target.value)}
              className="h-9"
              placeholder=""
            />
            <p className="mt-1 text-[10px] text-gray-500">{lf.lfMaterialCatalogPrintableWidthHint}</p>
          </div>

          <div className="rounded-lg border border-gray-100 bg-gray-50/90 p-3">
            <p className="text-xs font-semibold text-gray-800">{lf.lfMaterialCatalogColEffectiveCostLm}</p>
            <p className="mt-1 text-sm tabular-nums text-gray-900">
              {effectiveCogsLm != null && Number.isFinite(Number(effectiveCogsLm))
                ? `${Math.round(Number(effectiveCogsLm) * 10000) / 10000} ${t.admin.currency} / m`
                : "—"}
            </p>
            <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
              {lf.lfMaterialCatalogEffectiveCostHint}
            </p>
          </div>

          {refInkPerSqm != null ? (
            <p className="text-[10px] leading-relaxed text-gray-500">
              {lf.lfMaterialCatalogReferenceInkCostPerSqm}:{" "}
              <span className="font-medium text-gray-700">
                {refInkPerSqm.toLocaleString()} {t.admin.currency}/m²
              </span>
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-600">
                {lf.lfMaterialCatalogManualRetailLmOptional}
              </label>
              <Input
                value={manualRetail}
                onChange={(e) => setManualRetail(e.target.value)}
                className="h-9"
                inputMode="numeric"
                placeholder="—"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">
                {lf.lfMaterialCatalogManualDealerLmOptional}
              </label>
              <Input
                value={manualDealer}
                onChange={(e) => setManualDealer(e.target.value)}
                className="h-9"
                inputMode="numeric"
                placeholder="—"
              />
            </div>
          </div>
          <p className="text-[10px] leading-relaxed text-gray-500">{lf.lfMaterialCatalogManualPriceHint}</p>
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-gray-300"
              />
              {lf.lfMaterialCatalogColActive}
            </label>
          </div>
          {err ? <p className="text-sm text-red-600">{err}</p> : null}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {lf.lfMaterialCatalogCancel}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => void submit()}
            disabled={saving || !name.trim()}
            className="gap-2"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {lf.lfMaterialCatalogSave}
          </Button>
        </div>
      </div>
    </div>
  );
}
