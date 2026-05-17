"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  ArrowLeft,
  CircleDollarSign,
  Copy,
  Handshake,
  History,
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Store,
  X,
} from "lucide-react";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n";
import {
  AdminTableIconActions,
  adminTableOutlineIconButtonClass,
  adminTableOutlineLabeledButtonClass,
} from "@/app/admin/_components/AdminTableIconActions";
import { NOTEBOOK_STOCK_KIND } from "@/lib/notebook/notebookStockKinds";
import {
  DPI_PRESETS,
  NOTEBOOK_DEFAULT_PRINT,
  cmToPx,
  type Dpi,
} from "@/lib/printDimensions";
import {
  NOTEBOOK_PAPER_KINDS,
  NOTEBOOK_PAPER_KIND_DEFAULT,
  type NotebookPaperKind,
} from "@/lib/notebook/notebookPaperKind";
import { NotebookPaperKindBadge } from "@/app/notebook/_components/NotebookPaperKindBadge";

type Row = {
  id: string;
  sku: string;
  nameRo: string;
  nameRu: string;
  nameEn: string;
  stockQuantity: number;
  sellPrice: number | null;
  dealerPrice: number | null;
  purchaseCost: number | null;
  imageUrl: string | null;
  imagePublicUrl: string | null;
  coverColorHex: string;
  strapColorHex: string;
  bookmarkColorHex: string;
  paperKind: NotebookPaperKind;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  updatedAt: string;
};

type AdminNotebookCatalogStrings = Pick<
  TranslationDictionary["admin"],
  | "printDimensions"
  | "notebookCatalogTitle"
  | "notebookCatalogAdd"
  | "notebookCatalogSearchPlaceholder"
  | "notebookCatalogSearchEmpty"
  | "notebookCatalogBadgeActive"
  | "notebookCatalogBadgeInactive"
  | "notebookCatalogColSku"
  | "notebookCatalogColNameRo"
  | "notebookCatalogColNameRu"
  | "notebookCatalogColNameEn"
  | "notebookCatalogNamesSection"
  | "notebookCatalogColPhoto"
  | "notebookCatalogColStock"
  | "notebookCatalogPhotoDrop"
  | "notebookCatalogSkuTaken"
  | "notebookCatalogColCover"
  | "notebookCatalogColStrap"
  | "notebookCatalogColBookmark"
  | "notebookCatalogColorsSection"
  | "notebookCatalogColPaperKind"
  | "notebookCatalogPaperKindHint"
  | "notebookPaperKindRuled"
  | "notebookPaperKindSquared"
  | "notebookPaperKindDated"
  | "notebookCatalogColActive"
  | "notebookCatalogColSellPrice"
  | "notebookCatalogColPurchaseCost"
  | "notebookCatalogFieldPurchaseCost"
  | "notebookCatalogColDealerPrice"
  | "notebookCatalogOpenEdit"
  | "notebookCatalogCopy"
  | "notebookCatalogColActions"
  | "notebookCatalogModalAddTitle"
  | "notebookCatalogModalEditTitle"
  | "notebookCatalogCancel"
  | "notebookCatalogInternalNotes"
  | "notebookCatalogSave"
  | "notebookCatalogReceiptOpen"
  | "notebookCatalogReceiptTitle"
  | "notebookCatalogReceiptQtyLabel"
  | "notebookCatalogReceiptNote"
  | "notebookCatalogReceiptSave"
  | "notebookCatalogReceiptNoLines"
  | "notebookCatalogReceiptFailed"
  | "notebookCatalogHistoryOpen"
  | "notebookCatalogHistoryTitle"
  | "notebookCatalogHistoryEmpty"
  | "notebookCatalogHistoryLoading"
  | "notebookCatalogMovementSale"
  | "notebookCatalogMovementReturn"
  | "notebookCatalogMovementReceipt"
>;

function stockMovementDetailLabel(
  m: { kind: string; orderNumber: number | null },
  t: AdminNotebookCatalogStrings,
): string {
  if (m.kind === NOTEBOOK_STOCK_KIND.ORDER_SALE) {
    return t.notebookCatalogMovementSale(m.orderNumber ?? 0);
  }
  if (m.kind === NOTEBOOK_STOCK_KIND.ORDER_STOCK_RETURN) {
    return t.notebookCatalogMovementReturn;
  }
  if (m.kind === NOTEBOOK_STOCK_KIND.RECEIPT) {
    return t.notebookCatalogMovementReceipt;
  }
  return m.kind;
}

const catalogMetricIconCls = "h-3.5 w-3.5 shrink-0 text-gray-500";

function rowMatchesSearch(r: Row, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return (
    r.sku.toLowerCase().includes(s) ||
    r.nameRo.toLowerCase().includes(s) ||
    r.nameRu.toLowerCase().includes(s) ||
    r.nameEn.toLowerCase().includes(s)
  );
}

export default function NotebookCatalogPageClient() {
  const { t, locale } = useLanguageStore();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { mode: "add" } | { mode: "edit"; row: Row }>(null);
  const [search, setSearch] = useState("");
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [receiptQty, setReceiptQty] = useState<Record<string, string>>({});
  const [receiptNote, setReceiptNote] = useState("");
  const [receiptSaving, setReceiptSaving] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [historyRow, setHistoryRow] = useState<Row | null>(null);
  const [historyMovements, setHistoryMovements] = useState<
    {
      id: string;
      delta: number;
      kind: string;
      orderNumber: number | null;
      note: string | null;
      createdAt: string;
    }[]
  >([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const filteredItems = useMemo(
    () => items.filter((r) => rowMatchesSearch(r, search)),
    [items, search],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/notebook-products");
      if (!res.ok) throw new Error("load_failed");
      const data = await res.json();
      setItems(data.items ?? []);
    } catch {
      setError("Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadFile(file: File): Promise<string> {
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "image/jpeg",
      }),
    });
    if (!urlRes.ok) throw new Error("upload_url");
    const { uploadUrl, fileKey } = await urlRes.json();
    const up = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!up.ok) throw new Error("upload_put");
    return fileKey as string;
  }

  async function persistPayload(
    body: Record<string, unknown>,
    mode: "add" | "edit",
    id?: string,
  ) {
    const url = mode === "add"
      ? "/api/admin/notebook-products"
      : `/api/admin/notebook-products/${id}`;
    const res = await fetch(url, {
      method: mode === "add" ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const errJson = (await res.json().catch(() => ({}))) as {
      error?: string;
      hint?: string;
      prismaMessage?: string;
    };
    if (!res.ok) {
      if (errJson.error === "sku_taken") throw new Error("sku_taken");
      if (errJson.error === "database_schema_outdated" && errJson.hint) {
        throw new Error(errJson.hint);
      }
      if (errJson.error === "prisma_client_stale" && errJson.hint) {
        throw new Error(errJson.hint);
      }
      if (errJson.error === "prisma_validation_failed" && errJson.hint) {
        const detail = errJson.prismaMessage ?? "";
        throw new Error(detail ? `${errJson.hint}\n\n${detail}` : errJson.hint);
      }
      throw new Error(errJson.error ?? "save_failed");
    }
    await load();
  }

  async function openHistory(row: Row) {
    setHistoryRow(row);
    setHistoryLoading(true);
    setHistoryMovements([]);
    try {
      const res = await fetch(`/api/admin/notebook-products/${row.id}/stock-movements`);
      if (!res.ok) throw new Error("load_failed");
      const data = (await res.json()) as {
        movements?: {
          id: string;
          delta: number;
          kind: string;
          orderNumber: number | null;
          note: string | null;
          createdAt: string;
        }[];
      };
      setHistoryMovements(data.movements ?? []);
    } catch {
      setHistoryMovements([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function submitReceipt() {
    setReceiptError(null);
    const lines = items
      .map((r) => {
        const raw = (receiptQty[r.id] ?? "").trim();
        if (raw === "") return null;
        const q = Number.parseInt(raw, 10);
        if (!Number.isFinite(q) || q <= 0) return null;
        return { notebookProductId: r.id, quantity: q };
      })
      .filter((x): x is { notebookProductId: string; quantity: number } => x !== null);
    if (lines.length === 0) {
      setReceiptError(t.admin.notebookCatalogReceiptNoLines);
      return;
    }
    setReceiptSaving(true);
    try {
      const res = await fetch("/api/admin/notebook-stock/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines,
          note: receiptNote.trim() || null,
        }),
      });
      const errJson = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(errJson.error ?? "save_failed");
      }
      setReceiptOpen(false);
      setReceiptQty({});
      setReceiptNote("");
      await load();
    } catch {
      setReceiptError(t.admin.notebookCatalogReceiptFailed);
    } finally {
      setReceiptSaving(false);
    }
  }

  async function toggleActive(row: Row) {
    if (togglingId || savingId) return;
    const nextActive = !row.isActive;
    setTogglingId(row.id);
    setError(null);
    setItems((prev) =>
      prev.map((r) => (r.id === row.id ? { ...r, isActive: nextActive } : r)),
    );
    try {
      const res = await fetch(`/api/admin/notebook-products/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive }),
      });
      if (!res.ok) {
        const errJson = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errJson.error ?? "toggle_failed");
      }
      const data = (await res.json().catch(() => ({}))) as { item?: Row };
      if (data.item) {
        const updated = data.item;
        setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
      }
    } catch (e) {
      setItems((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, isActive: row.isActive } : r)),
      );
      setError(e instanceof Error ? e.message : "toggle_failed");
    } finally {
      setTogglingId(null);
    }
  }

  async function copyRow(sourceId: string) {
    setSavingId(`copy:${sourceId}`);
    setError(null);
    try {
      const res = await fetch(`/api/admin/notebook-products/${sourceId}/duplicate`, {
        method: "POST",
      });
      const errJson = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(errJson.error ?? "copy_failed");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "copy_failed");
    } finally {
      setSavingId(null);
    }
  }

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
            {t.admin.notebookCatalogTitle}
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
              placeholder={t.admin.notebookCatalogSearchPlaceholder}
              className="h-10 w-full pl-9 pr-3"
              autoComplete="off"
              aria-label={t.admin.notebookCatalogSearchPlaceholder}
            />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => {
              setReceiptOpen(true);
              setReceiptQty({});
              setReceiptNote("");
              setReceiptError(null);
            }}
          >
            <PackagePlus className="h-4 w-4" />
            {t.admin.notebookCatalogReceiptOpen}
          </Button>
          <Button type="button" size="sm" className="shrink-0" onClick={() => setModal({ mode: "add" })}>
            <Plus className="h-4 w-4" />
            {t.admin.notebookCatalogAdd}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="w-8 h-8 animate-spin" />
        </div>
      ) : (
        <>
          {items.length === 0 && (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              —
            </p>
          )}
          {items.length > 0 && filteredItems.length === 0 && (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
              {t.admin.notebookCatalogSearchEmpty}
            </p>
          )}
          {filteredItems.length > 0 && (
            <>
              <div className="grid gap-3 lg:hidden">
                {filteredItems.map((r) => (
                  <article
                    key={`card-${r.id}-${r.updatedAt}`}
                    className={cn(
                      "rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-emerald-50/40",
                      savingId === null && "cursor-pointer",
                    )}
                    onClick={() => {
                      if (savingId !== null) return;
                      setModal({ mode: "edit", row: r });
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="shrink-0">
                        {r.imagePublicUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={r.imagePublicUrl}
                            alt=""
                            className="h-14 w-14 rounded-lg border border-gray-200 object-cover"
                          />
                        ) : (
                          <div
                            className="h-14 w-14 rounded-lg border border-gray-200"
                            style={{ backgroundColor: r.coverColorHex }}
                          />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-mono text-xs text-gray-900">{r.sku}</p>
                        <p className="text-xs leading-snug text-gray-900">{r.nameRo}</p>
                        <p className="text-[10px] leading-snug text-gray-400">{r.nameRu}</p>
                        <div>
                          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-gray-500">
                            {t.admin.notebookCatalogColPaperKind}
                          </p>
                          <NotebookPaperKindBadge kind={r.paperKind} size="sm" />
                        </div>
                        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] tabular-nums sm:grid-cols-4">
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Package className={catalogMetricIconCls} aria-hidden />
                                {t.admin.notebookCatalogColStock}
                              </span>
                            </dt>
                            <dd className="text-gray-900">{r.stockQuantity}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <CircleDollarSign className={catalogMetricIconCls} aria-hidden />
                                {t.admin.notebookCatalogColPurchaseCost}
                              </span>
                            </dt>
                            <dd className="text-gray-900">{r.purchaseCost ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Store className={catalogMetricIconCls} aria-hidden />
                                {t.admin.notebookCatalogColSellPrice}
                              </span>
                            </dt>
                            <dd className="text-gray-900">{r.sellPrice ?? "—"}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Handshake className={catalogMetricIconCls} aria-hidden />
                                {t.admin.notebookCatalogColDealerPrice}
                              </span>
                            </dt>
                            <dd className="text-gray-900">{r.dealerPrice ?? "—"}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                    <div
                      className="mt-3 flex flex-col gap-3 border-t border-gray-100 pt-3 sm:flex-row sm:items-center sm:justify-between"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ActiveToggle
                        isActive={r.isActive}
                        busy={togglingId === r.id}
                        disabled={savingId !== null || (togglingId !== null && togglingId !== r.id)}
                        activeLabel={t.admin.notebookCatalogBadgeActive}
                        inactiveLabel={t.admin.notebookCatalogBadgeInactive}
                        onToggle={() => void toggleActive(r)}
                      />
                      <AdminTableIconActions
                        aria-label={t.admin.notebookCatalogColActions}
                        className="flex-wrap justify-end sm:justify-start"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={adminTableOutlineLabeledButtonClass}
                          title={t.admin.notebookCatalogHistoryOpen}
                          aria-label={t.admin.notebookCatalogHistoryOpen}
                          disabled={savingId !== null}
                          onClick={() => void openHistory(r)}
                        >
                          <History className="h-3.5 w-3.5 shrink-0" />
                          <span>{t.admin.notebookCatalogHistoryOpen}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={adminTableOutlineLabeledButtonClass}
                          title={t.admin.notebookCatalogCopy}
                          aria-label={t.admin.notebookCatalogCopy}
                          disabled={savingId !== null}
                          onClick={() => void copyRow(r.id)}
                        >
                          {savingId === `copy:${r.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{t.admin.notebookCatalogCopy}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={adminTableOutlineIconButtonClass}
                          title={t.admin.notebookCatalogOpenEdit}
                          aria-label={t.admin.notebookCatalogOpenEdit}
                          disabled={savingId !== null}
                          onClick={() => setModal({ mode: "edit", row: r })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </AdminTableIconActions>
                    </div>
                  </article>
                ))}
              </div>
              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
                <table className="w-full min-w-[1260px] table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[76px]" />
                    <col className="w-[132px]" />
                    <col />
                    <col className="w-[136px]" />
                    <col className="w-[88px]" />
                    <col className="w-[92px]" />
                    <col className="w-[92px]" />
                    <col className="w-[92px]" />
                    <col className="w-[128px]" />
                    <col className="w-[300px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <th className="p-3">{t.admin.notebookCatalogColPhoto}</th>
                      <th className="p-3">{t.admin.notebookCatalogColSku}</th>
                      <th className="p-3">{t.admin.notebookCatalogColNameRo}</th>
                      <th className="p-3">{t.admin.notebookCatalogColPaperKind}</th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Package className={catalogMetricIconCls} aria-hidden />
                          {t.admin.notebookCatalogColStock}
                        </span>
                      </th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <CircleDollarSign className={catalogMetricIconCls} aria-hidden />
                          {t.admin.notebookCatalogColPurchaseCost}
                        </span>
                      </th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Store className={catalogMetricIconCls} aria-hidden />
                          {t.admin.notebookCatalogColSellPrice}
                        </span>
                      </th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Handshake className={catalogMetricIconCls} aria-hidden />
                          {t.admin.notebookCatalogColDealerPrice}
                        </span>
                      </th>
                      <th className="p-3 text-center">{t.admin.notebookCatalogColActive}</th>
                      <th className="p-3 text-center text-gray-600">{t.admin.notebookCatalogColActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((r) => (
                      <tr
                        key={`${r.id}-${r.updatedAt}`}
                        className={cn(
                          "border-b border-gray-100 align-middle transition-colors hover:bg-emerald-50/40",
                          savingId === null && "cursor-pointer",
                        )}
                        onClick={() => {
                          if (savingId !== null) return;
                          setModal({ mode: "edit", row: r });
                        }}
                      >
                        <td className="p-2">
                          {r.imagePublicUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.imagePublicUrl}
                              alt=""
                              className="h-12 w-12 rounded-lg border border-gray-200 object-cover"
                            />
                          ) : (
                            <div
                              className="h-12 w-12 rounded-lg border border-gray-200"
                              style={{ backgroundColor: r.coverColorHex }}
                            />
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs">{r.sku}</td>
                        <td className="p-2">
                          <p className="line-clamp-2 text-xs leading-snug text-gray-900">{r.nameRo}</p>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-400">{r.nameRu}</p>
                        </td>
                        <td className="p-2">
                          <NotebookPaperKindBadge kind={r.paperKind} size="sm" />
                        </td>
                        <td className="p-2 tabular-nums">{r.stockQuantity}</td>
                        <td className="p-2 tabular-nums text-xs">{r.purchaseCost ?? "—"}</td>
                        <td className="p-2 tabular-nums text-xs">{r.sellPrice ?? "—"}</td>
                        <td className="p-2 tabular-nums text-xs">{r.dealerPrice ?? "—"}</td>
                        <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <ActiveToggle
                            isActive={r.isActive}
                            busy={togglingId === r.id}
                            disabled={savingId !== null || (togglingId !== null && togglingId !== r.id)}
                            activeLabel={t.admin.notebookCatalogBadgeActive}
                            inactiveLabel={t.admin.notebookCatalogBadgeInactive}
                            onToggle={() => void toggleActive(r)}
                          />
                        </td>
                        <td className="p-2 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                          <AdminTableIconActions aria-label={t.admin.notebookCatalogColActions}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={adminTableOutlineLabeledButtonClass}
                              title={t.admin.notebookCatalogHistoryOpen}
                              aria-label={t.admin.notebookCatalogHistoryOpen}
                              disabled={savingId !== null}
                              onClick={() => void openHistory(r)}
                            >
                              <History className="h-3.5 w-3.5 shrink-0" />
                              <span className="hidden sm:inline">{t.admin.notebookCatalogHistoryOpen}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={adminTableOutlineLabeledButtonClass}
                              title={t.admin.notebookCatalogCopy}
                              aria-label={t.admin.notebookCatalogCopy}
                              disabled={savingId !== null}
                              onClick={() => void copyRow(r.id)}
                            >
                              {savingId === `copy:${r.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span className="hidden sm:inline">{t.admin.notebookCatalogCopy}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={adminTableOutlineIconButtonClass}
                              title={t.admin.notebookCatalogOpenEdit}
                              aria-label={t.admin.notebookCatalogOpenEdit}
                              disabled={savingId !== null}
                              onClick={() => setModal({ mode: "edit", row: r })}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </AdminTableIconActions>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {modal ? (
        <NotebookCatalogEditModal
          key={modal.mode === "edit" ? modal.row.id : "add"}
          mode={modal.mode}
          initialRow={modal.mode === "edit" ? modal.row : null}
          t={t.admin}
          busy={savingId !== null}
          uploadFile={uploadFile}
          onClose={() => !savingId && setModal(null)}
          onSave={async (payload) => {
            setSavingId(modal.mode === "edit" ? modal.row.id : "new");
            setError(null);
            try {
              await persistPayload(payload, modal.mode, modal.mode === "edit" ? modal.row.id : undefined);
              setModal(null);
            } catch (e) {
              if (e instanceof Error && e.message === "sku_taken") {
                setError(t.admin.notebookCatalogSkuTaken);
              } else {
                setError(e instanceof Error ? e.message : "save_failed");
              }
            } finally {
              setSavingId(null);
            }
          }}
        />
      ) : null}

      {receiptOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => !receiptSaving && setReceiptOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[min(92vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <h2 className="text-lg font-bold tracking-tight">{t.admin.notebookCatalogReceiptTitle}</h2>
              <button
                type="button"
                onClick={() => !receiptSaving && setReceiptOpen(false)}
                disabled={receiptSaving}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label={t.admin.notebookCatalogCancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <label className="block text-xs font-medium text-gray-600">
                {t.admin.notebookCatalogReceiptNote}
              </label>
              <Input
                value={receiptNote}
                onChange={(e) => setReceiptNote(e.target.value)}
                className="mt-1 mb-4"
                disabled={receiptSaving}
                autoComplete="off"
              />
              <div className="space-y-3">
                {items.map((r) => (
                  <div
                    key={`rcpt-${r.id}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50/50 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-[11px] text-gray-500">{r.sku}</p>
                      <p className="truncate text-xs text-gray-900">{r.nameRo}</p>
                    </div>
                    <div className="w-24 shrink-0">
                      <label className="sr-only">{t.admin.notebookCatalogReceiptQtyLabel}</label>
                      <Input
                        inputMode="numeric"
                        placeholder="0"
                        value={receiptQty[r.id] ?? ""}
                        onChange={(e) =>
                          setReceiptQty((prev) => ({
                            ...prev,
                            [r.id]: e.target.value.replace(/\D/g, "").slice(0, 6),
                          }))
                        }
                        className="h-9 text-right tabular-nums"
                        disabled={receiptSaving}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {receiptError ? (
                <p className="mt-3 text-sm text-red-600">{receiptError}</p>
              ) : null}
            </div>
            <div className="flex shrink-0 justify-end gap-2 border-t border-gray-100 bg-gray-50/90 px-5 py-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => !receiptSaving && setReceiptOpen(false)}
                disabled={receiptSaving}
              >
                {t.admin.notebookCatalogCancel}
              </Button>
              <Button type="button" onClick={() => void submitReceipt()} disabled={receiptSaving}>
                {receiptSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t.admin.notebookCatalogReceiptSave}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {historyRow ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setHistoryRow(null)} />
          <div
            role="dialog"
            aria-modal="true"
            className="relative flex max-h-[min(85vh,560px)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
              <div className="min-w-0">
                <h2 className="text-lg font-bold tracking-tight">{t.admin.notebookCatalogHistoryTitle}</h2>
                <p className="mt-1 truncate font-mono text-xs text-gray-500">{historyRow.sku}</p>
                <p className="truncate text-sm text-gray-700">{historyRow.nameRo}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryRow(null)}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label={t.admin.notebookCatalogCancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {historyLoading ? (
                <div className="flex justify-center py-12 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="sr-only">{t.admin.notebookCatalogHistoryLoading}</span>
                </div>
              ) : historyMovements.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">{t.admin.notebookCatalogHistoryEmpty}</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {historyMovements.map((m) => {
                    const loc =
                      locale === "ro" ? "ro-RO" : locale === "ru" ? "ru-RU" : "en-US";
                    const when = new Date(m.createdAt).toLocaleString(loc, {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    });
                    const detail = stockMovementDetailLabel(m, t.admin);
                    return (
                      <li
                        key={m.id}
                        className="rounded-lg border border-gray-100 bg-gray-50/60 px-3 py-2.5"
                      >
                        <p className="text-[11px] text-gray-500">{when}</p>
                        <p className="mt-0.5 font-medium text-gray-900">{detail}</p>
                        <p className="tabular-nums text-gray-700">
                          {m.delta > 0 ? "+" : ""}
                          {m.delta}
                        </p>
                        {m.note ? (
                          <p className="mt-1 text-xs text-gray-500">{m.note}</p>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

type ModalPayload = Record<string, unknown>;

function NotebookCatalogEditModal({
  mode,
  initialRow,
  t,
  busy,
  uploadFile,
  onClose,
  onSave,
}: {
  mode: "add" | "edit";
  initialRow: Row | null;
  t: AdminNotebookCatalogStrings;
  busy: boolean;
  uploadFile: (f: File) => Promise<string>;
  onClose: () => void;
  onSave: (payload: ModalPayload) => Promise<void>;
}) {
  const [sku, setSku] = useState(initialRow?.sku ?? "");
  const [nameRo, setNameRo] = useState(initialRow?.nameRo ?? "");
  const [nameRu, setNameRu] = useState(initialRow?.nameRu ?? "");
  const [nameEn, setNameEn] = useState(initialRow?.nameEn ?? "");
  const [stock, setStock] = useState(initialRow?.stockQuantity ?? 0);
  const [sellStr, setSellStr] = useState(
    initialRow?.sellPrice != null ? String(initialRow.sellPrice) : "",
  );
  const [dealerStr, setDealerStr] = useState(
    initialRow?.dealerPrice != null ? String(initialRow.dealerPrice) : "",
  );
  const [purchaseStr, setPurchaseStr] = useState(
    initialRow?.purchaseCost != null ? String(initialRow.purchaseCost) : "",
  );
  const [cover, setCover] = useState(initialRow?.coverColorHex ?? "#1f1f1f");
  const [strap, setStrap] = useState(initialRow?.strapColorHex ?? "#1f1f1f");
  const [bookmark, setBookmark] = useState(initialRow?.bookmarkColorHex ?? "#c0392b");
  const [paperKind, setPaperKind] = useState<NotebookPaperKind>(
    initialRow?.paperKind ?? NOTEBOOK_PAPER_KIND_DEFAULT,
  );
  const [widthCmStr, setWidthCmStr] = useState(
    String(initialRow?.printWidthCm ?? NOTEBOOK_DEFAULT_PRINT.widthCm),
  );
  const [heightCmStr, setHeightCmStr] = useState(
    String(initialRow?.printHeightCm ?? NOTEBOOK_DEFAULT_PRINT.heightCm),
  );
  const [dpi, setDpi] = useState<Dpi>(
    (initialRow?.printDpi ?? NOTEBOOK_DEFAULT_PRINT.dpi) as Dpi,
  );
  const [has3dPreview, setHas3dPreview] = useState<boolean>(
    initialRow?.has3dPreview ?? true,
  );
  const [active, setActive] = useState(initialRow?.isActive ?? true);
  const [notes, setNotes] = useState(initialRow?.internalNotes ?? "");
  const [preview, setPreview] = useState<string | null>(initialRow?.imagePublicUrl ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  function parseOptionalPrice(s: string): number | null {
    const trimmed = s.trim();
    if (trimmed === "") return null;
    const n = Number.parseInt(trimmed, 10);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function parsePositiveCm(s: string, fallback: number): number {
    const n = Number.parseFloat(s.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : fallback;
  }

  const widthCmNum = parsePositiveCm(widthCmStr, NOTEBOOK_DEFAULT_PRINT.widthCm);
  const heightCmNum = parsePositiveCm(heightCmStr, NOTEBOOK_DEFAULT_PRINT.heightCm);
  const previewPxW = cmToPx(widthCmNum, dpi);
  const previewPxH = cmToPx(heightCmNum, dpi);

  async function submit() {
    if (!sku.trim() || !nameRo.trim() || !nameRu.trim() || !nameEn.trim()) return;
    let newImageKey: string | undefined;
    if (pendingFile) {
      newImageKey = await uploadFile(pendingFile);
    }
    const payload: ModalPayload = {
      sku: sku.trim(),
      nameRo: nameRo.trim(),
      nameRu: nameRu.trim(),
      nameEn: nameEn.trim(),
      stockQuantity: stock,
      sellPrice: parseOptionalPrice(sellStr),
      dealerPrice: parseOptionalPrice(dealerStr),
      purchaseCost: parseOptionalPrice(purchaseStr),
      coverColorHex: cover,
      strapColorHex: strap,
      bookmarkColorHex: bookmark,
      paperKind,
      printWidthCm: widthCmNum,
      printHeightCm: heightCmNum,
      printDpi: dpi,
      has3dPreview,
      isActive: active,
      internalNotes: notes.trim() || null,
    };
    if (newImageKey !== undefined) {
      payload.imageUrl = newImageKey;
    }
    await onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !busy && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex max-h-[min(92vh,920px)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white text-gray-900 shadow-2xl ring-1 ring-black/5"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6 sm:py-5">
          <h2 className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">
            {mode === "add" ? t.notebookCatalogModalAddTitle : t.notebookCatalogModalEditTitle}
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={t.notebookCatalogCancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
            <aside className="shrink-0 lg:w-[min(100%,280px)]">
              <p className="mb-2 text-xs font-medium text-gray-500">{t.notebookCatalogColPhoto}</p>
              <PhotoDropzone
                disabled={busy}
                publicUrl={preview}
                dropLabel={t.notebookCatalogPhotoDrop}
                variant="panel"
                onPickFile={(f) => {
                  setPendingFile(f);
                  setPreview(URL.createObjectURL(f));
                }}
              />
            </aside>

            <div className="min-w-0 flex-1 space-y-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-12 sm:items-end">
                <div className="sm:col-span-4">
                  <label className="text-xs font-medium text-gray-600">{t.notebookCatalogColSku}</label>
                  <Input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="mt-1 font-mono"
                    disabled={busy}
                    autoComplete="off"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Package className={catalogMetricIconCls} aria-hidden />
                    {t.notebookCatalogColStock}
                  </label>
                  <Input
                    type="number"
                    min={0}
                    value={stock}
                    onChange={(e) => setStock(Number.parseInt(e.target.value, 10) || 0)}
                    className="mt-1"
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <CircleDollarSign className={catalogMetricIconCls} aria-hidden />
                    {t.notebookCatalogFieldPurchaseCost}
                  </label>
                  <Input
                    value={purchaseStr}
                    onChange={(e) => setPurchaseStr(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="mt-1"
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Store className={catalogMetricIconCls} aria-hidden />
                    {t.notebookCatalogColSellPrice}
                  </label>
                  <Input
                    value={sellStr}
                    onChange={(e) => setSellStr(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="mt-1"
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Handshake className={catalogMetricIconCls} aria-hidden />
                    {t.notebookCatalogColDealerPrice}
                  </label>
                  <Input
                    value={dealerStr}
                    onChange={(e) => setDealerStr(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    className="mt-1"
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold text-gray-700">
                  {t.notebookCatalogColPaperKind}
                </p>
                <p className="mb-2 text-[11px] text-gray-500">
                  {t.notebookCatalogPaperKindHint}
                </p>
                <div
                  role="radiogroup"
                  aria-label={t.notebookCatalogColPaperKind}
                  className="grid grid-cols-3 gap-2"
                >
                  {NOTEBOOK_PAPER_KINDS.map((kind) => {
                    const selected = paperKind === kind;
                    return (
                      <button
                        key={kind}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setPaperKind(kind)}
                        disabled={busy}
                        className={cn(
                          "flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 transition-all",
                          selected
                            ? "border-gray-900 bg-gray-50/80 ring-2 ring-gray-900/10 shadow-sm"
                            : "border-gray-200 bg-white hover:border-gray-300",
                          busy && "opacity-60 cursor-not-allowed",
                        )}
                      >
                        <NotebookPaperKindBadge kind={kind} size="md" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700">{t.notebookCatalogNamesSection}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.notebookCatalogColNameRo}</label>
                    <Input value={nameRo} onChange={(e) => setNameRo(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.notebookCatalogColNameRu}</label>
                    <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.notebookCatalogColNameEn}</label>
                    <Input value={nameEn} onChange={(e) => setNameEn(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                </div>
              </div>

              <div
                className={cn(
                  "rounded-xl border border-gray-100 bg-gray-50/60 p-4 transition-opacity",
                  !has3dPreview && "opacity-60",
                )}
                aria-disabled={!has3dPreview}
              >
                <p className="mb-1 text-xs font-semibold text-gray-800">{t.notebookCatalogColorsSection}</p>
                {!has3dPreview && (
                  <p className="mb-3 text-[11px] text-gray-500">
                    {t.printDimensions.colorsDisabledHint}
                  </p>
                )}
                <div className={cn("grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-3", has3dPreview && "mt-2") }>
                  {(
                    [
                      [cover, setCover, t.notebookCatalogColCover],
                      [strap, setStrap, t.notebookCatalogColStrap],
                      [bookmark, setBookmark, t.notebookCatalogColBookmark],
                    ] as const
                  ).map(([val, setVal, label]) => (
                    <div key={label} className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-medium text-gray-600">{label}</label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="color"
                          value={val}
                          onChange={(e) => setVal(e.target.value)}
                          className="h-11 w-14 shrink-0 cursor-pointer rounded-md border border-gray-200 p-1"
                          disabled={busy || !has3dPreview}
                          aria-label={label}
                        />
                        <span className="font-mono text-[11px] text-gray-500 tabular-nums">{val}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                <p className="mb-3 text-xs font-semibold text-gray-800">
                  {t.printDimensions.sectionTitle}
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-medium text-gray-600">
                      {t.printDimensions.widthCm}
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0.1}
                      value={widthCmStr}
                      onChange={(e) => setWidthCmStr(e.target.value)}
                      className="mt-1 tabular-nums"
                      disabled={busy}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-medium text-gray-600">
                      {t.printDimensions.heightCm}
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min={0.1}
                      value={heightCmStr}
                      onChange={(e) => setHeightCmStr(e.target.value)}
                      className="mt-1 tabular-nums"
                      disabled={busy}
                      inputMode="decimal"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-medium text-gray-600">
                      {t.printDimensions.dpi}
                    </label>
                    <MenuSelect<Dpi>
                      className="mt-1"
                      value={dpi}
                      onChange={setDpi}
                      disabled={busy}
                      ariaLabel={t.printDimensions.dpi}
                      options={DPI_PRESETS.map((p) => ({
                        value: p,
                        label: String(p),
                      }))}
                    />
                  </div>
                  <div className="sm:col-span-12">
                    <p className="text-[11px] tabular-nums text-gray-500">
                      {t.printDimensions.pixelPreview(previewPxW, previewPxH)}
                    </p>
                  </div>
                  <div className="sm:col-span-12">
                    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                        checked={has3dPreview}
                        onChange={(e) => setHas3dPreview(e.target.checked)}
                        disabled={busy}
                      />
                      {t.printDimensions.has3dPreview}
                    </label>
                    <p className="mt-1 text-[11px] text-gray-500">
                      {t.printDimensions.has3dPreviewHint}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm text-gray-800">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    disabled={busy}
                  />
                  {t.notebookCatalogColActive}
                </label>
                <div className="min-w-0">
                  <label className="text-xs font-medium text-gray-600">{t.notebookCatalogInternalNotes}</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" disabled={busy} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/90 px-5 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t.notebookCatalogCancel}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !sku.trim() || !nameRo.trim() || !nameRu.trim() || !nameEn.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.notebookCatalogSave}
          </Button>
        </div>
      </div>
    </div>
  );
}

function ActiveToggle({
  isActive,
  busy,
  disabled,
  activeLabel,
  inactiveLabel,
  onToggle,
}: {
  isActive: boolean;
  busy: boolean;
  disabled: boolean;
  activeLabel: string;
  inactiveLabel: string;
  onToggle: () => void;
}) {
  const label = isActive ? activeLabel : inactiveLabel;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={label}
      title={label}
      disabled={disabled || busy}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 outline-none ring-1 ring-inset focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2",
        isActive
          ? "bg-emerald-500 ring-emerald-600/30 hover:bg-emerald-600"
          : "bg-slate-300 ring-slate-400/40 hover:bg-slate-400",
        (disabled || busy) && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow ring-1 ring-black/5 transition-transform duration-200",
          isActive ? "translate-x-[22px]" : "translate-x-0.5",
        )}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin text-gray-500" /> : null}
      </span>
    </button>
  );
}

function PhotoDropzone({
  disabled,
  publicUrl,
  dropLabel,
  onPickFile,
  variant = "default",
  className,
}: {
  disabled: boolean;
  publicUrl: string | null;
  dropLabel: string;
  onPickFile: (f: File) => void | Promise<void>;
  variant?: "default" | "panel";
  className?: string;
}) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(f: File | undefined) {
    if (!f || !f.type.startsWith("image/")) return;
    await onPickFile(f);
  }

  const isPanel = variant === "panel";

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      className={cn(
        "relative flex cursor-pointer select-none flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 text-center text-xs text-gray-600 transition-colors",
        isPanel
          ? "min-h-[220px] py-5 lg:aspect-square lg:min-h-0 lg:max-h-[320px]"
          : "min-h-[100px] py-4",
        over ? "border-emerald-400 bg-emerald-50/60" : "border-gray-200 bg-gray-50/40 hover:border-gray-300",
        disabled && "pointer-events-none cursor-not-allowed opacity-50",
        className,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        if (disabled) return;
        const f = e.dataTransfer.files?.[0];
        void handleFile(f);
      }}
      onClick={() => !disabled && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={disabled}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          await handleFile(f);
          e.target.value = "";
        }}
      />
      {publicUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={publicUrl}
          alt=""
          className={cn(
            "rounded-lg border border-gray-200 object-contain",
            isPanel ? "max-h-44 w-full max-w-[200px]" : "h-24 w-24 object-cover",
          )}
        />
      ) : (
        <div className={cn("rounded-lg bg-gray-200/80", isPanel ? "h-20 w-20" : "h-16 w-16")} />
      )}
      <span>{dropLabel}</span>
    </div>
  );
}
