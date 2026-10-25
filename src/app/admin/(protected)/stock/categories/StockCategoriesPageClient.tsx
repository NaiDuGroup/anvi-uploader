"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { ArrowLeft, ChevronRight, Loader2, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { StockModalShell } from "@/app/admin/_components/stock/StockModalShell";
import { ActiveToggle, fieldLabelCls } from "@/app/admin/_components/stock/unified/StockBits";
import { stockErrorMessage, stockFetch, stockSwrFetcher } from "@/app/admin/_components/stock/unified/stockApi";
import { localizedStockName, type StockCategoryJson } from "@/lib/stock/unified/adminTypes";
import {
  STOCK_CATEGORY_KINDS,
  STOCK_UNITS,
  StockCategoryKind,
  StockUnit,
} from "@/lib/stock/unified/kinds";
import { categoryPrintsDtf, PrintMethod } from "@/lib/stock/unified/printMethods";

type ListResponse = { categories: StockCategoryJson[] };

/** Manage unified stock categories (names, kind, unit, order, active). */
export default function StockCategoriesPageClient() {
  const { t, locale } = useLanguageStore();
  const s = t.stock;
  const { data, isLoading, mutate, error } = useSWR<ListResponse>("/api/admin/stock/categories", stockSwrFetcher);
  const [modal, setModal] = useState<null | { category: StockCategoryJson | null }>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const categories: StockCategoryJson[] = data?.categories ?? [];

  async function toggleActive(c: StockCategoryJson): Promise<void> {
    setTogglingId(c.id);
    setActionError(null);
    try {
      await stockFetch(`/api/admin/stock/categories/${c.id}`, { method: "PATCH", body: { isActive: !c.isActive } });
      await mutate();
    } catch (e) {
      setActionError(stockErrorMessage(e, s));
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-4 py-6">
      <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t.admin.backToStockHub}
      </Link>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">{s.categoriesTitle}</h1>
          <p className="mt-1 text-sm text-gray-600">{s.categoriesIntro}</p>
        </div>
        <Button type="button" size="sm" className="shrink-0" onClick={() => setModal({ category: null })}>
          <Plus className="h-4 w-4" />
          {s.addCategory}
        </Button>
      </div>

      {actionError || error ? <p className="mb-4 text-sm text-red-600">{actionError ?? stockErrorMessage(error, s)}</p> : null}

      {isLoading ? (
        <div className="flex justify-center py-20 text-gray-400">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : categories.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">{s.categoriesEmpty}</p>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          {categories.map((c) => (
            <li key={c.id} className={cn("flex flex-col gap-3 p-4 sm:flex-row sm:items-center", !c.isActive && "bg-gray-50/60")}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-gray-900">
                  {localizedStockName(c, locale)}
                  <span className="font-mono text-xs font-normal text-gray-400">{c.code}</span>
                  {categoryPrintsDtf(c) ? (
                    <span
                      className="self-center rounded bg-fuchsia-50 px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-fuchsia-700 ring-1 ring-fuchsia-200"
                      title={s.printDtfHint}
                    >
                      {s.dtfBadge}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {[s.kinds[c.kind], s.unitNames[c.unit], s.hubItemCount(c.itemCount), `${s.sortOrder}: ${c.sortOrder}`].join(" · ")}
                </p>
              </div>
              <div className="flex items-center justify-between gap-3 sm:justify-end">
                <ActiveToggle
                  isActive={c.isActive}
                  busy={togglingId === c.id}
                  disabled={togglingId != null && togglingId !== c.id}
                  label={c.isActive ? s.badgeActive : s.badgeInactive}
                  onToggle={() => void toggleActive(c)}
                />
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="sm" className="h-8 px-2" title={s.edit} aria-label={s.edit} onClick={() => setModal({ category: c })}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Link
                    href={`/admin/stock/c/${encodeURIComponent(c.code)}`}
                    className="inline-flex h-8 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium shadow-sm hover:bg-gray-100"
                  >
                    {s.open}
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {modal ? (
        <CategoryModal
          key={modal.category?.id ?? "new"}
          category={modal.category}
          onClose={() => setModal(null)}
          onSaved={async () => {
            await mutate();
          }}
        />
      ) : null}
    </main>
  );
}

function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category: StockCategoryJson | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useLanguageStore();
  const s = t.stock;
  const [code, setCode] = useState<string>(category?.code ?? "");
  const [nameRu, setNameRu] = useState<string>(category?.nameRu ?? "");
  const [nameRo, setNameRo] = useState<string>(category?.nameRo ?? "");
  const [nameEn, setNameEn] = useState<string>(category?.nameEn ?? "");
  const [kind, setKind] = useState<StockCategoryKind>(category?.kind ?? StockCategoryKind.Product);
  const [unit, setUnit] = useState<StockUnit>(category?.unit ?? StockUnit.Pieces);
  const [sortOrder, setSortOrder] = useState<string>(String(category?.sortOrder ?? 0));
  const [active, setActive] = useState<boolean>(category?.isActive ?? true);
  const [printDtf, setPrintDtf] = useState<boolean>(category ? categoryPrintsDtf(category) : false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const unitLocked: boolean = category != null && category.itemCount > 0;

  async function save(): Promise<void> {
    const fallback: string = [nameRu, nameRo, nameEn].map((n) => n.trim()).find((n) => n) ?? "";
    if (!fallback) return setError(s.errorNameRequired);
    if (!category && !/^[a-z0-9][a-z0-9_-]{1,47}$/.test(code)) return setError(s.errorCodeInvalid);
    const order: number = Number.parseInt(sortOrder, 10);
    const body = {
      nameRu: nameRu.trim() || fallback,
      nameRo: nameRo.trim() || fallback,
      nameEn: nameEn.trim() || fallback,
      kind,
      sortOrder: Number.isFinite(order) ? order : 0,
      isActive: active,
      // Keep methods this screen doesn't edit yet (future «uv» etc.).
      printMethods: [
        ...(category?.printMethods ?? []).filter((m) => m !== PrintMethod.Dtf),
        ...(printDtf ? [PrintMethod.Dtf] : []),
      ],
      ...(unitLocked ? {} : { unit }),
    };
    setSaving(true);
    setError(null);
    try {
      if (category) {
        await stockFetch(`/api/admin/stock/categories/${category.id}`, { method: "PATCH", body });
      } else {
        await stockFetch("/api/admin/stock/categories", { method: "POST", body: { ...body, code, unit } });
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(stockErrorMessage(e, s));
    } finally {
      setSaving(false);
    }
  }

  return (
    <StockModalShell
      titleId="stock-category-modal-title"
      title={category ? s.categoryEditTitle : s.categoryAddTitle}
      busy={saving}
      onClose={onClose}
      footer={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-red-600">{error}</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {s.cancel}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void save()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              {s.save}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${fieldLabelCls} sm:col-span-2`}>
          {s.code}
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
            className="mt-1 font-mono"
            disabled={saving || category != null}
            autoComplete="off"
          />
          <span className="mt-1 block text-[11px] font-normal text-gray-500">{s.codeHint}</span>
        </label>
        {(
          [
            [s.nameRu, nameRu, setNameRu],
            [s.nameRo, nameRo, setNameRo],
            [s.nameEn, nameEn, setNameEn],
          ] as const
        ).map(([label, value, set]) => (
          <label key={label} className={fieldLabelCls}>
            {label}
            <Input value={value} onChange={(e) => set(e.target.value)} className="mt-1" disabled={saving} />
          </label>
        ))}
        <label className={fieldLabelCls}>
          {s.sortOrder}
          <Input
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, "").slice(0, 7))}
            inputMode="numeric"
            className="mt-1"
            disabled={saving}
          />
        </label>
        <div className={fieldLabelCls}>
          {s.kind}
          <MenuSelect
            value={kind}
            onChange={setKind}
            options={STOCK_CATEGORY_KINDS.map((k) => ({ value: k, label: s.kinds[k] }))}
            disabled={saving}
            className="mt-1"
            ariaLabel={s.kind}
          />
        </div>
        <div className={fieldLabelCls}>
          {s.unit}
          <MenuSelect
            value={unit}
            onChange={setUnit}
            options={STOCK_UNITS.map((u) => ({ value: u, label: s.unitNames[u] }))}
            disabled={saving || unitLocked}
            className="mt-1"
            ariaLabel={s.unit}
          />
          {unitLocked ? <span className="mt-1 block text-[11px] font-normal text-gray-500">{s.unitLockedHint}</span> : null}
        </div>
        <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 sm:col-span-2">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            disabled={saving}
            className="h-4 w-4 rounded border-gray-300"
          />
          {s.active}
        </label>
        <label className="flex items-start gap-2 text-xs font-medium text-gray-600 sm:col-span-2">
          <input
            type="checkbox"
            checked={printDtf}
            onChange={(e) => setPrintDtf(e.target.checked)}
            disabled={saving}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
          />
          <span className="min-w-0">
            {s.printDtf}
            <span className="mt-0.5 block text-[11px] font-normal text-gray-500">{s.printDtfHint}</span>
          </span>
        </label>
      </div>
    </StockModalShell>
  );
}
