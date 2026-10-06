"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  History,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useSheetPapers } from "@/lib/swr";
import type { AdminSheetPaperJson } from "@/lib/businessCard/toAdminSheetPaperJson";
import {
  AdminTableIconActions,
  adminTableOutlineIconButtonClass,
  adminTableOutlineLabeledButtonClass,
} from "@/app/admin/_components/AdminTableIconActions";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { DatePicker } from "@/app/admin/_components/DatePicker";
import { SHEET_PAPER_STOCK_KIND } from "@/lib/businessCard/sheetPaperStockKinds";
import type { TranslationDictionary } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";

type Row = AdminSheetPaperJson;

type MovementRow = {
  id: string;
  quantitySheets: number;
  kind: string;
  orderId: string | null;
  orderNumber: number | null;
  paperCostMdl: number | null;
  paperSellPriceMdl: number | null;
  note: string | null;
  createdAt: string;
  createdBy: { id: string; name: string } | null;
};

type ReceiptRow = {
  id: string;
  quantitySheets: number;
  totalCostMdl: number;
  purchasedAt: string;
  supplier: string | null;
  note: string | null;
  createdBy: { id: string; name: string } | null;
};

/** Sheet paper warehouse: catalog, prices per printed sheet and stock history. */
export default function SheetPapersPageClient() {
  const { t } = useLanguageStore();
  const lf = t.admin;
  const { items, error: loadError, isLoading: loading, mutate } = useSheetPapers();

  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<
    null | { mode: "add" } | { mode: "edit"; row: Row }
  >(null);
  const [receiptFor, setReceiptFor] = useState<Row | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((r) => r.name.toLowerCase().includes(q));
  }, [items, search]);

  const load = useCallback(async () => {
    await mutate();
  }, [mutate]);

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <Link
        href="/admin/stock"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {lf.backToStockHub}
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="shrink-0 text-2xl font-bold tracking-tight text-gray-900">
            {lf.sheetPaperCatalogTitle}
          </h1>
          <div className="relative w-full min-w-0 sm:w-72 sm:max-w-sm">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={lf.sheetPaperCatalogSearchPlaceholder}
              className="h-10 w-full pl-9 pr-3"
              autoComplete="off"
              aria-label={lf.sheetPaperCatalogSearchPlaceholder}
            />
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0"
          onClick={() => setModal({ mode: "add" })}
        >
          <Plus className="h-4 w-4" aria-hidden />
          {lf.sheetPaperCatalogAdd}
        </Button>
      </div>

      <p className="mb-4 text-sm text-gray-600">{lf.sheetPaperCatalogIntro}</p>

      {loadError ? (
        <p className="mb-4 text-sm text-red-600">{lf.sheetPaperCatalogLoadError}</p>
      ) : loading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" aria-hidden />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-600">
          {items.length === 0
            ? lf.sheetPaperCatalogEmpty
            : lf.sheetPaperCatalogSearchEmpty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full min-w-[1100px] text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs font-semibold uppercase tracking-wide text-gray-600">
              <tr>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColName}</th>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColSheetSize}</th>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColStockSheets}</th>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColAvgCost}</th>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColRetail}</th>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColDealer}</th>
                <th className="px-3 py-2.5">{lf.sheetPaperCatalogColActive}</th>
                <th className="px-3 py-2.5 text-right">
                  {lf.sheetPaperCatalogColActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="align-middle transition-colors hover:bg-amber-50/40"
                >
                  <td className="px-3 py-2.5">
                    <p className="font-medium text-gray-900">{r.name}</p>
                    <p className="text-[11px] text-gray-500">
                      {lf.sheetPaperCatalogCardsPerSheet(r.standardCardsPerSheet)}
                    </p>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-700">
                    {r.sheetWidthCm}×{r.sheetHeightCm}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-800">
                    {r.stockSheets.toFixed(0)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-gray-800">
                    {r.avgPurchaseCostPerSheet != null
                      ? r.avgPurchaseCostPerSheet.toFixed(2)
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">
                    {r.retailPricePerSheet}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums font-medium text-gray-900">
                    {r.dealerPricePerSheet}
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
                    <AdminTableIconActions aria-label={lf.sheetPaperCatalogColActions}>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={adminTableOutlineLabeledButtonClass}
                        title={lf.sheetPaperReceiptBtn}
                        aria-label={lf.sheetPaperReceiptBtn}
                        onClick={() => setReceiptFor(r)}
                      >
                        <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="hidden sm:inline">
                          {lf.sheetPaperReceiptBtn}
                        </span>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={adminTableOutlineIconButtonClass}
                        title={lf.sheetPaperCatalogModalEditTitle}
                        aria-label={lf.sheetPaperCatalogModalEditTitle}
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
                        title={lf.sheetPaperCatalogDelete}
                        aria-label={lf.sheetPaperCatalogDelete}
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
      )}

      <AdminConfirmDialog
        open={pendingDelete != null}
        title={lf.sheetPaperCatalogDeleteConfirmTitle}
        description={
          pendingDelete != null
            ? lf.sheetPaperCatalogDeleteConfirmDescription(pendingDelete.name)
            : ""
        }
        confirmLabel={lf.sheetPaperCatalogDelete}
        cancelLabel={lf.sheetPaperCatalogCancel}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setPendingDelete(null);
        }}
        onConfirm={() => {
          void (async () => {
            if (!pendingDelete) return;
            setDeleteBusy(true);
            try {
              const res = await fetch(`/api/admin/sheet-papers/${pendingDelete.id}`, {
                method: "DELETE",
              });
              if (res.ok) await load();
            } finally {
              setDeleteBusy(false);
              setPendingDelete(null);
            }
          })();
        }}
      />

      {receiptFor ? (
        <SheetPaperReceiptModal
          paper={receiptFor}
          onClose={() => setReceiptFor(null)}
          onSaved={load}
        />
      ) : null}

      {modal ? (
        <SheetPaperModal
          initial={modal.mode === "edit" ? modal.row : null}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await load();
          }}
        />
      ) : null}
    </main>
  );
}

/** Shared modal chrome: backdrop, header with a close button, scrollable body. */
function ModalShell({
  titleId,
  title,
  subtitle,
  busy,
  onClose,
  children,
  footer,
}: {
  titleId: string;
  title: string;
  subtitle?: string;
  busy: boolean;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const { t } = useLanguageStore();

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/45"
        aria-label={t.cabinet.orderFileClose}
        onClick={() => {
          if (!busy) onClose();
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[min(92vh,760px)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-5">
          <div className="min-w-0 pr-2">
            <h2
              id={titleId}
              className="text-lg font-bold tracking-tight text-gray-900"
            >
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 line-clamp-2 text-sm leading-snug text-gray-600">
                {subtitle}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => {
              if (!busy) onClose();
            }}
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:pointer-events-none disabled:opacity-50"
            aria-label={t.cabinet.orderFileClose}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          {children}
        </div>

        {footer ? (
          <div className="shrink-0 border-t border-gray-100 px-4 py-3 sm:px-5">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Create / edit one paper: sheet size and the per-printed-sheet sell prices. */
function SheetPaperModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: Row | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguageStore();
  const lf = t.admin;
  const [name, setName] = useState(initial?.name ?? "");
  const [widthStr, setWidthStr] = useState(
    initial ? String(initial.sheetWidthCm) : "22.5",
  );
  const [heightStr, setHeightStr] = useState(
    initial ? String(initial.sheetHeightCm) : "32",
  );
  const [costStr, setCostStr] = useState(String(initial?.costPerSheet ?? 0));
  const [retailStr, setRetailStr] = useState(
    String(initial?.retailPricePerSheet ?? 0),
  );
  const [dealerStr, setDealerStr] = useState(
    String(initial?.dealerPricePerSheet ?? 0),
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  async function submit(): Promise<void> {
    const width = Number.parseFloat(widthStr.replace(",", "."));
    const height = Number.parseFloat(heightStr.replace(",", "."));
    const cost = Number.parseInt(costStr, 10);
    const retail = Number.parseInt(retailStr, 10);
    const dealer = Number.parseInt(dealerStr, 10);
    if (
      !name.trim() ||
      !(width > 0) ||
      !(height > 0) ||
      !Number.isFinite(cost) ||
      !Number.isFinite(retail) ||
      !Number.isFinite(dealer)
    ) {
      setFailed(true);
      return;
    }

    setFailed(false);
    setSaving(true);
    try {
      const res = await fetch(
        initial ? `/api/admin/sheet-papers/${initial.id}` : "/api/admin/sheet-papers",
        {
          method: initial ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            sheetWidthCm: String(width),
            sheetHeightCm: String(height),
            costPerSheet: cost,
            retailPricePerSheet: retail,
            dealerPricePerSheet: dealer,
            isActive,
          }),
        },
      );
      if (!res.ok) {
        setFailed(true);
        return;
      }
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalShell
      titleId="sheet-paper-modal-title"
      title={
        initial
          ? lf.sheetPaperCatalogModalEditTitle
          : lf.sheetPaperCatalogModalAddTitle
      }
      busy={saving}
      onClose={onClose}
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={onClose}
          >
            {lf.sheetPaperCatalogCancel}
          </Button>
          <Button type="button" size="sm" disabled={saving} onClick={() => void submit()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {lf.sheetPaperCatalogSave}
          </Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
          {lf.sheetPaperCatalogColName}
          <Input
            className="mt-1 h-9"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          {lf.sheetPaperCatalogWidthCm}
          <Input
            className="mt-1 h-9"
            inputMode="decimal"
            value={widthStr}
            onChange={(e) => setWidthStr(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          {lf.sheetPaperCatalogHeightCm}
          <Input
            className="mt-1 h-9"
            inputMode="decimal"
            value={heightStr}
            onChange={(e) => setHeightStr(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
          {lf.sheetPaperCatalogCostPerSheet}
          <Input
            className="mt-1 h-9"
            inputMode="numeric"
            value={costStr}
            onChange={(e) => setCostStr(e.target.value)}
            disabled={saving}
          />
          <span className="mt-1 block text-[11px] font-normal text-gray-500">
            {lf.sheetPaperCatalogCostHint}
          </span>
        </label>
        <label className="block text-xs font-medium text-gray-600">
          {lf.sheetPaperCatalogColRetail}
          <Input
            className="mt-1 h-9"
            inputMode="numeric"
            value={retailStr}
            onChange={(e) => setRetailStr(e.target.value)}
            disabled={saving}
          />
        </label>
        <label className="block text-xs font-medium text-gray-600">
          {lf.sheetPaperCatalogColDealer}
          <Input
            className="mt-1 h-9"
            inputMode="numeric"
            value={dealerStr}
            onChange={(e) => setDealerStr(e.target.value)}
            disabled={saving}
          />
        </label>
        <p className="text-[11px] text-gray-500 sm:col-span-2">
          {lf.sheetPaperCatalogPriceHint}
        </p>
        <label className="flex items-center gap-2 text-xs font-medium text-gray-600 sm:col-span-2">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={saving}
            className="h-4 w-4 rounded border-gray-300"
          />
          {lf.sheetPaperCatalogColActive}
        </label>
      </div>

      {failed ? (
        <p className="mt-3 text-sm text-red-600">{lf.sheetPaperCatalogSaveFailed}</p>
      ) : null}
    </ModalShell>
  );
}

/** Register a purchase and review the paper's stock history. */
function SheetPaperReceiptModal({
  paper,
  onClose,
  onSaved,
}: {
  paper: Row;
  onClose: () => void;
  onSaved: () => Promise<void>;
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
  const [failed, setFailed] = useState(false);

  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  const loadHistory = useCallback(() => {
    setHistoryLoading(true);
    void Promise.all([
      fetch(`/api/admin/sheet-papers/${paper.id}/receipts`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`/api/admin/sheet-papers/${paper.id}/stock-movements`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ])
      .then(([rec, mov]) => {
        setReceipts((rec as { items?: ReceiptRow[] } | null)?.items ?? []);
        setMovements((mov as { items?: MovementRow[] } | null)?.items ?? []);
      })
      .finally(() => setHistoryLoading(false));
  }, [paper.id]);

  useEffect(loadHistory, [loadHistory]);

  async function submit(): Promise<void> {
    const qty = Number.parseFloat(qtyStr.replace(",", "."));
    const total = Number.parseInt(totalStr.replace(/\s/g, ""), 10);
    if (!(qty > 0) || !Number.isFinite(total) || total < 0) {
      setFailed(true);
      return;
    }

    setFailed(false);
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/sheet-papers/${paper.id}/receipt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quantitySheets: qty,
          totalCostMdl: total,
          purchasedAt,
          supplier: supplier.trim() || null,
          note: note.trim() || null,
        }),
      });
      if (!res.ok) {
        setFailed(true);
        return;
      }
      setQtyStr("");
      setTotalStr("");
      loadHistory();
      await onSaved();
    } finally {
      setSaving(false);
    }
  }

  const dateLoc = locale === "ro" ? "ro-RO" : locale === "ru" ? "ru-RU" : "en-US";

  return (
    <ModalShell
      titleId="sheet-paper-receipt-modal-title"
      title={lf.sheetPaperReceiptModalTitle}
      subtitle={paper.name}
      busy={saving}
      onClose={onClose}
    >
      <div className="rounded-xl border border-gray-200 bg-gray-50/70 p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-medium text-gray-600">
            {lf.sheetPaperReceiptQtySheets}
            <Input
              className="mt-1 h-9 bg-white"
              inputMode="decimal"
              value={qtyStr}
              onChange={(e) => setQtyStr(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            {lf.sheetPaperReceiptTotalMdl}
            <Input
              className="mt-1 h-9 bg-white"
              inputMode="numeric"
              value={totalStr}
              onChange={(e) => setTotalStr(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="block text-xs font-medium text-gray-600">
            {lf.sheetPaperReceiptDate}
            <div className="mt-1">
              <DatePicker
                value={purchasedAt}
                onChange={setPurchasedAt}
                locale={locale}
                t={t}
                clearable={false}
                disabled={saving}
                ariaLabel={lf.sheetPaperReceiptDate}
              />
            </div>
          </label>
          <label className="block text-xs font-medium text-gray-600">
            {lf.sheetPaperReceiptSupplier}
            <Input
              className="mt-1 h-9 bg-white"
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="block text-xs font-medium text-gray-600 sm:col-span-2">
            {lf.sheetPaperReceiptNote}
            <Input
              className="mt-1 h-9 bg-white"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
            />
          </label>
        </div>

        {failed ? (
          <p className="mt-3 text-sm text-red-600">{lf.sheetPaperReceiptFailed}</p>
        ) : null}

        <div className="mt-3 flex justify-end">
          <Button type="button" size="sm" disabled={saving} onClick={() => void submit()}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : null}
            {lf.sheetPaperReceiptSave}
          </Button>
        </div>
      </div>

      <h3 className="mt-5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
        <History className="h-3.5 w-3.5" aria-hidden />
        {lf.sheetPaperHistoryTitle}
      </h3>

      {historyLoading ? (
        <p className="mt-2 text-sm text-gray-500">{lf.sheetPaperHistoryLoading}</p>
      ) : receipts.length === 0 && movements.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">{lf.sheetPaperHistoryEmpty}</p>
      ) : (
        <ul className="mt-2 divide-y divide-gray-100 text-sm">
          {receipts.map((r) => (
            <li key={r.id} className="flex items-baseline justify-between gap-3 py-2">
              <span className="min-w-0">
                <span className="font-medium text-gray-900">
                  {lf.sheetPaperMovementReceipt}
                </span>
                <span className="ml-2 text-xs text-gray-500">
                  {formatSheetPaperDate(r.purchasedAt, dateLoc)}
                  {r.supplier ? ` · ${r.supplier}` : ""}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-gray-800">
                +{r.quantitySheets.toFixed(0)} · {r.totalCostMdl} {lf.currency}
              </span>
            </li>
          ))}
          {movements
            .filter((m) => m.kind !== SHEET_PAPER_STOCK_KIND.RECEIPT)
            .map((m) => (
              <li key={m.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="font-medium text-gray-900">
                    {movementLabel(m, lf)}
                  </span>
                  <span className="ml-2 text-xs text-gray-500">
                    {formatSheetPaperDate(m.createdAt, dateLoc)}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums text-gray-800">
                  {m.quantitySheets > 0 ? "+" : ""}
                  {m.quantitySheets.toFixed(0)}
                </span>
              </li>
            ))}
        </ul>
      )}
    </ModalShell>
  );
}

function movementLabel(
  movement: MovementRow,
  lf: TranslationDictionary["admin"],
): string {
  switch (movement.kind) {
    case SHEET_PAPER_STOCK_KIND.ORDER_SALE:
      return movement.orderNumber != null
        ? lf.sheetPaperMovementSale(movement.orderNumber)
        : lf.sheetPaperMovementAdjust;
    case SHEET_PAPER_STOCK_KIND.ORDER_RETURN:
      return lf.sheetPaperMovementReturn;
    case SHEET_PAPER_STOCK_KIND.RECEIPT:
      return lf.sheetPaperMovementReceipt;
    default:
      return lf.sheetPaperMovementAdjust;
  }
}

function formatSheetPaperDate(iso: string, dateLoc: string): string {
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(dateLoc, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
