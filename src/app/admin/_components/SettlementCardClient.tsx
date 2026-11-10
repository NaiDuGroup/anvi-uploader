"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { toast } from "sonner";
import { ArrowLeft, Download, Loader2, Pencil } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { fetcher } from "@/lib/swr/fetcher";
import { formatMoney, formatShortDate } from "@/lib/reconciliation/labels";
import { downloadPdf } from "@/lib/reconciliation/downloadActPdf";
import { dayKeyOf } from "@/lib/shop/report/period";
import { getSettlementLabels, type PeriodPreset, type SettlementLabels } from "@/lib/settlements/labels";
import type { OpeningBalanceDto, SettlementLedgerResponse } from "@/lib/settlements/types";
import { cn } from "@/lib/utils";
import { AdminConfirmDialog } from "./AdminConfirmDialog";
import SupplierMatchPanel from "./SupplierMatchPanel";
import SettlementsJournal from "./SettlementsJournal";
import { getSettlementExtraLabels } from "@/lib/settlements/checkLabels";
import { balanceClass, CategorySelect, ledgerNote, type CategoryTarget } from "./SettlementsPageClient";

const PRESETS: PeriodPreset[] = ["all", "this_year", "last_year", "custom"];

function presetRange(preset: PeriodPreset, today: string): { from: string; to: string } {
  const y = Number(today.slice(0, 4));
  if (preset === "this_year") return { from: `${y}-01-01`, to: today };
  if (preset === "last_year") return { from: `${y - 1}-01-01`, to: `${y - 1}-12-31` };
  return { from: "", to: "" };
}

const ymd = (day: string) => formatShortDate(`${day}T12:00:00Z`);

export default function SettlementCardClient({ idno }: { idno: string }) {
  const locale = useLanguageStore((s) => s.locale);
  const L = getSettlementLabels(locale);
  const C = L.cardPage;
  const X = getSettlementExtraLabels(locale);
  const [journalKey, setJournalKey] = useState(0);
  const money = (n: number) => formatMoney(n.toFixed(2), "MDL", locale);
  const today = useMemo(() => dayKeyOf(new Date()), []);

  const [preset, setPreset] = useState<PeriodPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const range = preset === "custom" ? { from: customFrom, to: customTo } : presetRange(preset, today);
  const qs = new URLSearchParams();
  if (range.from) qs.set("from", range.from);
  if (range.to) qs.set("to", range.to);
  const query = qs.toString();
  const base = `/api/admin/settlements/${encodeURIComponent(idno)}`;

  const { data, error, isLoading, mutate } = useSWR<SettlementLedgerResponse>(
    `${base}${query ? `?${query}` : ""}`,
    fetcher,
    { revalidateOnFocus: false, keepPreviousData: true },
  );

  const [savingCategory, setSavingCategory] = useState(false);
  async function saveCategory(row: CategoryTarget, value: string) {
    setSavingCategory(true);
    try {
      const res = await fetch("/api/admin/settlements/category", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idno: row.idno, category: value === "" ? null : value }),
      });
      if (!res.ok) throw new Error(String(res.status));
      await mutate();
      setJournalKey((k) => k + 1);
    } catch {
      toast.error(L.saveError);
    } finally {
      setSavingCategory(false);
    }
  }

  const [actLocale, setActLocale] = useState<"ru" | "ro">(locale === "ro" ? "ro" : "ru");
  const [downloading, setDownloading] = useState(false);
  async function downloadAct() {
    setDownloading(true);
    try {
      const p = new URLSearchParams(qs);
      p.set("locale", actLocale);
      const safe = (data?.name ?? idno).replace(/[^\p{L}\p{N}_-]+/gu, "_").slice(0, 40);
      await downloadPdf(`${base}/act?${p.toString()}`, `act-sverki-${safe}-${idno}.pdf`);
    } catch {
      toast.error(C.act.error);
    } finally {
      setDownloading(false);
    }
  }

  const hasPeriod = Boolean(range.from || range.to);
  const t = data?.totals;

  return (
    <div className="space-y-4">
      <Link
        href="/admin/bookkeeping/settlements"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        {C.back}
      </Link>

      {error && !data ? (
        <p className="rounded-lg border border-gray-200 bg-white px-3 py-6 text-center text-sm text-gray-500">
          {L.loadError}
        </p>
      ) : null}

      {isLoading && !data ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : null}

      {data ? (
        <>
          {/* Header */}
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 space-y-1.5">
              <h2 className="text-lg font-bold tracking-tight text-gray-900 sm:text-xl">{data.name}</h2>
              <div className="text-sm text-gray-500">IDNO {data.idno}</div>
              <div className="max-w-xs">
                <CategorySelect
                  row={{ idno: data.idno, category: data.category, categorySource: data.categorySource }}
                  L={L}
                  saving={savingCategory}
                  onChange={saveCategory}
                />
              </div>
            </div>
            <div className="sm:text-right">
              <div className="text-xs text-gray-500">{C.balanceToday}</div>
              <div className={cn("text-xl font-semibold tabular-nums sm:text-2xl", balanceClass(data.balance))}>
                {C.balanceText(data.balance, money)}
              </div>
            </div>
          </div>

          {!hasPeriod && data.entries.length === 0 && !data.openingBalance ? (
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-500">{C.notFound}</p>
          ) : null}

          <OpeningBalancePanel
            idno={idno}
            value={data.openingBalance}
            firstDocumentDate={data.firstDocumentDate}
            L={L}
            money={money}
            onSaved={() => {
              void mutate();
              setJournalKey((k) => k + 1);
            }}
          />

          {/* Period + act */}
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <div className="-mx-0.5 flex flex-wrap gap-1">
                {PRESETS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      if (p === "custom" && preset !== "custom") {
                        const r = presetRange(preset, today);
                        setCustomFrom(r.from);
                        setCustomTo(r.to);
                      }
                      setPreset(p);
                    }}
                    className={cn(
                      "mx-0.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                      preset === p
                        ? "bg-gray-900 text-white ring-gray-900"
                        : "bg-white text-gray-600 ring-gray-200 hover:text-gray-900",
                    )}
                  >
                    {C.presets[p]}
                  </button>
                ))}
              </div>
              {preset === "custom" ? (
                <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                  <label className="flex items-center gap-1">
                    {C.from}
                    <Input
                      type="date"
                      value={customFrom}
                      max={customTo || undefined}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="h-8 w-[9.5rem] text-xs"
                    />
                  </label>
                  <label className="flex items-center gap-1">
                    {C.to}
                    <Input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="h-8 w-[9.5rem] text-xs"
                    />
                  </label>
                </div>
              ) : null}
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-gray-400" /> : null}
            </div>
            <div className="flex items-center gap-2">
              <select
                value={actLocale}
                onChange={(e) => setActLocale(e.target.value === "ro" ? "ro" : "ru")}
                className="h-9 rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-800 focus:border-gray-400 focus:outline-none"
                aria-label={C.act.lang}
                title={C.act.lang}
              >
                <option value="ru">RU</option>
                <option value="ro">RO</option>
              </select>
              <Button size="sm" onClick={downloadAct} disabled={downloading} className="gap-1.5">
                {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {C.act.download}
              </Button>
            </div>
          </div>

          {/* Totals */}
          {t ? (
            <div>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                <Tile label={C.totSalesInvoiced} value={money(t.salesInvoiced)} />
                <Tile label={C.totReceived} value={money(t.received)} />
                <Tile label={C.totPurchasesInvoiced} value={money(t.purchasesInvoiced)} />
                <Tile
                  label={C.totPaid}
                  value={money(t.paid)}
                  sub={[
                    t.paidByCard ? L.paidByCard(money(t.paidByCard)) : null,
                    t.paidByReceipt ? L.paidByReceipt(money(t.paidByReceipt)) : null,
                  ]}
                />
              </div>
              <p className="mt-1.5 text-xs text-gray-400">{C.totalsHint}</p>
            </div>
          ) : null}

          <LedgerTable data={data} L={L} money={money} hasPeriod={hasPeriod} range={range} />

          <SupplierMatchPanel idno={idno} X={X} money={money} onChanged={() => setJournalKey((k) => k + 1)} />

          <SettlementsJournal X={X} money={money} idno={idno} refreshKey={journalKey} />
        </>
      ) : null}
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: Array<string | null> }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-0.5 text-base font-semibold tabular-nums text-gray-900 sm:text-lg">{value}</div>
      {sub?.filter(Boolean).map((s) => (
        <div key={s} className="text-[11px] text-gray-400">
          {s}
        </div>
      ))}
    </div>
  );
}

function LedgerTable({
  data,
  L,
  money,
  hasPeriod,
  range,
}: {
  data: SettlementLedgerResponse;
  L: SettlementLabels;
  money: (n: number) => string;
  hasPeriod: boolean;
  range: { from: string; to: string };
}) {
  const C = L.cardPage;
  const cell = (n: number) => (n === 0 ? "" : money(n));
  const showOpening = hasPeriod || data.opening !== 0;
  const openingLabel = hasPeriod
    ? C.openingRow
    : `${L.ledgerKinds.opening_balance}${data.openingBalance?.note ? ` · ${data.openingBalance.note}` : ""}`;
  const openingDate = range.from
    ? ymd(range.from)
    : data.openingBalance
      ? ymd(data.openingBalance.asOfDate)
      : "";
  const closingDate = range.to ? ymd(range.to) : "";

  return (
    <div>
      {/* Phone */}
      <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white shadow-sm md:hidden">
        {showOpening ? (
          <li className="flex justify-between gap-2 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
            <span>
              {openingLabel} {openingDate}
            </span>
            <span className="tabular-nums">{money(data.opening)}</span>
          </li>
        ) : null}
        {data.entries.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-gray-500">{C.noMovements}</li>
        ) : (
          data.entries.map((e, i) => {
            const note = ledgerNote(e, L);
            return (
              <li key={i} className="px-3 py-2 text-xs">
                <div className="flex justify-between gap-2">
                  <span className="text-gray-500">
                    {formatShortDate(e.date)} · {L.ledgerKinds[e.kind]}
                  </span>
                  <span className={cn("tabular-nums", balanceClass(e.amount))}>
                    {e.amount > 0 ? `+${money(e.amount)}` : money(e.amount)}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="truncate text-gray-800">{e.document}</span>
                  <span className="shrink-0 tabular-nums text-gray-500">{money(e.balance)}</span>
                </div>
                {note ? <div className="truncate text-gray-400">{note}</div> : null}
              </li>
            );
          })
        )}
        {hasPeriod ? (
          <li className="flex justify-between gap-2 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-700">
            <span>
              {C.closingRow} {closingDate}
            </span>
            <span className="tabular-nums">{money(data.closing)}</span>
          </li>
        ) : null}
      </ul>

      {/* Tablet / desktop */}
      <div className="hidden overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold text-gray-500">
            <tr>
              <th className="px-3 py-2.5 text-left">{L.colDate}</th>
              <th className="px-3 py-2.5 text-left">{L.colDocument}</th>
              <th className="px-3 py-2.5 text-left">{C.colKind}</th>
              <th className="px-3 py-2.5 text-left">{C.colDescription}</th>
              <th className="px-3 py-2.5 text-right" title={C.debitHint}>
                {C.colDebit}
                <span className="block text-[10px] font-normal text-gray-400">{C.debitHint}</span>
              </th>
              <th className="px-3 py-2.5 text-right" title={C.creditHint}>
                {C.colCredit}
                <span className="block text-[10px] font-normal text-gray-400">{C.creditHint}</span>
              </th>
              <th className="px-3 py-2.5 text-right">{L.colRunning}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {showOpening ? (
              <tr className="bg-gray-50/70 font-medium text-gray-800">
                <td className="whitespace-nowrap px-3 py-2 text-gray-500">{openingDate}</td>
                <td className="px-3 py-2" colSpan={3}>
                  {openingLabel}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {data.opening > 0 ? money(data.opening) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {data.opening < 0 ? money(-data.opening) : ""}
                </td>
                <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", balanceClass(data.opening))}>
                  {money(data.opening)}
                </td>
              </tr>
            ) : null}
            {data.entries.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-sm text-gray-500">
                  {C.noMovements}
                </td>
              </tr>
            ) : (
              data.entries.map((e, i) => {
                const note = ledgerNote(e, L);
                return (
                  <tr key={i} className="hover:bg-gray-50/60">
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">{formatShortDate(e.date)}</td>
                    <td className="max-w-[14rem] truncate whitespace-nowrap px-3 py-1.5 font-medium text-gray-900" title={e.document}>
                      {e.document}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-gray-500">{L.ledgerKinds[e.kind]}</td>
                    <td className="max-w-[24rem] truncate px-3 py-1.5 text-xs text-gray-500" title={note ?? undefined}>
                      {note}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-amber-700">
                      {cell(e.amount > 0 ? e.amount : 0)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-rose-700">
                      {cell(e.amount < 0 ? -e.amount : 0)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-gray-700">
                      {money(e.balance)}
                    </td>
                  </tr>
                );
              })
            )}
            <tr className="border-t border-gray-200 text-xs font-medium text-gray-600">
              <td className="px-3 py-2" colSpan={4}>
                {C.turnoverRow}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(data.totals.debit)}</td>
              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{money(data.totals.credit)}</td>
              <td />
            </tr>
            {hasPeriod ? (
              <tr className="bg-gray-50/70 font-medium text-gray-800">
                <td className="whitespace-nowrap px-3 py-2 text-gray-500">{closingDate}</td>
                <td className="px-3 py-2" colSpan={3}>
                  {C.closingRow}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {data.closing > 0 ? money(data.closing) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {data.closing < 0 ? money(-data.closing) : ""}
                </td>
                <td className={cn("whitespace-nowrap px-3 py-2 text-right tabular-nums", balanceClass(data.closing))}>
                  {money(data.closing)}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OpeningBalancePanel({
  idno,
  value,
  firstDocumentDate,
  L,
  money,
  onSaved,
}: {
  idno: string;
  value: OpeningBalanceDto | null;
  firstDocumentDate: string | null;
  L: SettlementLabels;
  money: (n: number) => string;
  onSaved: () => void;
}) {
  const O = L.cardPage.ob;
  const [editing, setEditing] = useState(false);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState("");
  const [side, setSide] = useState<"they" | "we">("they");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const url = `/api/admin/settlements/${encodeURIComponent(idno)}/opening-balance`;

  function startEdit() {
    setDate(value?.asOfDate ?? "2022-12-31");
    setAmount(value ? String(Math.abs(value.amount)) : "");
    setSide(value && value.amount < 0 ? "we" : "they");
    setNote(value?.note ?? "");
    setEditing(true);
  }

  async function save() {
    const n = Number(amount.replace(/\s/g, "").replace(",", "."));
    if (!date || !Number.isFinite(n) || n <= 0) {
      toast.error(O.invalid);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ asOfDate: date, amount: side === "we" ? -n : n, note }),
      });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(O.saved);
      setEditing(false);
      onSaved();
    } catch {
      toast.error(O.error);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      toast.success(O.removed);
      setConfirmOpen(false);
      setEditing(false);
      onSaved();
    } catch {
      toast.error(O.error);
    } finally {
      setBusy(false);
    }
  }

  const firstDay = firstDocumentDate ? dayKeyOf(new Date(firstDocumentDate)) : null;
  const warnDate = editing ? date : value?.asOfDate;
  const warn = firstDay && warnDate && warnDate >= firstDay;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{O.title}</div>
          {!editing ? (
            <div className="mt-0.5 text-sm">
              {value ? (
                <span className={cn("font-semibold tabular-nums", balanceClass(value.amount))}>
                  {L.cardPage.balanceText(value.amount, money)}{" "}
                  <span className="font-normal text-gray-500">{O.asOf(ymd(value.asOfDate))}</span>
                  {value.note ? <span className="font-normal text-gray-500"> · {value.note}</span> : null}
                </span>
              ) : (
                <span className="text-gray-400">{O.none}</span>
              )}
            </div>
          ) : null}
          <p className="mt-0.5 max-w-2xl text-xs text-gray-400">{O.hint}</p>
        </div>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={startEdit} className="gap-1.5">
            <Pencil className="h-3.5 w-3.5" />
            {value ? O.edit : O.add}
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_1fr_auto] lg:items-end">
          <label className="text-xs text-gray-600">
            {O.date}
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-9" />
          </label>
          <label className="text-xs text-gray-600">
            {O.side}
            <select
              value={side}
              onChange={(e) => setSide(e.target.value === "we" ? "we" : "they")}
              className="mt-1 block h-9 w-full rounded-md border border-gray-200 bg-white px-2 text-sm text-gray-800 focus:border-gray-400 focus:outline-none"
            >
              <option value="they">{O.theyOwe}</option>
              <option value="we">{O.weOwe}</option>
            </select>
          </label>
          <label className="text-xs text-gray-600">
            {O.amount}
            <Input
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 h-9 tabular-nums"
              placeholder="0.00"
            />
          </label>
          <label className="text-xs text-gray-600">
            {O.note}
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="mt-1 h-9" />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {O.save}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={busy}>
              {O.cancel}
            </Button>
            {value ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmOpen(true)}
                disabled={busy}
                className="text-rose-700"
              >
                {O.remove}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {warn ? (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          {O.afterFirstDoc(ymd(firstDay))}
        </p>
      ) : null}

      <AdminConfirmDialog
        open={confirmOpen}
        title={O.removeConfirm}
        description={value ? `${L.cardPage.balanceText(value.amount, money)} ${O.asOf(ymd(value.asOfDate))}` : ""}
        confirmLabel={O.remove}
        cancelLabel={O.cancel}
        busy={busy}
        onConfirm={remove}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
