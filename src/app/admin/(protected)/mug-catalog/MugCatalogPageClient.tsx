"use client";

import { useCallback, useMemo, useRef, useState } from "react";
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
import { MUG_STOCK_KIND } from "@/lib/mug/mugStockKinds";
import {
  DPI_PRESETS,
  MUG_DEFAULT_PRINT,
  cmToPx,
  type Dpi,
} from "@/lib/printDimensions";
import {
  formatAmountInput,
  parseAmountMdl,
  sanitizeMoneyInput,
} from "@/lib/money";
import { useMugProducts } from "@/lib/swr";

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
  bodyColorHex: string;
  handleColorHex: string;
  innerColorHex: string | null;
  rimColorHex: string | null;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  updatedAt: string;
};

type AdminMugCatalogStrings = Pick<
  TranslationDictionary["admin"],
  | "printDimensions"
  | "mugCatalogTitle"
  | "mugCatalogAdd"
  | "mugCatalogSearchPlaceholder"
  | "mugCatalogSearchEmpty"
  | "mugCatalogBadgeActive"
  | "mugCatalogBadgeInactive"
  | "mugCatalogColSku"
  | "mugCatalogColNameRo"
  | "mugCatalogColNameRu"
  | "mugCatalogColNameEn"
  | "mugCatalogNamesSection"
  | "mugCatalogColPhoto"
  | "mugCatalogColStock"
  | "mugCatalogPhotoDrop"
  | "mugCatalogSkuTaken"
  | "mugCatalogColBody"
  | "mugCatalogColHandle"
  | "mugCatalogColInner"
  | "mugCatalogColRim"
  | "mugCatalogColorsSection"
  | "mugCatalogColActive"
  | "mugCatalogColSellPrice"
  | "mugCatalogColPurchaseCost"
  | "mugCatalogFieldPurchaseCost"
  | "mugCatalogColDealerPrice"
  | "mugCatalogOpenEdit"
  | "mugCatalogCopy"
  | "mugCatalogColActions"
  | "mugCatalogModalAddTitle"
  | "mugCatalogModalEditTitle"
  | "mugCatalogCancel"
  | "mugCatalogInternalNotes"
  | "mugCatalogSave"
  | "orderStockInsufficient"
  | "mugCatalogReceiptOpen"
  | "mugCatalogReceiptTitle"
  | "mugCatalogReceiptQtyLabel"
  | "mugCatalogReceiptNote"
  | "mugCatalogReceiptSave"
  | "mugCatalogReceiptNoLines"
  | "mugCatalogReceiptFailed"
  | "mugCatalogHistoryOpen"
  | "mugCatalogHistoryTitle"
  | "mugCatalogHistoryEmpty"
  | "mugCatalogHistoryLoading"
  | "mugCatalogMovementSale"
  | "mugCatalogMovementReturn"
  | "mugCatalogMovementReceipt"
>;

function stockMovementDetailLabel(
  m: { kind: string; orderNumber: number | null },
  t: AdminMugCatalogStrings,
): string {
  if (m.kind === MUG_STOCK_KIND.ORDER_SALE) {
    return t.mugCatalogMovementSale(m.orderNumber ?? 0);
  }
  if (m.kind === MUG_STOCK_KIND.ORDER_STOCK_RETURN) {
    return t.mugCatalogMovementReturn;
  }
  if (m.kind === MUG_STOCK_KIND.RECEIPT) {
    return t.mugCatalogMovementReceipt;
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

export default function MugCatalogPageClient() {
  const { t, locale } = useLanguageStore();
  const { items: rawItems, error: loadError, isLoading: loading, mutate } = useMugProducts();
  const [localItems, setLocalItems] = useState<Row[] | null>(null);
  const items = localItems ?? (rawItems as Row[]);
  const setItems = useCallback((updater: (prev: Row[]) => Row[]) => {
    setLocalItems((prev) => updater(prev ?? (rawItems as Row[])));
  }, [rawItems]);
  const [error, setError] = useState<string | null>(null);
  const swrError = loadError ? (loadError instanceof Error ? loadError.message : "Failed to load") : null;
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

  const load = useCallback(() => { setLocalItems(null); mutate(); }, [mutate]);

  async function uploadFile(file: File): Promise<string> {
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        scope: "mugCatalog",
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
    const url = mode === "add" ? "/api/admin/mug-products" : `/api/admin/mug-products/${id}`;
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
      const res = await fetch(`/api/admin/mug-products/${row.id}/stock-movements`);
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
        return { mugProductId: r.id, quantity: q };
      })
      .filter((x): x is { mugProductId: string; quantity: number } => x !== null);
    if (lines.length === 0) {
      setReceiptError(t.admin.mugCatalogReceiptNoLines);
      return;
    }
    setReceiptSaving(true);
    try {
      const res = await fetch("/api/admin/mug-stock/receipt", {
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
      setReceiptError(t.admin.mugCatalogReceiptFailed);
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
      const res = await fetch(`/api/admin/mug-products/${row.id}`, {
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
      const res = await fetch(`/api/admin/mug-products/${sourceId}/duplicate`, {
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
            {t.admin.mugCatalogTitle}
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
              placeholder={t.admin.mugCatalogSearchPlaceholder}
              className="h-10 w-full pl-9 pr-3"
              autoComplete="off"
              aria-label={t.admin.mugCatalogSearchPlaceholder}
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
            {t.admin.mugCatalogReceiptOpen}
          </Button>
          <Button type="button" size="sm" className="shrink-0" onClick={() => setModal({ mode: "add" })}>
            <Plus className="h-4 w-4" />
            {t.admin.mugCatalogAdd}
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
              {t.admin.mugCatalogSearchEmpty}
            </p>
          )}
          {filteredItems.length > 0 && (
            <>
              <div className="grid gap-3 lg:hidden">
                {filteredItems.map((r) => (
                  <article
                    key={`card-${r.id}-${r.updatedAt}`}
                    className={cn(
                      "rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:bg-amber-50/40",
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
                            className="h-14 w-14 object-cover rounded-lg border border-gray-200"
                          />
                        ) : (
                          <div className="h-14 w-14 rounded-lg bg-gray-100 border border-gray-200" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <p className="font-mono text-xs text-gray-900">{r.sku}</p>
                        <p className="text-xs text-gray-900 leading-snug">{r.nameRo}</p>
                        <p className="text-[10px] text-gray-400 leading-snug">{r.nameRu}</p>
                        <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] tabular-nums sm:grid-cols-4">
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Package className={catalogMetricIconCls} aria-hidden />
                                {t.admin.mugCatalogColStock}
                              </span>
                            </dt>
                            <dd className="text-gray-900">{r.stockQuantity}</dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <CircleDollarSign className={catalogMetricIconCls} aria-hidden />
                                {t.admin.mugCatalogColPurchaseCost}
                              </span>
                            </dt>
                            <dd className="text-gray-900">
                              {r.purchaseCost == null
                                ? "—"
                                : formatAmountInput(r.purchaseCost)}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Store className={catalogMetricIconCls} aria-hidden />
                                {t.admin.mugCatalogColSellPrice}
                              </span>
                            </dt>
                            <dd className="text-gray-900">
                              {r.sellPrice == null
                                ? "—"
                                : formatAmountInput(r.sellPrice)}
                            </dd>
                          </div>
                          <div>
                            <dt className="font-medium text-gray-500">
                              <span className="inline-flex items-center gap-1.5">
                                <Handshake className={catalogMetricIconCls} aria-hidden />
                                {t.admin.mugCatalogColDealerPrice}
                              </span>
                            </dt>
                            <dd className="text-gray-900">
                              {r.dealerPrice == null
                                ? "—"
                                : formatAmountInput(r.dealerPrice)}
                            </dd>
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
                        activeLabel={t.admin.mugCatalogBadgeActive}
                        inactiveLabel={t.admin.mugCatalogBadgeInactive}
                        onToggle={() => void toggleActive(r)}
                      />
                      <AdminTableIconActions
                        aria-label={t.admin.mugCatalogColActions}
                        className="flex-wrap justify-end sm:justify-start"
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={adminTableOutlineLabeledButtonClass}
                          title={t.admin.mugCatalogHistoryOpen}
                          aria-label={t.admin.mugCatalogHistoryOpen}
                          disabled={savingId !== null}
                          onClick={() => void openHistory(r)}
                        >
                          <History className="h-3.5 w-3.5 shrink-0" />
                          <span>{t.admin.mugCatalogHistoryOpen}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={adminTableOutlineLabeledButtonClass}
                          title={t.admin.mugCatalogCopy}
                          aria-label={t.admin.mugCatalogCopy}
                          disabled={savingId !== null}
                          onClick={() => void copyRow(r.id)}
                        >
                          {savingId === `copy:${r.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                          ) : (
                            <Copy className="h-3.5 w-3.5 shrink-0" />
                          )}
                          <span>{t.admin.mugCatalogCopy}</span>
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={adminTableOutlineIconButtonClass}
                          title={t.admin.mugCatalogOpenEdit}
                          aria-label={t.admin.mugCatalogOpenEdit}
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
                <table className="w-full min-w-[1180px] table-fixed border-collapse text-sm">
                  <colgroup>
                    <col className="w-[76px]" />
                    <col className="w-[132px]" />
                    <col />
                    <col className="w-[88px]" />
                    <col className="w-[92px]" />
                    <col className="w-[92px]" />
                    <col className="w-[92px]" />
                    <col className="w-[128px]" />
                    <col className="w-[300px]" />
                  </colgroup>
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                      <th className="p-3">{t.admin.mugCatalogColPhoto}</th>
                      <th className="p-3">{t.admin.mugCatalogColSku}</th>
                      <th className="p-3">{t.admin.mugCatalogColNameRo}</th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Package className={catalogMetricIconCls} aria-hidden />
                          {t.admin.mugCatalogColStock}
                        </span>
                      </th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <CircleDollarSign className={catalogMetricIconCls} aria-hidden />
                          {t.admin.mugCatalogColPurchaseCost}
                        </span>
                      </th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Store className={catalogMetricIconCls} aria-hidden />
                          {t.admin.mugCatalogColSellPrice}
                        </span>
                      </th>
                      <th className="p-3">
                        <span className="inline-flex items-center gap-1.5">
                          <Handshake className={catalogMetricIconCls} aria-hidden />
                          {t.admin.mugCatalogColDealerPrice}
                        </span>
                      </th>
                      <th className="p-3 text-center">{t.admin.mugCatalogColActive}</th>
                      <th className="p-3 text-center text-gray-600">{t.admin.mugCatalogColActions}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map((r) => (
                      <tr
                        key={`${r.id}-${r.updatedAt}`}
                        className={cn(
                          "border-b border-gray-100 align-middle transition-colors hover:bg-amber-50/40",
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
                            <div className="h-12 w-12 rounded-lg border border-gray-200 bg-gray-100" />
                          )}
                        </td>
                        <td className="p-2 font-mono text-xs">{r.sku}</td>
                        <td className="p-2">
                          <p className="line-clamp-2 text-xs leading-snug text-gray-900">{r.nameRo}</p>
                          <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-400">{r.nameRu}</p>
                        </td>
                        <td className="p-2 tabular-nums">{r.stockQuantity}</td>
                        <td className="p-2 tabular-nums text-xs">
                          {r.purchaseCost == null
                            ? "—"
                            : formatAmountInput(r.purchaseCost)}
                        </td>
                        <td className="p-2 tabular-nums text-xs">
                          {r.sellPrice == null
                            ? "—"
                            : formatAmountInput(r.sellPrice)}
                        </td>
                        <td className="p-2 tabular-nums text-xs">
                          {r.dealerPrice == null
                            ? "—"
                            : formatAmountInput(r.dealerPrice)}
                        </td>
                        <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <ActiveToggle
                            isActive={r.isActive}
                            busy={togglingId === r.id}
                            disabled={savingId !== null || (togglingId !== null && togglingId !== r.id)}
                            activeLabel={t.admin.mugCatalogBadgeActive}
                            inactiveLabel={t.admin.mugCatalogBadgeInactive}
                            onToggle={() => void toggleActive(r)}
                          />
                        </td>
                        <td className="p-2 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                          <AdminTableIconActions aria-label={t.admin.mugCatalogColActions}>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={adminTableOutlineLabeledButtonClass}
                              title={t.admin.mugCatalogHistoryOpen}
                              aria-label={t.admin.mugCatalogHistoryOpen}
                              disabled={savingId !== null}
                              onClick={() => void openHistory(r)}
                            >
                              <History className="h-3.5 w-3.5 shrink-0" />
                              <span className="hidden sm:inline">{t.admin.mugCatalogHistoryOpen}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={adminTableOutlineLabeledButtonClass}
                              title={t.admin.mugCatalogCopy}
                              aria-label={t.admin.mugCatalogCopy}
                              disabled={savingId !== null}
                              onClick={() => void copyRow(r.id)}
                            >
                              {savingId === `copy:${r.id}` ? (
                                <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                              ) : (
                                <Copy className="h-3.5 w-3.5 shrink-0" />
                              )}
                              <span className="hidden sm:inline">{t.admin.mugCatalogCopy}</span>
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={adminTableOutlineIconButtonClass}
                              title={t.admin.mugCatalogOpenEdit}
                              aria-label={t.admin.mugCatalogOpenEdit}
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
        <MugCatalogEditModal
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
                setError(t.admin.mugCatalogSkuTaken);
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
              <h2 className="text-lg font-bold tracking-tight">{t.admin.mugCatalogReceiptTitle}</h2>
              <button
                type="button"
                onClick={() => !receiptSaving && setReceiptOpen(false)}
                disabled={receiptSaving}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label={t.admin.mugCatalogCancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              <label className="block text-xs font-medium text-gray-600">
                {t.admin.mugCatalogReceiptNote}
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
                      <label className="sr-only">{t.admin.mugCatalogReceiptQtyLabel}</label>
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
                {t.admin.mugCatalogCancel}
              </Button>
              <Button type="button" onClick={() => void submitReceipt()} disabled={receiptSaving}>
                {receiptSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {t.admin.mugCatalogReceiptSave}
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
                <h2 className="text-lg font-bold tracking-tight">{t.admin.mugCatalogHistoryTitle}</h2>
                <p className="mt-1 truncate font-mono text-xs text-gray-500">{historyRow.sku}</p>
                <p className="truncate text-sm text-gray-700">{historyRow.nameRo}</p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryRow(null)}
                className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label={t.admin.mugCatalogCancel}
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {historyLoading ? (
                <div className="flex justify-center py-12 text-gray-400">
                  <Loader2 className="h-8 w-8 animate-spin" />
                  <span className="sr-only">{t.admin.mugCatalogHistoryLoading}</span>
                </div>
              ) : historyMovements.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">{t.admin.mugCatalogHistoryEmpty}</p>
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

function MugCatalogEditModal({
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
  t: AdminMugCatalogStrings;
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
    formatAmountInput(initialRow?.sellPrice ?? null),
  );
  const [dealerStr, setDealerStr] = useState(
    formatAmountInput(initialRow?.dealerPrice ?? null),
  );
  const [purchaseStr, setPurchaseStr] = useState(
    formatAmountInput(initialRow?.purchaseCost ?? null),
  );
  const [body, setBody] = useState(initialRow?.bodyColorHex ?? "#f5f5f0");
  const [handle, setHandle] = useState(initialRow?.handleColorHex ?? "#a8a29e");
  const [inner, setInner] = useState(
    () => initialRow?.innerColorHex ?? initialRow?.bodyColorHex ?? "#f5f5f0",
  );
  const [rim, setRim] = useState(
    () => initialRow?.rimColorHex ?? initialRow?.bodyColorHex ?? "#f5f5f0",
  );
  // Print parameters: kept as strings while typing so mid-edit values like "21." don't snap.
  const [widthCmStr, setWidthCmStr] = useState(
    String(initialRow?.printWidthCm ?? MUG_DEFAULT_PRINT.widthCm),
  );
  const [heightCmStr, setHeightCmStr] = useState(
    String(initialRow?.printHeightCm ?? MUG_DEFAULT_PRINT.heightCm),
  );
  const [dpi, setDpi] = useState<Dpi>(
    (initialRow?.printDpi ?? MUG_DEFAULT_PRINT.dpi) as Dpi,
  );
  const [has3dPreview, setHas3dPreview] = useState<boolean>(
    initialRow?.has3dPreview ?? true,
  );
  const [active, setActive] = useState(initialRow?.isActive ?? true);
  const [notes, setNotes] = useState(initialRow?.internalNotes ?? "");
  const [preview, setPreview] = useState<string | null>(initialRow?.imagePublicUrl ?? null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  /**
   * Parse a per-tier MDL price from the catalog modal. Returns `null`
   * for empty/invalid input, otherwise a non-negative number rounded
   * to 2 decimals (so `1.5 lei` round-trips as `1.5`, `1,50 lei` as
   * `1.5`, and `1.234 lei` is rejected by the server-side Zod check
   * — kept defensive on the client too).
   */
  function parseOptionalPrice(s: string): number | null {
    return parseAmountMdl(s);
  }

  function parsePositiveCm(s: string, fallback: number): number {
    const n = Number.parseFloat(s.trim().replace(",", "."));
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : fallback;
  }

  const widthCmNum = parsePositiveCm(widthCmStr, MUG_DEFAULT_PRINT.widthCm);
  const heightCmNum = parsePositiveCm(heightCmStr, MUG_DEFAULT_PRINT.heightCm);
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
      bodyColorHex: body,
      handleColorHex: handle,
      innerColorHex: inner,
      rimColorHex: rim,
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
            {mode === "add" ? t.mugCatalogModalAddTitle : t.mugCatalogModalEditTitle}
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={t.mugCatalogCancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
            <aside className="shrink-0 lg:w-[min(100%,280px)]">
              <p className="mb-2 text-xs font-medium text-gray-500">{t.mugCatalogColPhoto}</p>
              <PhotoDropzone
                disabled={busy}
                publicUrl={preview}
                dropLabel={t.mugCatalogPhotoDrop}
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
                  <label className="text-xs font-medium text-gray-600">{t.mugCatalogColSku}</label>
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
                    {t.mugCatalogColStock}
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
                    {t.mugCatalogFieldPurchaseCost}
                  </label>
                  <Input
                    value={purchaseStr}
                    onChange={(e) =>
                      setPurchaseStr(
                        sanitizeMoneyInput(e.target.value, {
                          maxIntegerDigits: 8,
                        }),
                      )
                    }
                    inputMode="decimal"
                    className="mt-1"
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Store className={catalogMetricIconCls} aria-hidden />
                    {t.mugCatalogColSellPrice}
                  </label>
                  <Input
                    value={sellStr}
                    onChange={(e) =>
                      setSellStr(
                        sanitizeMoneyInput(e.target.value, {
                          maxIntegerDigits: 8,
                        }),
                      )
                    }
                    inputMode="decimal"
                    className="mt-1"
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <Handshake className={catalogMetricIconCls} aria-hidden />
                    {t.mugCatalogColDealerPrice}
                  </label>
                  <Input
                    value={dealerStr}
                    onChange={(e) =>
                      setDealerStr(
                        sanitizeMoneyInput(e.target.value, {
                          maxIntegerDigits: 8,
                        }),
                      )
                    }
                    inputMode="decimal"
                    className="mt-1"
                    placeholder="—"
                    disabled={busy}
                  />
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold text-gray-700">{t.mugCatalogNamesSection}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.mugCatalogColNameRo}</label>
                    <Input value={nameRo} onChange={(e) => setNameRo(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.mugCatalogColNameRu}</label>
                    <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.mugCatalogColNameEn}</label>
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
                <p className="mb-1 text-xs font-semibold text-gray-800">{t.mugCatalogColorsSection}</p>
                {!has3dPreview && (
                  <p className="mb-3 text-[11px] text-gray-500">
                    {t.printDimensions.colorsDisabledHint}
                  </p>
                )}
                <div className={cn("grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4", has3dPreview && "mt-2") }>
                  {(
                    [
                      [body, setBody, t.mugCatalogColBody],
                      [handle, setHandle, t.mugCatalogColHandle],
                      [inner, setInner, t.mugCatalogColInner],
                      [rim, setRim, t.mugCatalogColRim],
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
                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
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
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    disabled={busy}
                  />
                  {t.mugCatalogColActive}
                </label>
                <div className="min-w-0">
                  <label className="text-xs font-medium text-gray-600">{t.mugCatalogInternalNotes}</label>
                  <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" disabled={busy} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50/90 px-5 py-3 sm:px-6">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t.mugCatalogCancel}
          </Button>
          <Button
            type="button"
            onClick={() => void submit()}
            disabled={busy || !sku.trim() || !nameRo.trim() || !nameRu.trim() || !nameEn.trim()}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {t.mugCatalogSave}
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
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 outline-none ring-1 ring-inset focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
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
  /** `panel` — taller drop area for wide modal sidebar */
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
        over ? "border-amber-400 bg-amber-50/60" : "border-gray-200 bg-gray-50/40 hover:border-gray-300",
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
