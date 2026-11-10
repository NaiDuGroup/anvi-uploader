"use client";

import { Fragment, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle, ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { useDebounce } from "@/hooks/useDebounce";
import { fetcher } from "@/lib/swr/fetcher";
import { formatMoney, formatShortDate } from "@/lib/reconciliation/labels";
import {
  getSettlementLabels,
  SETTLEMENT_FILTERS,
  type SettlementFilter,
  type SettlementLabels,
} from "@/lib/settlements/labels";
import {
  COUNTERPARTY_CATEGORIES,
  type CounterpartyCategoryCode,
  type SettlementLedgerResponse,
  type SettlementRow,
  type SettlementsResponse,
  type SettlementState,
} from "@/lib/settlements/types";
import { cn } from "@/lib/utils";

const PAGE = 100;
const TH = "px-3 py-3 text-left";
const TD = "px-3 py-2.5";

const STATE_PILL: Record<SettlementState, string> = {
  they_owe: "bg-amber-50 text-amber-800 ring-amber-200",
  we_owe: "bg-rose-50 text-rose-800 ring-rose-200",
  we_overpaid: "bg-violet-50 text-violet-800 ring-violet-200",
  they_overpaid: "bg-sky-50 text-sky-800 ring-sky-200",
  settled: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  unclassified: "bg-gray-100 text-gray-700 ring-gray-200",
  service: "bg-gray-50 text-gray-500 ring-gray-200",
};

function matchesFilter(row: SettlementRow, filter: SettlementFilter): boolean {
  switch (filter) {
    case "all":
      return row.state !== "service";
    case "check":
      return row.flags.length > 0;
    default:
      return row.state === filter;
  }
}

function balanceClass(n: number): string {
  if (n > 0) return "text-amber-700";
  if (n < 0) return "text-rose-700";
  return "text-gray-400";
}

export default function SettlementsPageClient() {
  const locale = useLanguageStore((s) => s.locale);
  const L = getSettlementLabels(locale);
  const money = (n: number) => formatMoney(n.toFixed(2), "MDL", locale);

  const [filter, setFilter] = useState<SettlementFilter>("all");
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 200);
  const [limit, setLimit] = useState(PAGE);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [savingIdno, setSavingIdno] = useState<string | null>(null);

  const { data, error, isLoading, mutate } = useSWR<SettlementsResponse>(
    "/api/admin/settlements",
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const filtered = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    return (data?.rows ?? []).filter(
      (r) =>
        matchesFilter(r, filter) &&
        (!q || r.name.toLowerCase().includes(q) || r.idno.includes(q)),
    );
  }, [data, filter, debounced]);

  const counts = useMemo(() => {
    const out = {} as Record<SettlementFilter, number>;
    for (const f of SETTLEMENT_FILTERS) {
      out[f] = (data?.rows ?? []).filter((r) => matchesFilter(r, f)).length;
    }
    return out;
  }, [data]);

  const visible = filtered.slice(0, limit);

  async function saveCategory(row: SettlementRow, value: string) {
    const category: CounterpartyCategoryCode | null = value === "" ? null : (value as CounterpartyCategoryCode);
    setSavingIdno(row.idno);
    try {
      const res = await fetch("/api/admin/settlements/category", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idno: row.idno, category }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await mutate();
    } catch {
      toast.error(L.saveError);
    } finally {
      setSavingIdno(null);
    }
  }

  const summary = data?.summary;
  const cards: Array<{ label: string; value: string; tone: string; onClick: () => void }> = summary
    ? [
        { label: L.sumTheyOwe, value: money(summary.theyOwe), tone: "text-amber-700", onClick: () => setFilter("they_owe") },
        { label: L.sumWeOwe, value: money(summary.weOwe), tone: "text-rose-700", onClick: () => setFilter("we_owe") },
        { label: L.sumWeOverpaid, value: money(summary.weOverpaid), tone: "text-violet-700", onClick: () => setFilter("we_overpaid") },
        { label: L.sumTheyOverpaid, value: money(summary.theyOverpaid), tone: "text-sky-700", onClick: () => setFilter("they_overpaid") },
        { label: L.sumCheck, value: String(summary.checkCount), tone: "text-orange-700", onClick: () => setFilter("check") },
        { label: L.sumUnclassified, value: String(summary.unclassifiedCount), tone: "text-gray-700", onClick: () => setFilter("unclassified") },
      ]
    : [];

  return (
    <div>
      <p className="mb-4 max-w-3xl text-sm text-gray-500">{L.hint}</p>

      {error ? (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{L.loadError}</p>
      ) : null}

      {isLoading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : null}

      {summary ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {cards.map((c) => (
              <button
                key={c.label}
                type="button"
                onClick={() => {
                  c.onClick();
                  setLimit(PAGE);
                }}
                className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm transition hover:border-gray-300"
              >
                <div className="text-xs text-gray-500">{c.label}</div>
                <div className={cn("mt-0.5 text-base font-semibold tabular-nums sm:text-lg", c.tone)}>{c.value}</div>
              </button>
            ))}
          </div>

          {summary.purchasesWithoutTotals > 0 ? (
            <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{L.purchasesWithoutTotals(summary.purchasesWithoutTotals)}</span>
            </div>
          ) : null}

          <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="-mx-1 flex flex-wrap gap-1">
              {SETTLEMENT_FILTERS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFilter(f);
                    setLimit(PAGE);
                  }}
                  className={cn(
                    "mx-0.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                    filter === f
                      ? "bg-gray-900 text-white ring-gray-900"
                      : "bg-white text-gray-600 ring-gray-200 hover:text-gray-900",
                  )}
                >
                  {L.filters[f]} <span className="opacity-60">{counts[f]}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder={L.search}
                className="pl-8"
              />
            </div>
          </div>

          <p className="mb-2 text-xs text-gray-500">{L.rowsCount(filtered.length)}</p>

          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">{L.empty}</p>
          ) : (
            <>
              {/* Phone: cards */}
              <div className="space-y-2 md:hidden">
                {visible.map((row) => (
                  <div key={row.idno} className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-2 text-left"
                      onClick={() => setExpanded(expanded === row.idno ? null : row.idno)}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-gray-900">{row.name}</div>
                        <div className="text-xs text-gray-500">{row.idno}</div>
                      </div>
                      <div className={cn("shrink-0 text-right font-semibold tabular-nums", balanceClass(row.balance))}>
                        {money(row.balance)}
                      </div>
                    </button>
                    <div className="mt-2 flex flex-wrap items-center gap-1">
                      <StatePill row={row} L={L} />
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <dt className="text-gray-500">{L.colSalesInvoiced}</dt>
                      <dd className="text-right tabular-nums">{money(row.salesInvoiced)}</dd>
                      <dt className="text-gray-500">{L.colReceived}</dt>
                      <dd className="text-right tabular-nums">{money(row.receivedFromThem)}</dd>
                      <dt className="text-gray-500">{L.colPurchasesInvoiced}</dt>
                      <dd className="text-right tabular-nums">{money(row.purchasesInvoiced)}</dd>
                      <dt className="text-gray-500">{L.colPaid}</dt>
                      <dd className="text-right tabular-nums">{money(row.paidToThem)}</dd>
                    </dl>
                    <div className="mt-2">
                      <CategorySelect row={row} L={L} saving={savingIdno === row.idno} onChange={saveCategory} />
                    </div>
                    {expanded === row.idno ? (
                      <div className="mt-3 border-t border-gray-100 pt-3">
                        <RowDetails row={row} L={L} money={money} />
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>

              {/* Tablet / desktop: table */}
              <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <tr>
                      <th className={TH}>{L.colParty}</th>
                      <th className={cn(TH, "text-right")}>{L.colSalesInvoiced}</th>
                      <th className={cn(TH, "text-right")}>{L.colReceived}</th>
                      <th className={cn(TH, "text-right")}>{L.colPurchasesInvoiced}</th>
                      <th className={cn(TH, "text-right")}>{L.colPaid}</th>
                      <th className={cn(TH, "text-right")}>{L.colBalance}</th>
                      <th className={TH}>{L.colState}</th>
                      <th className={TH}>{L.colCategory}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {visible.map((row) => {
                      const open = expanded === row.idno;
                      return (
                        <Fragment key={row.idno}>
                          <tr className={cn("hover:bg-gray-50/60", open && "bg-gray-50/60")}>
                            <td className={TD}>
                              <button
                                type="button"
                                className="flex items-start gap-1.5 text-left"
                                onClick={() => setExpanded(open ? null : row.idno)}
                              >
                                {open ? (
                                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                ) : (
                                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                                )}
                                <span>
                                  <span className="block font-medium text-gray-900">{row.name}</span>
                                  <span className="block text-xs text-gray-500">{row.idno}</span>
                                </span>
                              </button>
                            </td>
                            <td className={cn(TD, "text-right tabular-nums")}>{money(row.salesInvoiced)}</td>
                            <td className={cn(TD, "text-right tabular-nums")}>{money(row.receivedFromThem)}</td>
                            <td className={cn(TD, "text-right tabular-nums")}>{money(row.purchasesInvoiced)}</td>
                            <td className={cn(TD, "text-right tabular-nums")}>{money(row.paidToThem)}</td>
                            <td className={cn(TD, "text-right font-semibold tabular-nums", balanceClass(row.balance))}>
                              {money(row.balance)}
                            </td>
                            <td className={TD}>
                              <StatePill row={row} L={L} />
                            </td>
                            <td className={TD}>
                              <CategorySelect row={row} L={L} saving={savingIdno === row.idno} onChange={saveCategory} />
                            </td>
                          </tr>
                          {open ? (
                            <tr>
                              <td colSpan={8} className="bg-gray-50/60 px-4 pb-4 pt-1">
                                <RowDetails row={row} L={L} money={money} />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {filtered.length > limit ? (
                <div className="mt-3 flex justify-center">
                  <Button variant="outline" size="sm" onClick={() => setLimit(limit + PAGE)}>
                    {L.showMore(Math.min(PAGE, filtered.length - limit))}
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function StatePill({ row, L }: { row: SettlementRow; L: SettlementLabels }) {
  return (
    <span className="inline-flex flex-wrap gap-1">
      <span
        className={cn(
          "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1",
          STATE_PILL[row.state],
        )}
      >
        {L.states[row.state]}
      </span>
      {row.flags.length > 0 ? (
        <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-orange-50 px-2 py-0.5 text-xs font-medium text-orange-800 ring-1 ring-orange-200">
          <AlertTriangle className="h-3 w-3" />
          {L.checkPill}
        </span>
      ) : null}
    </span>
  );
}

function CategorySelect({
  row,
  L,
  saving,
  onChange,
}: {
  row: SettlementRow;
  L: SettlementLabels;
  saving: boolean;
  onChange: (row: SettlementRow, value: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={row.category ?? ""}
        disabled={saving}
        onChange={(e) => onChange(row, e.target.value)}
        className="h-8 w-full min-w-[9rem] rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 focus:border-gray-400 focus:outline-none md:w-auto"
        aria-label={L.colCategory}
      >
        <option value="">{L.noCategory}</option>
        {COUNTERPARTY_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {L.categories[c]}
          </option>
        ))}
      </select>
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-gray-400" />
      ) : row.categorySource && row.categorySource !== "manual" ? (
        <span className="shrink-0 whitespace-nowrap text-[11px] text-gray-400">{L.categorySource[row.categorySource]}</span>
      ) : null}
    </div>
  );
}

function RowDetails({
  row,
  L,
  money,
}: {
  row: SettlementRow;
  L: SettlementLabels;
  money: (n: number) => string;
}) {
  const { data, error, isLoading } = useSWR<SettlementLedgerResponse>(
    `/api/admin/settlements/${encodeURIComponent(row.idno)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <div className="space-y-3">
      {row.flags.length > 0 ? (
        <ul className="space-y-1">
          {row.flags.map((f, i) => (
            <li
              key={`${f.kind}-${i}`}
              className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{L.flagText(f, money, formatShortDate)}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="text-xs font-semibold uppercase tracking-wider text-gray-500">{L.ledgerTitle}</div>
      {isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      ) : error || !data || data.entries.length === 0 ? (
        <p className="text-sm text-gray-500">{L.ledgerEmpty}</p>
      ) : (
        <>
          {/* Phone: compact list */}
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white md:hidden">
            {data.entries.map((e, i) => (
              <li key={i} className="px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">
                    {formatShortDate(e.date)} · {L.ledgerKinds[e.kind]}
                  </span>
                  <span className={cn("tabular-nums", balanceClass(e.amount))}>{money(e.amount)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate text-gray-800">{e.document}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">{money(e.balance)}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white md:block">
            <table className="w-full text-xs">
              <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left">{L.colDate}</th>
                  <th className="px-3 py-2 text-left">{L.colDocument}</th>
                  <th className="px-3 py-2 text-left" />
                  <th className="px-3 py-2 text-right">{L.colAmount}</th>
                  <th className="px-3 py-2 text-right">{L.colRunning}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.entries.map((e, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">{formatShortDate(e.date)}</td>
                    <td className="whitespace-nowrap px-3 py-1.5">
                      <span className="text-gray-500">{L.ledgerKinds[e.kind]}</span>{" "}
                      <span className="font-medium text-gray-900">{e.document}</span>
                    </td>
                    <td className="max-w-[28rem] truncate px-3 py-1.5 text-gray-500" title={e.description ?? undefined}>
                      {e.payerName ? `${L.payerVia}: ${e.payerName}` : e.description}
                    </td>
                    <td className={cn("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", balanceClass(e.amount))}>
                      {money(e.amount)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-700">
                      {money(e.balance)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
