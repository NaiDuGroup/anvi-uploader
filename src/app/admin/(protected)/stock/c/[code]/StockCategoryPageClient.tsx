"use client";

import { Fragment, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import useSWR from "swr";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  History,
  Layers,
  Loader2,
  Package,
  PackageMinus,
  PackagePlus,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import {
  AdminTableIconActions,
  adminTableOutlineIconButtonClass,
  adminTableOutlineLabeledButtonClass,
} from "@/app/admin/_components/AdminTableIconActions";
import { CatalogUnitCost } from "@/app/admin/_components/stock/CatalogUnitCost";
import { ActiveToggle, ColorSwatch, ItemPhoto, moneyCell } from "@/app/admin/_components/stock/unified/StockBits";
import { StockItemModal } from "@/app/admin/_components/stock/unified/StockItemModal";
import { StockBulkReceiptModal } from "@/app/admin/_components/stock/unified/StockBulkReceiptModal";
import { StockHistoryModal } from "@/app/admin/_components/stock/unified/StockHistoryModal";
import {
  StockInventoryModal,
  StockReceiptModal,
  StockWriteOffModal,
} from "@/app/admin/_components/stock/unified/StockOperationModals";
import {
  StockRequestError,
  stockErrorMessage,
  stockFetch,
  stockSwrFetcher,
} from "@/app/admin/_components/stock/unified/stockApi";
import {
  localizedStockName,
  type StockCategoryJson,
  type StockItemJson,
  type StockVariantJson,
} from "@/lib/stock/unified/adminTypes";
import { singlePiecePrice } from "@/lib/stock/unified/garmentTiers";
import type { StockUnit } from "@/lib/stock/unified/kinds";
import { formatQuantity } from "@/lib/stock/unified/quantity";

type CategoryResponse = { category: StockCategoryJson; items: StockItemJson[] };

/** «Цена»: the 1-piece run price when the variant has run prices (DTF), else the plain sell price. */
function variantSellPrice(v: StockVariantJson): number | null {
  return singlePiecePrice(v.priceTiers) ?? v.sellPrice;
}

/** Item row price: the price of a single variant, or «min–max» over active variants. */
function priceRange(item: StockItemJson, pick: (v: StockVariantJson) => number | null): string {
  const values: number[] = item.variants
    .filter((v) => v.isActive || item.variants.length === 1)
    .map(pick)
    .filter((n): n is number => n != null);
  if (values.length === 0) return "—";
  const min: number = Math.min(...values);
  const max: number = Math.max(...values);
  return min === max ? moneyCell(min) : `${moneyCell(min)}–${moneyCell(max)}`;
}

type VariantOp = "receive" | "inventory" | "writeOff" | "history";

type OpState = { op: VariantOp; item: StockItemJson; variant: StockVariantJson } | null;

const metricIconCls = "h-3.5 w-3.5 shrink-0 text-gray-500";
const headerLinkCls: string = buttonVariants({ variant: "outline" });

function matchesSearch(item: StockItemJson, q: string): boolean {
  const s: string = q.trim().toLowerCase();
  if (!s) return true;
  return (
    item.sku.toLowerCase().includes(s) ||
    item.nameRo.toLowerCase().includes(s) ||
    item.nameRu.toLowerCase().includes(s) ||
    item.nameEn.toLowerCase().includes(s) ||
    item.variants.some((v) => v.sku.toLowerCase().includes(s) || (v.label ?? "").toLowerCase().includes(s))
  );
}

function isLow(v: StockVariantJson): boolean {
  return v.reorderLevel != null && v.stockQuantity <= v.reorderLevel;
}

/** A single plain variant: show its actions on the item row instead of an expandable list. */
function isSingle(item: StockItemJson): boolean {
  return item.variants.length === 1 && !item.variants[0].label;
}

export default function StockCategoryPageClient({ code }: { code: string }) {
  const { t, locale } = useLanguageStore();
  const s = t.stock;
  const { data, error, isLoading, mutate } = useSWR<CategoryResponse>(
    `/api/admin/stock/items?category=${encodeURIComponent(code)}`,
    stockSwrFetcher,
  );
  const [search, setSearch] = useState<string>("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [modal, setModal] = useState<null | { item: StockItemJson | null }>(null);
  const [bulkOpen, setBulkOpen] = useState<boolean>(false);
  const [op, setOp] = useState<OpState>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<StockItemJson | null>(null);
  const [blockedDelete, setBlockedDelete] = useState<StockItemJson | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const category: StockCategoryJson | undefined = data?.category;
  const items: StockItemJson[] = useMemo(() => data?.items ?? [], [data]);
  const filtered: StockItemJson[] = useMemo(() => items.filter((i) => matchesSearch(i, search)), [items, search]);
  const unit: StockUnit | undefined = category?.unit;

  const reload = async (): Promise<void> => {
    await mutate();
  };

  function toggleExpanded(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function setItemActive(item: StockItemJson, isActive: boolean): Promise<void> {
    setTogglingId(item.id);
    setActionError(null);
    try {
      await stockFetch(`/api/admin/stock/items/${item.id}`, { method: "PATCH", body: { isActive } });
      await reload();
    } catch (e) {
      setActionError(stockErrorMessage(e, s));
    } finally {
      setTogglingId(null);
    }
  }

  async function deleteItem(item: StockItemJson): Promise<void> {
    setBusy(true);
    setActionError(null);
    try {
      await stockFetch(`/api/admin/stock/items/${item.id}`, { method: "DELETE" });
      setPendingDelete(null);
      await reload();
    } catch (e) {
      setPendingDelete(null);
      if (e instanceof StockRequestError && e.body.error === "has_movements") setBlockedDelete(item);
      else setActionError(stockErrorMessage(e, s));
    } finally {
      setBusy(false);
    }
  }

  if (error instanceof StockRequestError && error.status === 404) {
    return (
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
        <BackLink label={t.admin.backToStockHub} />
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">
          {s.categoryNotFound}
        </p>
      </main>
    );
  }

  const title: string = category ? localizedStockName(category, locale) : "";

  const variantActions = (item: StockItemJson, v: StockVariantJson, showLabels: boolean): ReactNode => {
    const buttons: { op: VariantOp; label: string; icon: ReactNode }[] = [
      { op: "receive", label: s.actionReceive, icon: <PackagePlus className="h-3.5 w-3.5 shrink-0" /> },
      { op: "inventory", label: s.actionInventory, icon: <ClipboardCheck className="h-3.5 w-3.5 shrink-0" /> },
      { op: "writeOff", label: s.actionWriteOff, icon: <PackageMinus className="h-3.5 w-3.5 shrink-0" /> },
      { op: "history", label: s.actionHistory, icon: <History className="h-3.5 w-3.5 shrink-0" /> },
    ];
    return (
      <AdminTableIconActions aria-label={s.colActions} className={showLabels ? "flex-wrap justify-start" : undefined}>
        {buttons.map((b) => (
          <Button
            key={b.op}
            type="button"
            variant="outline"
            size="sm"
            className={adminTableOutlineLabeledButtonClass}
            title={b.label}
            aria-label={b.label}
            onClick={() => setOp({ op: b.op, item, variant: v })}
          >
            {b.icon}
            <span className={showLabels ? undefined : "hidden 2xl:inline"}>{b.label}</span>
          </Button>
        ))}
      </AdminTableIconActions>
    );
  };

  const itemActions = (item: StockItemJson): ReactNode => (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={adminTableOutlineIconButtonClass}
        title={s.edit}
        aria-label={s.edit}
        onClick={() => setModal({ item })}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn(
          adminTableOutlineIconButtonClass,
          "border-red-100 text-red-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700",
        )}
        title={s.delete}
        aria-label={s.delete}
        disabled={busy}
        onClick={() => setPendingDelete(item)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </>
  );

  const stockCell = (v: StockVariantJson): ReactNode => (
    <span className={cn("tabular-nums", isLow(v) && "font-semibold text-amber-700")} title={isLow(v) ? s.lowStock : undefined}>
      {formatQuantity(v.stockQuantity)}
      {isLow(v) ? <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] font-medium text-amber-700">{s.lowStock}</span> : null}
    </span>
  );

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-6">
      <BackLink label={t.admin.backToStockHub} />
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <h1 className="min-w-0 shrink-0 truncate text-2xl font-bold tracking-tight text-gray-900">
            {title || " "}
            {unit ? <span className="ml-2 align-middle text-sm font-medium text-gray-400">{s.units[unit]}</span> : null}
          </h1>
          <div className="relative w-full min-w-0 sm:w-72 sm:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <Input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={s.searchPlaceholder}
              className="h-10 w-full pl-9 pr-3"
              autoComplete="off"
              aria-label={s.searchPlaceholder}
            />
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <Link href={`/admin/stock/prices?category=${encodeURIComponent(code)}`} className={headerLinkCls}>
            <Tags className="h-4 w-4" aria-hidden />
            {t.stockBulk.hubPricesLink}
          </Link>
          <Link href={`/admin/stock/stocktake?category=${encodeURIComponent(code)}`} className={headerLinkCls}>
            <ClipboardCheck className="h-4 w-4" aria-hidden />
            {t.stockBulk.hubStocktakeLink}
          </Link>
          <Button type="button" variant="outline" size="sm" disabled={!category || items.length === 0} onClick={() => setBulkOpen(true)}>
            <PackagePlus className="h-4 w-4" />
            {s.receiveToStock}
          </Button>
          <Button type="button" size="sm" disabled={!category} onClick={() => setModal({ item: null })}>
            <Plus className="h-4 w-4" />
            {s.addItem}
          </Button>
        </div>
      </div>

      {actionError ? <p className="mb-4 text-sm text-red-600">{actionError}</p> : null}
      {error && !(error instanceof StockRequestError && error.status === 404) ? (
        <p className="mb-4 text-sm text-red-600">{stockErrorMessage(error, s)}</p>
      ) : null}

      {isLoading || !category || !unit ? (
        isLoading ? (
          <div className="flex justify-center py-20 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : null
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">{s.empty}</p>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500 shadow-sm">{s.searchEmpty}</p>
      ) : (
        <>
          {/* Phones / tablets: cards */}
          <div className="grid gap-3 lg:hidden">
            {filtered.map((item) => {
              const single: boolean = isSingle(item);
              const open: boolean = single || expanded.has(item.id);
              const name: string = localizedStockName(item, locale);
              return (
                <article key={item.id} className={cn("rounded-xl border border-gray-200 bg-white p-4 shadow-sm", !item.isActive && "opacity-70")}>
                  <div className="flex gap-3">
                    <ItemPhoto url={item.imagePublicUrl} />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <p className="break-all font-mono text-xs text-gray-900">{item.sku}</p>
                      <p className="text-sm leading-snug text-gray-900">
                        {name}
                        {item.isSellable ? <SellableBadge label={s.sellableBadge} /> : null}
                      </p>
                      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] tabular-nums sm:grid-cols-3">
                        <Metric icon={<Layers className={metricIconCls} aria-hidden />} label={s.colVariants} value={String(item.variants.length)} />
                        <Metric
                          icon={<Package className={metricIconCls} aria-hidden />}
                          label={s.colStock}
                          value={`${formatQuantity(item.totalStock)} ${s.units[unit]}`}
                        />
                        <Metric
                          icon={<CircleDollarSign className={metricIconCls} aria-hidden />}
                          label={s.colAvgCost}
                          value={moneyCell(item.avgCost)}
                        />
                      </dl>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                    <ActiveToggle
                      isActive={item.isActive}
                      busy={togglingId === item.id}
                      disabled={togglingId != null && togglingId !== item.id}
                      label={item.isActive ? s.badgeActive : s.badgeInactive}
                      onToggle={() => void setItemActive(item, !item.isActive)}
                    />
                    <div className="flex items-center gap-1">{itemActions(item)}</div>
                  </div>
                  {!single ? (
                    <button
                      type="button"
                      className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900"
                      aria-expanded={open}
                      onClick={() => toggleExpanded(item.id)}
                    >
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      {open ? s.hideVariants : s.showVariants(item.variants.length)}
                    </button>
                  ) : null}
                  {open ? (
                    <ul className="mt-2 space-y-2">
                      {item.variants.map((v) => (
                        <li key={v.id} className={cn("rounded-lg border border-gray-100 bg-gray-50/60 p-3", !v.isActive && "opacity-60")}>
                          {!single ? (
                            <p className="flex items-center gap-1.5 text-sm font-medium text-gray-900">
                              <ColorSwatch hex={v.options.colorHex} title={v.options.color} />
                              {v.label || "—"}
                            </p>
                          ) : null}
                          {!single ? <p className="break-all font-mono text-[11px] text-gray-500">{v.sku}</p> : null}
                          <dl className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] tabular-nums">
                            <Metric label={s.colStock} value={stockCell(v)} />
                            <Metric label={s.colAvgCost} value={<CatalogUnitCost avgPurchaseCost={v.avgCost} purchaseCost={v.purchaseCost} />} />
                            <Metric label={s.colSellPrice} value={moneyCell(variantSellPrice(v))} />
                            <Metric label={s.colDealerPrice} value={moneyCell(v.dealerPrice)} />
                          </dl>
                          <div className="mt-2">{variantActions(item, v, true)}</div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              );
            })}
          </div>

          {/* Desktop: table with expandable variants */}
          <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm lg:block">
            <table className="w-full min-w-[1260px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[44px]" />
                <col className="w-[72px]" />
                <col className="w-[160px]" />
                <col />
                <col className="w-[96px]" />
                <col className="w-[120px]" />
                <col className="w-[150px]" />
                <col className="w-[110px]" />
                <col className="w-[110px]" />
                <col className="w-[96px]" />
                <col className="w-[300px] 2xl:w-[460px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">
                  <th className="p-3" aria-label={s.showVariants(0)} />
                  <th className="p-3">{s.colPhoto}</th>
                  <th className="p-3">{s.colSku}</th>
                  <th className="p-3">{s.colName}</th>
                  <th className="p-3">{s.colVariants}</th>
                  <th className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <Package className={metricIconCls} aria-hidden />
                      {s.colStock}
                    </span>
                  </th>
                  <th className="p-3">
                    <span className="inline-flex items-center gap-1.5">
                      <CircleDollarSign className={metricIconCls} aria-hidden />
                      {s.colAvgCost}
                    </span>
                  </th>
                  <th className="p-3">{s.colSellPrice}</th>
                  <th className="p-3">{s.colDealerPrice}</th>
                  <th className="p-3 text-center">{s.colActive}</th>
                  <th className="p-3 text-right">{s.colActions}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const single: boolean = isSingle(item);
                  const open: boolean = !single && expanded.has(item.id);
                  const name: string = localizedStockName(item, locale);
                  const secondary: string = locale === "ro" ? item.nameRu : item.nameRo;
                  return (
                    <Fragment key={item.id}>
                      <tr
                        className={cn(
                          "border-b border-gray-100 align-middle transition-colors hover:bg-gray-50/80",
                          !single && "cursor-pointer",
                          !item.isActive && "text-gray-500",
                        )}
                        onClick={() => {
                          if (!single) toggleExpanded(item.id);
                        }}
                      >
                        <td className="p-2 text-center text-gray-400">
                          {!single ? (
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-label={open ? s.hideVariants : s.showVariants(item.variants.length)}
                              className="rounded p-1 hover:bg-gray-100 hover:text-gray-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleExpanded(item.id);
                              }}
                            >
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <ItemPhoto url={item.imagePublicUrl} size="sm" />
                        </td>
                        <td className="truncate p-2 font-mono text-xs" title={item.sku}>
                          {item.sku}
                        </td>
                        <td className="p-2">
                          <p className="line-clamp-2 text-xs leading-snug text-gray-900">
                            {name}
                            {item.isSellable ? <SellableBadge label={s.sellableBadge} /> : null}
                          </p>
                          {secondary && secondary !== name ? (
                            <p className="mt-0.5 line-clamp-1 text-[10px] text-gray-400">{secondary}</p>
                          ) : null}
                        </td>
                        <td className="p-2 tabular-nums">{item.variants.length}</td>
                        <td className="p-2">
                          {single ? stockCell(item.variants[0]) : <span className="tabular-nums">{formatQuantity(item.totalStock)}</span>}
                        </td>
                        <td className="p-2 text-xs tabular-nums">
                          {single ? (
                            <CatalogUnitCost avgPurchaseCost={item.variants[0].avgCost} purchaseCost={item.variants[0].purchaseCost} />
                          ) : (
                            moneyCell(item.avgCost)
                          )}
                        </td>
                        <td className="p-2 text-xs tabular-nums">{priceRange(item, variantSellPrice)}</td>
                        <td className="p-2 text-xs tabular-nums">{priceRange(item, (v) => v.dealerPrice)}</td>
                        <td className="p-2 text-center" onClick={(e) => e.stopPropagation()}>
                          <ActiveToggle
                            isActive={item.isActive}
                            busy={togglingId === item.id}
                            disabled={togglingId != null && togglingId !== item.id}
                            label={item.isActive ? s.badgeActive : s.badgeInactive}
                            onToggle={() => void setItemActive(item, !item.isActive)}
                          />
                        </td>
                        <td className="p-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {single ? variantActions(item, item.variants[0], false) : null}
                            {itemActions(item)}
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-gray-100 bg-gray-50/60">
                          <td />
                          <td colSpan={10} className="px-2 pb-3 pt-1">
                            <VariantsTable
                              item={item}
                              strings={s}
                              stockCell={stockCell}
                              actions={(v) => variantActions(item, v, false)}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <AdminConfirmDialog
        open={pendingDelete != null}
        title={s.deleteConfirmTitle}
        description={pendingDelete ? s.deleteConfirmDescription(localizedStockName(pendingDelete, locale)) : ""}
        confirmLabel={s.delete}
        cancelLabel={s.cancel}
        confirmVariant="destructive"
        busy={busy}
        onClose={() => {
          if (!busy) setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete) void deleteItem(pendingDelete);
        }}
      />
      <AdminConfirmDialog
        open={blockedDelete != null}
        title={s.deleteBlockedTitle}
        description={s.deleteBlockedDescription}
        confirmLabel={s.deactivateInstead}
        cancelLabel={s.cancel}
        confirmVariant="default"
        busy={togglingId != null}
        onClose={() => setBlockedDelete(null)}
        onConfirm={() => {
          const item = blockedDelete;
          setBlockedDelete(null);
          if (item) void setItemActive(item, false);
        }}
      />

      {modal && category ? (
        <StockItemModal
          key={modal.item?.id ?? "new"}
          category={category}
          item={modal.item}
          onClose={() => setModal(null)}
          onSaved={reload}
        />
      ) : null}
      {bulkOpen && unit ? (
        <StockBulkReceiptModal items={items} unit={unit} onClose={() => setBulkOpen(false)} onSaved={reload} />
      ) : null}
      {op && unit ? <OperationModal op={op} unit={unit} locale={locale} items={items} onClose={() => setOp(null)} onSaved={reload} /> : null}
    </main>
  );
}

/** Opens the modal for the chosen variant action, always with the freshest variant data. */
function OperationModal({
  op,
  unit,
  locale,
  items,
  onClose,
  onSaved,
}: {
  op: NonNullable<OpState>;
  unit: StockUnit;
  locale: string;
  items: StockItemJson[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const item: StockItemJson = items.find((i) => i.id === op.item.id) ?? op.item;
  const variant: StockVariantJson = item.variants.find((v) => v.id === op.variant.id) ?? op.variant;
  const props = { variant, itemName: localizedStockName(item, locale), unit, onClose };
  switch (op.op) {
    case "receive":
      return <StockReceiptModal {...props} onSaved={onSaved} />;
    case "inventory":
      return <StockInventoryModal {...props} onSaved={onSaved} />;
    case "writeOff":
      return <StockWriteOffModal {...props} onSaved={onSaved} />;
    case "history":
      return <StockHistoryModal {...props} onChanged={onSaved} />;
  }
}

function VariantsTable({
  item,
  strings: s,
  stockCell,
  actions,
}: {
  item: StockItemJson;
  strings: ReturnType<typeof useLanguageStore.getState>["t"]["stock"];
  stockCell: (v: StockVariantJson) => ReactNode;
  actions: (v: StockVariantJson) => ReactNode;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="w-full min-w-[900px] border-collapse text-xs">
        <thead>
          <tr className="border-b border-gray-100 text-left font-semibold uppercase tracking-wide text-gray-500">
            <th className="p-2">{s.colVariant}</th>
            <th className="p-2">{s.colSku}</th>
            <th className="p-2">{s.colColor}</th>
            <th className="p-2">{s.colSize}</th>
            <th className="p-2">{s.colStock}</th>
            <th className="p-2">{s.colAvgCost}</th>
            <th className="p-2">{s.colSellPrice}</th>
            <th className="p-2">{s.colDealerPrice}</th>
            <th className="p-2 text-right">{s.colActions}</th>
          </tr>
        </thead>
        <tbody>
          {item.variants.map((v) => (
            <tr key={v.id} className={cn("border-b border-gray-50 last:border-0", !v.isActive && "text-gray-400")}>
              <td className="p-2 font-medium">
                {v.label || "—"}
                {!v.isActive ? <span className="ml-1 text-[10px] font-normal">({s.badgeInactive})</span> : null}
              </td>
              <td className="p-2 font-mono">{v.sku}</td>
              <td className="p-2">
                <span className="inline-flex items-center gap-1.5">
                  <ColorSwatch hex={v.options.colorHex} />
                  {v.options.color ?? "—"}
                </span>
              </td>
              <td className="p-2">{v.options.size ?? "—"}</td>
              <td className="p-2">{stockCell(v)}</td>
              <td className="p-2 tabular-nums">
                <CatalogUnitCost avgPurchaseCost={v.avgCost} purchaseCost={v.purchaseCost} />
              </td>
              <td className="p-2 tabular-nums" title={v.priceTiers ? s.tiersPriceHint : undefined}>
                {moneyCell(variantSellPrice(v))}
              </td>
              <td className="p-2 tabular-nums">{moneyCell(v.dealerPrice)}</td>
              <td className="p-2">
                <div className="flex justify-end">{actions(v)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/admin/stock" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900">
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {label}
    </Link>
  );
}

function SellableBadge({ label }: { label: string }) {
  return (
    <span className="ml-1.5 inline-block rounded bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-medium text-emerald-700 ring-1 ring-emerald-100">
      {label}
    </span>
  );
}

function Metric({ icon, label, value }: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-medium text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {label}
        </span>
      </dt>
      <dd className="text-gray-900">{value}</dd>
    </div>
  );
}
