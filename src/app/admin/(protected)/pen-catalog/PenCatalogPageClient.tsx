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
  Loader2,
  Package,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Store,
  Trash2,
  X,
} from "lucide-react";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/utils";
import type { TranslationDictionary } from "@/lib/i18n";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import {
  AdminTableIconActions,
  adminTableOutlineIconButtonClass,
} from "@/app/admin/_components/AdminTableIconActions";
import {
  DPI_PRESETS,
  MUG_DEFAULT_PRINT,
  type Dpi,
} from "@/lib/printDimensions";
import {
  formatAmountInput,
  parseAmountMdl,
  sanitizeMoneyInput,
} from "@/lib/money";
import { usePenProducts } from "@/lib/swr/usePenProducts";

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
  clipColorHex: string;
  printWidthCm: number;
  printHeightCm: number;
  printDpi: number;
  has3dPreview: boolean;
  isActive: boolean;
  sortOrder: number;
  internalNotes: string | null;
  updatedAt: string;
};

type AdminPenCatalogStrings = Pick<
  TranslationDictionary["admin"],
  | "printDimensions"
  | "penCatalogTitle"
  | "penCatalogAdd"
  | "penCatalogSearchPlaceholder"
  | "penCatalogSearchEmpty"
  | "penCatalogBadgeActive"
  | "penCatalogBadgeInactive"
  | "penCatalogColSku"
  | "penCatalogColNameRo"
  | "penCatalogColNameRu"
  | "penCatalogColNameEn"
  | "penCatalogNamesSection"
  | "penCatalogColPhoto"
  | "penCatalogColStock"
  | "penCatalogPhotoDrop"
  | "penCatalogSkuTaken"
  | "penCatalogColBody"
  | "penCatalogColClip"
  | "penCatalogColorsSection"
  | "penCatalogColActive"
  | "penCatalogColSellPrice"
  | "penCatalogColPurchaseCost"
  | "penCatalogFieldPurchaseCost"
  | "penCatalogColDealerPrice"
  | "penCatalogOpenEdit"
  | "penCatalogDelete"
  | "penCatalogDeleteConfirmTitle"
  | "penCatalogDeleteConfirmDescription"
  | "penCatalogDeleteBlockedTitle"
  | "penCatalogDeleteBlockedDescription"
  | "penCatalogDeleteDeactivateInstead"
  | "penCatalogDeleteFailed"
  | "penCatalogColActions"
  | "penCatalogModalAddTitle"
  | "penCatalogModalEditTitle"
  | "penCatalogCancel"
  | "penCatalogInternalNotes"
  | "penCatalogSave"
>;

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

export default function PenCatalogPageClient() {
  const { t } = useLanguageStore();
  const { products, isLoading } = usePenProducts();
  const [localItems, setLocalItems] = useState<Row[] | null>(null);
  const items = localItems ?? (products as Row[]);
  const setItems = useCallback((updater: (prev: Row[]) => Row[]) => {
    setLocalItems((prev) => updater(prev ?? (products as Row[])));
  }, [products]);
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [modal, setModal] = useState<null | { mode: "add" } | { mode: "edit"; row: Row }>(null);
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [blockedDelete, setBlockedDelete] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const filteredItems = useMemo(
    () => items.filter((r) => rowMatchesSearch(r, search)),
    [items, search],
  );

  async function uploadFile(file: File): Promise<string> {
    const urlRes = await fetch("/api/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fileName: file.name,
        contentType: file.type || "image/jpeg",
        scope: "penCatalog",
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
    const url = mode === "add" ? "/api/admin/pen-products" : `/api/admin/pen-products/${id}`;
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
        throw new Error(errJson.hint);
      }
      if (errJson.prismaMessage) throw new Error(errJson.prismaMessage);
      throw new Error("save_failed");
    }
    const created = (mode === "add" ? errJson : errJson) as { product?: Row };
    if (!created.product) throw new Error("no_product");
    return created.product;
  }

  async function toggleActive(row: Row) {
    setTogglingId(row.id);
    setError(null);
    try {
      const updated = await persistPayload({ isActive: !row.isActive }, "edit", row.id);
      setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "toggle_failed");
    } finally {
      setTogglingId(null);
    }
  }

  async function confirmDeleteRow(row: Row) {
    setDeleteBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/pen-products/${row.id}`, { method: "DELETE" });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        movements?: number;
        orderRefs?: number;
      };
      if (!res.ok) {
        if (json.error === "has_operations") {
          setPendingDelete(null);
          setBlockedDelete(row);
          return;
        }
        throw new Error(json.error || "delete_failed");
      }
      setItems((prev) => prev.filter((r) => r.id !== row.id));
      setPendingDelete(null);
    } catch (e) {
      setError(
        e instanceof Error && e.message !== "delete_failed"
          ? e.message
          : t.admin.penCatalogDeleteFailed,
      );
      setPendingDelete(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  async function deactivateBlockedRow(row: Row) {
    setBlockedDelete(null);
    setTogglingId(row.id);
    setError(null);
    try {
      const updated = await persistPayload({ isActive: false }, "edit", row.id);
      setItems((prev) => prev.map((r) => (r.id === row.id ? updated : r)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "toggle_failed");
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/stock"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-600 transition-colors hover:bg-gray-50"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900">
              {t.admin.penCatalogTitle}
            </h1>
          </div>
        </div>
        <Button type="button" className="gap-2" onClick={() => setModal({ mode: "add" })}>
          <Plus className="h-4 w-4" />
          {t.admin.penCatalogAdd}
        </Button>
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder={t.admin.penCatalogSearchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-12 text-center">
          <PackagePlus className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-sm font-semibold text-gray-900">
            {search ? t.admin.penCatalogSearchEmpty : "Niciun pix în catalog"}
          </h3>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColSku}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColNameRo}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColStock}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColSellPrice}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColActive}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  {t.admin.penCatalogColActions}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 bg-white">
              {filteredItems.map((product) => (
                <tr
                  key={product.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setModal({ mode: "edit", row: product })}
                >
                  <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                    {product.sku}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{product.nameRo}</td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {product.stockQuantity}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                    {product.sellPrice ? `${product.sellPrice} MDL` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-6 py-4">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                        product.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {product.isActive
                        ? t.admin.penCatalogBadgeActive
                        : t.admin.penCatalogBadgeInactive}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-6 py-4" onClick={(e) => e.stopPropagation()}>
                    <AdminTableIconActions aria-label={t.admin.penCatalogColActions}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={adminTableOutlineIconButtonClass}
                        onClick={() => setModal({ mode: "edit", row: product })}
                        disabled={savingId !== null || togglingId !== null}
                      >
                        <Pencil className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className={adminTableOutlineIconButtonClass}
                        onClick={() => setPendingDelete(product)}
                        disabled={savingId !== null || togglingId !== null || deleteBusy}
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
        title={t.admin.penCatalogDeleteConfirmTitle}
        description={
          pendingDelete != null
            ? t.admin.penCatalogDeleteConfirmDescription(
                pendingDelete.nameRu || pendingDelete.nameRo || pendingDelete.sku,
              )
            : ""
        }
        confirmLabel={t.admin.penCatalogDelete}
        cancelLabel={t.admin.penCatalogCancel}
        busy={deleteBusy}
        onClose={() => {
          if (!deleteBusy) setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) void confirmDeleteRow(pendingDelete);
        }}
      />

      <AdminConfirmDialog
        open={blockedDelete != null}
        title={t.admin.penCatalogDeleteBlockedTitle}
        description={t.admin.penCatalogDeleteBlockedDescription}
        confirmLabel={t.admin.penCatalogDeleteDeactivateInstead}
        cancelLabel={t.admin.penCatalogCancel}
        confirmVariant="default"
        busy={togglingId != null}
        onClose={() => setBlockedDelete(null)}
        onConfirm={() => {
          if (blockedDelete) void deactivateBlockedRow(blockedDelete);
        }}
      />

      {modal ? (
        <PenCatalogEditModal
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
              const updated = await persistPayload(payload, modal.mode, modal.mode === "edit" ? modal.row.id : undefined);
              if (modal.mode === "add") {
                setItems((prev) => [updated, ...prev]);
              } else {
                setItems((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
              }
              setModal(null);
            } catch (e) {
              if (e instanceof Error && e.message === "sku_taken") {
                setError(t.admin.penCatalogSkuTaken);
              } else {
                setError(e instanceof Error ? e.message : "save_failed");
              }
            } finally {
              setSavingId(null);
            }
          }}
        />
      ) : null}
    </main>
  );
}

type ModalPayload = Record<string, unknown>;

function PenCatalogEditModal({
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
  t: AdminPenCatalogStrings;
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
  const [body, setBody] = useState(initialRow?.bodyColorHex ?? "#1f1f1f");
  const [clip, setClip] = useState(initialRow?.clipColorHex ?? "#c0c0c0");
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
    initialRow?.has3dPreview ?? false,
  );
  const [active, setActive] = useState<boolean>(initialRow?.isActive ?? true);
  const [notes, setNotes] = useState(initialRow?.internalNotes ?? "");
  const [preview, setPreview] = useState<string | null>(
    initialRow?.imagePublicUrl ?? null,
  );
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleSave() {
    const widthCm = Number.parseFloat(widthCmStr);
    const heightCm = Number.parseFloat(heightCmStr);
    const sellPrice = parseAmountMdl(sellStr);
    const dealerPrice = parseAmountMdl(dealerStr);
    const purchaseCost = parseAmountMdl(purchaseStr);

    let imageUrl = initialRow?.imageUrl ?? null;
    if (pendingFile) {
      imageUrl = await uploadFile(pendingFile);
    }

    const payload: ModalPayload = {
      sku,
      nameRo,
      nameRu,
      nameEn,
      stockQuantity: stock,
      sellPrice,
      dealerPrice,
      purchaseCost,
      imageUrl,
      bodyColorHex: body,
      clipColorHex: clip,
      printWidthCm: widthCm,
      printHeightCm: heightCm,
      printDpi: dpi,
      has3dPreview,
      isActive: active,
      internalNotes: notes.trim() || null,
    };

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
            {mode === "add" ? t.penCatalogModalAddTitle : t.penCatalogModalEditTitle}
          </h2>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            disabled={busy}
            className="shrink-0 rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label={t.penCatalogCancel}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-6 lg:flex-row lg:gap-8">
            <aside className="shrink-0 lg:w-[min(100%,280px)]">
              <p className="mb-2 text-xs font-medium text-gray-500">{t.penCatalogColPhoto}</p>
              <PhotoDropzone
                disabled={busy}
                publicUrl={preview}
                dropLabel={t.penCatalogPhotoDrop}
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
                  <label className="text-xs font-medium text-gray-600">{t.penCatalogColSku}</label>
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
                    {t.penCatalogColStock}
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
                    {t.penCatalogFieldPurchaseCost}
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
                    {t.penCatalogColSellPrice}
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
                    {t.penCatalogColDealerPrice}
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
                <p className="mb-2 text-xs font-semibold text-gray-700">{t.penCatalogNamesSection}</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.penCatalogColNameRo}</label>
                    <Input value={nameRo} onChange={(e) => setNameRo(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.penCatalogColNameRu}</label>
                    <Input value={nameRu} onChange={(e) => setNameRu(e.target.value)} className="mt-1" disabled={busy} />
                  </div>
                  <div>
                    <label className="text-[11px] font-medium text-gray-500">{t.penCatalogColNameEn}</label>
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
                <p className="mb-1 text-xs font-semibold text-gray-800">{t.penCatalogColorsSection}</p>
                {!has3dPreview && (
                  <p className="mb-3 text-[11px] text-gray-500">
                    {t.printDimensions.colorsDisabledHint}
                  </p>
                )}
                <div className={cn("grid grid-cols-2 gap-x-4 gap-y-3", has3dPreview && "mt-2")}>
                  {(
                    [
                      [body, setBody, t.penCatalogColBody],
                      [clip, setClip, t.penCatalogColClip],
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
                      {t.printDimensions.printDpi}
                    </label>
                    <MenuSelect
                      value={dpi}
                      onChange={setDpi}
                      options={DPI_PRESETS.map((d) => ({ value: d, label: String(d) }))}
                      disabled={busy}
                      className="mt-1"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="text-[11px] font-medium text-gray-600">
                      {t.printDimensions.pixelLabel}
                    </label>
                    <Input
                      value={`${Math.round(Number.parseFloat(widthCmStr) * dpi / 2.54)} × ${Math.round(Number.parseFloat(heightCmStr) * dpi / 2.54)}`}
                      disabled
                      className="mt-1 tabular-nums text-gray-500"
                      readOnly
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="has3d"
                    checked={has3dPreview}
                    onChange={(e) => setHas3dPreview(e.target.checked)}
                    disabled={busy}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <label htmlFor="has3d" className="text-[11px] font-medium text-gray-600">
                    {t.printDimensions.has3dPreviewLabel}
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="active"
                  checked={active}
                  onChange={(e) => setActive(e.target.checked)}
                  disabled={busy}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="active" className="text-xs font-medium text-gray-600">
                  {t.penCatalogColActive}
                </label>
              </div>

              <div>
                <label className="text-xs font-medium text-gray-600">{t.penCatalogInternalNotes}</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-gray-100 px-5 py-4 sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t.penCatalogCancel}
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t.penCatalogSave}
          </Button>
        </div>
      </div>
    </div>
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
