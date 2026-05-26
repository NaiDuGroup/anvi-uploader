"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { DateRangeFilter } from "./DateRangeFilter";
import { formatCurrency, formatDate } from "@/lib/invoice/invoiceDisplay";
import { cn } from "@/lib/utils";
import {
  BUSINESS_EXPENSE_PERIODS,
  BUSINESS_EXPENSE_TYPES,
  type BusinessExpensePeriod,
  type BusinessExpenseType,
} from "@/lib/accounting/types";
import { useAccountingReport, type AccountingReportOrder, type AccountingExpenseRow } from "@/lib/swr";

function utcTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function addUtcDays(isoDay: string, delta: number): string {
  const t = new Date(`${isoDay}T12:00:00.000Z`).getTime() + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

function startOfUtcWeekMonday(isoDay: string): string {
  const d = new Date(`${isoDay}T12:00:00.000Z`);
  const dow = d.getUTCDay();
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  return addUtcDays(isoDay, -mondayOffset);
}

function firstOfUtcMonth(isoDay: string): string {
  return `${isoDay.slice(0, 7)}-01`;
}

type ReportOrder = AccountingReportOrder;
type ExpenseRow = AccountingExpenseRow;

export default function AccountingPageClient() {
  const { t, locale } = useLanguageStore();
  const [dateFrom, setDateFrom] = useState(utcTodayKey);
  const [dateTo, setDateTo] = useState(utcTodayKey);

  const {
    currency,
    summary,
    orders,
    expensesBreakdown,
    error: reportError,
    isLoading: loading,
    mutate: loadReport,
  } = useAccountingReport(dateFrom, dateTo);
  const error = reportError ? (reportError instanceof Error ? reportError.message : t.accounting.loadError) : null;

  const [detailOrder, setDetailOrder] = useState<ReportOrder | null>(null);

  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRow | null>(null);
  const [expenseFormError, setExpenseFormError] = useState<string | null>(null);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [eName, setEName] = useState("");
  const [eType, setEType] = useState<BusinessExpenseType>("other");
  const [eAmount, setEAmount] = useState("");
  const [ePeriod, setEPeriod] = useState<BusinessExpensePeriod>("monthly");
  const [eStart, setEStart] = useState("");
  const [eEnd, setEEnd] = useState("");
  const [eActive, setEActive] = useState(true);
  const [eNotes, setENotes] = useState("");

  const [deleteExpenseId, setDeleteExpenseId] = useState<string | null>(null);

  const setDateFilter = useCallback((from: string, to: string) => {
    setDateFrom(from);
    setDateTo(to);
  }, []);

  const applyPreset = useCallback(
    (preset: "today" | "yesterday" | "week" | "month") => {
      const today = utcTodayKey();
      if (preset === "today") {
        setDateFilter(today, today);
        return;
      }
      if (preset === "yesterday") {
        const y = addUtcDays(today, -1);
        setDateFilter(y, y);
        return;
      }
      if (preset === "week") {
        const from = startOfUtcWeekMonday(today);
        setDateFilter(from, today);
        return;
      }
      setDateFilter(firstOfUtcMonth(today), today);
    },
    [setDateFilter],
  );

  const expenseTypeLabel = (tp: string): string => {
    switch (tp) {
      case "rent":
        return t.accounting.expenseTypeRent;
      case "tax":
        return t.accounting.expenseTypeTax;
      case "equipment_depreciation":
        return t.accounting.expenseTypeEquipmentDepreciation;
      case "consumables":
        return t.accounting.expenseTypeConsumables;
      case "electricity":
        return t.accounting.expenseTypeElectricity;
      default:
        return t.accounting.expenseTypeOther;
    }
  };

  const expensePeriodLabel = (p: string): string => {
    switch (p) {
      case "daily":
        return t.accounting.expensePeriodDaily;
      case "monthly":
        return t.accounting.expensePeriodMonthly;
      case "yearly":
        return t.accounting.expensePeriodYearly;
      case "one_time":
        return t.accounting.expensePeriodOneTime;
      default:
        return p;
    }
  };

  const openCreateExpense = () => {
    setEditingExpense(null);
    setEName("");
    setEType("other");
    setEAmount("");
    setEPeriod("monthly");
    setEStart(dateFrom || utcTodayKey());
    setEEnd("");
    setEActive(true);
    setENotes("");
    setExpenseFormError(null);
    setExpenseModalOpen(true);
  };

  const openEditExpense = (row: ExpenseRow) => {
    setEditingExpense(row);
    setEName(row.name);
    setEType(row.type as BusinessExpenseType);
    setEAmount(String(row.amount));
    setEPeriod(row.period as BusinessExpensePeriod);
    setEStart(row.startDate);
    setEEnd(row.endDate ?? "");
    setEActive(row.isActive);
    setENotes(row.notes ?? "");
    setExpenseFormError(null);
    setExpenseModalOpen(true);
  };

  const submitExpense = async (ev: React.FormEvent) => {
    ev.preventDefault();
    setExpenseSaving(true);
    setExpenseFormError(null);
    const amount = Number.parseInt(eAmount.replace(/\s/g, ""), 10);
    if (!Number.isFinite(amount) || amount < 0) {
      setExpenseFormError("amount");
      setExpenseSaving(false);
      return;
    }
    try {
      if (editingExpense) {
        const res = await fetch(`/api/admin/business-expenses/${editingExpense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: eName.trim(),
            type: eType,
            amount,
            period: ePeriod,
            startDate: eStart,
            endDate: eEnd.trim() ? eEnd.trim() : null,
            isActive: eActive,
            notes: eNotes.trim() || null,
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          setExpenseFormError(b.error ?? "save");
          setExpenseSaving(false);
          return;
        }
      } else {
        const res = await fetch("/api/admin/business-expenses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: eName.trim(),
            type: eType,
            amount,
            period: ePeriod,
            startDate: eStart,
            endDate: eEnd.trim() ? eEnd.trim() : null,
            isActive: eActive,
            notes: eNotes.trim() || null,
          }),
        });
        if (!res.ok) {
          const b = (await res.json().catch(() => ({}))) as { error?: string };
          setExpenseFormError(b.error ?? "save");
          setExpenseSaving(false);
          return;
        }
      }
      setExpenseModalOpen(false);
      await loadReport();
    } catch {
      setExpenseFormError("network");
    } finally {
      setExpenseSaving(false);
    }
  };

  const confirmDeleteExpense = async () => {
    if (!deleteExpenseId) return;
    try {
      const res = await fetch(`/api/admin/business-expenses/${deleteExpenseId}`, {
        method: "DELETE",
      });
      if (!res.ok) return;
      setDeleteExpenseId(null);
      await loadReport();
    } catch {
      /* ignore */
    }
  };

  const fmt = (n: number) => formatCurrency(n, currency);

  const marginStr =
    summary == null
      ? "—"
      : `${summary.profitMarginPct.toLocaleString(locale === "en" ? "en-US" : "ro-RO", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}%`;

  const summaryTiles = [
    { key: "rev", label: t.accounting.summaryRevenue, value: fmt(summary?.revenue ?? 0) },
    {
      key: "net",
      label: t.accounting.summaryNetProfit,
      value: fmt(summary?.netProfit ?? 0),
      emphasize: true as const,
    },
    {
      key: "pc",
      label: t.accounting.summaryProductCost,
      value: fmt(summary?.productPurchaseCosts ?? 0),
    },
    {
      key: "prod",
      label: t.accounting.summaryProductionCost,
      value: fmt(summary?.productionCosts ?? 0),
    },
    {
      key: "tax",
      label: t.accounting.summaryTaxes,
      value: fmt(summary?.taxes ?? 0),
    },
    {
      key: "oh",
      label: t.accounting.summaryOverhead,
      value: fmt(summary?.allocatedExpenses ?? 0),
    },
    {
      key: "margin",
      label: t.accounting.summaryMargin,
      value: marginStr,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 sm:px-5">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">
          {t.accounting.pageTitle}
        </h1>
        <p className="max-w-3xl text-sm text-gray-600">{t.accounting.pageSubtitle}</p>
      </header>

      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["today", t.accounting.presetToday],
              ["yesterday", t.accounting.presetYesterday],
              ["week", t.accounting.presetThisWeek],
              ["month", t.accounting.presetThisMonth],
            ] as const
          ).map(([p, label]) => (
            <Button
              key={p}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => applyPreset(p)}
            >
              {label}
            </Button>
          ))}
        </div>
        {dateFrom && dateTo ? (
          <DateRangeFilter
            dateFrom={dateFrom}
            dateTo={dateTo}
            onChange={setDateFilter}
            locale={locale}
            t={t}
            className="lg:ml-auto"
          />
        ) : null}
      </div>

      <p className="text-xs text-gray-500">{t.accounting.allocationNote}</p>

      {error ? (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
        >
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-600">{t.accounting.loading}</p>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
            {summaryTiles.map((tile) => (
              <div
                key={tile.key}
                className={cn(
                  "rounded-xl border border-gray-200/90 bg-white p-3 shadow-sm",
                  "emphasize" in tile && tile.emphasize ? "ring-1 ring-amber-200/80" : "",
                )}
              >
                <div className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
                  {tile.label}
                </div>
                <div className="mt-1 tabular-nums text-lg font-semibold text-gray-900">
                  {tile.value}
                </div>
              </div>
            ))}
          </section>

          <section className="overflow-x-auto rounded-xl border border-gray-200/90 bg-white shadow-sm">
            <table className="min-w-[960px] w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs text-gray-600">
                  <th className="p-3 font-medium">{t.accounting.colOrder}</th>
                  <th className="p-3 font-medium">{t.accounting.colDate}</th>
                  <th className="p-3 font-medium">{t.accounting.colCustomer}</th>
                  <th className="p-3 text-right font-medium">{t.accounting.colRevenue}</th>
                  <th className="p-3 text-right font-medium">
                    {t.accounting.colProductCost}
                  </th>
                  <th className="p-3 text-right font-medium">
                    {t.accounting.colProductionCost}
                  </th>
                  <th className="p-3 text-right font-medium">{t.accounting.colTaxes}</th>
                  <th className="p-3 text-right font-medium">
                    {t.accounting.colOverhead}
                  </th>
                  <th className="p-3 text-right font-medium">{t.accounting.colNetProfit}</th>
                  <th className="p-3 text-right font-medium">{t.accounting.colMargin}</th>
                </tr>
              </thead>
              <tbody>
                {orders?.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-gray-500">
                      {t.accounting.ordersEmpty}
                    </td>
                  </tr>
                ) : (
                  orders?.map((o) => (
                    <tr
                      key={o.id}
                      className="cursor-pointer border-b border-gray-100 transition-colors hover:bg-amber-50/40"
                      onClick={() => setDetailOrder(o)}
                    >
                      <td className="p-3 font-mono text-xs text-gray-900">#{o.orderNumber}</td>
                      <td className="p-3 text-gray-700">
                        {formatDate(o.createdAt.slice(0, 10), locale)}
                      </td>
                      <td className="max-w-[180px] truncate p-3 text-gray-700">
                        {o.customerLabel ?? "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums">{fmt(o.revenue)}</td>
                      <td className="p-3 text-right tabular-nums">
                        <span className="inline-flex items-center justify-end gap-1">
                          {fmt(o.productPurchaseCosts)}
                          {o.missingProductCost ? (
                            <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-900">
                              {t.accounting.missingCostBadge}
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {fmt(o.productionCosts)}
                      </td>
                      <td className="p-3 text-right tabular-nums">{fmt(o.taxes)}</td>
                      <td className="p-3 text-right tabular-nums">{fmt(o.allocatedExpenses)}</td>
                      <td className="p-3 text-right font-medium tabular-nums">
                        {fmt(o.netProfit)}
                      </td>
                      <td className="p-3 text-right tabular-nums text-gray-700">
                        {o.revenue > 0 ? `${o.profitMarginPct.toFixed(2)}%` : "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </section>

          <section>
            <div className="rounded-xl border border-gray-200/90 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-gray-900">
                  {t.accounting.sectionExpenses}
                </h2>
                <Button type="button" size="sm" variant="outline" onClick={openCreateExpense}>
                  <Plus className="mr-1 h-4 w-4" />
                  {t.accounting.expensesAdd}
                </Button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-gray-600">
                      <th className="py-2 pr-2">{t.accounting.expensesName}</th>
                      <th className="py-2 pr-2">{t.accounting.expensesType}</th>
                      <th className="py-2 pr-2">{t.accounting.expensesPeriod}</th>
                      <th className="py-2 pr-2 text-right">{t.accounting.expensesAmount}</th>
                      <th className="py-2 text-right">{t.accounting.expensesAccruedInRange}</th>
                      <th className="w-20 py-2 pl-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {expensesBreakdown.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-gray-500">
                          {t.accounting.expensesEmpty}
                        </td>
                      </tr>
                    ) : (
                      expensesBreakdown.map((e) => (
                        <tr key={e.id} className="border-b border-gray-100">
                          <td className="py-2 pr-2">{e.name}</td>
                          <td className="py-2 pr-2">{expenseTypeLabel(e.type)}</td>
                          <td className="py-2 pr-2">{expensePeriodLabel(e.period)}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">{fmt(e.amount)}</td>
                          <td className="py-2 text-right tabular-nums">{fmt(e.accruedInRange)}</td>
                          <td className="py-2 pl-2">
                            <div className="flex justify-end gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label={t.accounting.expensesEdit}
                                onClick={() => openEditExpense(e)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-700"
                                aria-label={t.accounting.expensesDelete}
                                onClick={() => setDeleteExpenseId(e.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}

      {detailOrder ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="acct-br-title"
        >
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="flex items-start justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <h2 id="acct-br-title" className="text-sm font-semibold text-gray-900">
                {t.accounting.breakdownTitle(detailOrder.orderNumber)}
              </h2>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => setDetailOrder(null)}
                aria-label={t.accounting.breakdownClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <dl className="space-y-2 px-4 py-3 text-sm">
              {[
                [t.accounting.breakdownRevenue, fmt(detailOrder.revenue)],
                [t.accounting.breakdownProductCost, fmt(detailOrder.productPurchaseCosts)],
                [t.accounting.breakdownProduction, fmt(detailOrder.productionCosts)],
                [t.accounting.breakdownOverhead, fmt(detailOrder.allocatedExpenses)],
                [t.accounting.breakdownTaxes, fmt(detailOrder.taxes)],
                [t.accounting.breakdownNet, fmt(detailOrder.netProfit)],
                [
                  t.accounting.breakdownMargin,
                  detailOrder.revenue > 0
                    ? `${detailOrder.profitMarginPct.toFixed(2)}%`
                    : "—",
                ],
              ].map(([k, v]) => (
                <div key={String(k)} className="flex justify-between gap-4">
                  <dt className="text-gray-600">{k}</dt>
                  <dd className="font-medium tabular-nums text-gray-900">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="border-t border-gray-100 px-4 py-3">
              <Button type="button" variant="outline" size="sm" onClick={() => setDetailOrder(null)}>
                {t.accounting.breakdownClose}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {expenseModalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl"
            onSubmit={submitExpense}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">
                {editingExpense ? t.accounting.expensesEdit : t.accounting.expensesAdd}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setExpenseModalOpen(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid gap-3">
              <label className="block text-xs text-gray-600">
                {t.accounting.expensesName}
                <Input
                  className="mt-1"
                  value={eName}
                  onChange={(ev) => setEName(ev.target.value)}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-xs text-gray-600">{t.accounting.expensesType}</div>
                  <MenuSelect
                    className="mt-1"
                    value={eType}
                    onChange={(v) => setEType(v as BusinessExpenseType)}
                    options={BUSINESS_EXPENSE_TYPES.map((v) => ({
                      value: v,
                      label: expenseTypeLabel(v),
                    }))}
                  />
                </div>
                <div>
                  <div className="text-xs text-gray-600">{t.accounting.expensesPeriod}</div>
                  <MenuSelect
                    className="mt-1"
                    value={ePeriod}
                    onChange={(v) => setEPeriod(v as BusinessExpensePeriod)}
                    options={BUSINESS_EXPENSE_PERIODS.map((v) => ({
                      value: v,
                      label: expensePeriodLabel(v),
                    }))}
                  />
                </div>
              </div>
              <label className="block text-xs text-gray-600">
                {t.accounting.expensesAmount}
                <Input
                  className="mt-1"
                  inputMode="numeric"
                  value={eAmount}
                  onChange={(ev) => setEAmount(ev.target.value)}
                  required
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-gray-600">
                  {t.accounting.expensesStart}
                  <Input
                    className="mt-1"
                    type="date"
                    value={eStart}
                    onChange={(ev) => setEStart(ev.target.value)}
                    required
                  />
                </label>
                <label className="block text-xs text-gray-600">
                  {t.accounting.expensesEnd}
                  <Input
                    className="mt-1"
                    type="date"
                    value={eEnd}
                    onChange={(ev) => setEEnd(ev.target.value)}
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input
                  type="checkbox"
                  checked={eActive}
                  onChange={(ev) => setEActive(ev.target.checked)}
                />
                {t.accounting.expensesActive}
              </label>
              <label className="block text-xs text-gray-600">
                {t.accounting.expensesNotes}
                <Input
                  className="mt-1"
                  value={eNotes}
                  onChange={(ev) => setENotes(ev.target.value)}
                />
              </label>
            </div>
            {expenseFormError ? (
              <p className="mt-2 text-xs text-red-700" role="alert">
                {expenseFormError === "amount" ? t.accounting.invalidAmount : expenseFormError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setExpenseModalOpen(false)}>
                {t.admin.cancel}
              </Button>
              <Button type="submit" disabled={expenseSaving}>
                {expenseSaving ? t.accounting.expensesSaving : t.accounting.expensesSave}
              </Button>
            </div>
          </form>
        </div>
      ) : null}

      {deleteExpenseId ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4"
          role="alertdialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
            <p className="text-sm text-gray-800">{t.accounting.expensesConfirmDelete}</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDeleteExpenseId(null)}>
                {t.admin.cancel}
              </Button>
              <Button type="button" variant="destructive" onClick={() => void confirmDeleteExpense()}>
                {t.accounting.expensesDelete}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
