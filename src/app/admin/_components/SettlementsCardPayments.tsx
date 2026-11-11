"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, CreditCard, Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { formatShortDate } from "@/lib/reconciliation/labels";
import type { SettlementLabels } from "@/lib/settlements/labels";
import type { CardMerchantGroup, CardPaymentsSummary, SettlementRow } from "@/lib/settlements/types";
import { cn } from "@/lib/utils";

const TH = "px-3 py-2 text-left";
const TD = "px-3 py-2";

type AliasBody = { idno: string | null } | { reset: true };

/** A merchant changed in this session: stays in place with its new state and «Отменить». */
interface ChangedMerchant {
  /** What restores the state before the first change. */
  prev: AliasBody;
  /** New state as picked (supplier name / «Не поставщик»). */
  label: string;
}

function prevOf(m: CardMerchantGroup): AliasBody {
  if (m.source === "ignored") return { idno: null };
  if (m.source === "alias" && m.idno) return { idno: m.idno };
  return { reset: true };
}

/** «Оплаты картой»: card purchases → suppliers (aliases by merchant key). */
export default function SettlementsCardPayments({
  data,
  parties,
  L,
  money,
  onSaved,
}: {
  data: CardPaymentsSummary;
  /** Known counterparties for the supplier picker. */
  parties: readonly SettlementRow[];
  L: SettlementLabels;
  money: (n: number) => string;
  onSaved: () => Promise<unknown>;
}) {
  const C = L.card;
  const [open, setOpen] = useState(data.unattributedCount > 0);
  // Phones: start collapsed (the block pushes the counterparty list far down); desktop unchanged.
  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) setOpen(false);
  }, []);
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState<ReadonlySet<string>>(() => new Set());
  const [changed, setChanged] = useState<Record<string, ChangedMerchant>>({});
  /**
   * Row order frozen at the first change: the list is sorted by the open sum,
   * so without it a changed row would vanish / move and the next click would
   * land on another merchant. Cleared on «Показать / Скрыть привязанные».
   */
  const [frozen, setFrozen] = useState<string[] | null>(null);

  const pending = data.merchants.filter(
    (m) => m.source !== "ignored" && m.attributedCount < m.count,
  );
  const done = data.merchants.filter((m) => !pending.includes(m));
  const base = showDone ? [...pending, ...done] : pending;
  let rows = base;
  if (frozen) {
    const byKey = new Map(data.merchants.map((m) => [m.merchantKey, m]));
    const inFrozen = new Set(frozen);
    rows = [
      ...frozen.flatMap((k) => byKey.get(k) ?? []),
      ...base.filter((m) => !inFrozen.has(m.merchantKey)),
    ];
  }

  // Rows changed in this session stay in place (frozen), so count only the ones really hidden.
  const shownKeys = new Set(rows.map((r) => r.merchantKey));
  const hiddenDone = done.filter((m) => !shownKeys.has(m.merchantKey)).length;

  /** `next` = label of the new state; omitted for «Отменить» (back to `prev`). */
  async function save(m: CardMerchantGroup, body: AliasBody, next?: string) {
    const key = m.merchantKey;
    if (saving.has(key)) return;
    setFrozen((f) => f ?? rows.map((r) => r.merchantKey));
    setSaving((cur) => new Set(cur).add(key));
    try {
      const res = await fetch("/api/admin/settlements/card-alias", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchantKey: key, name: m.merchantRaw, ...body }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setChanged((cur) => {
        const out = { ...cur };
        if (next === undefined) delete out[key];
        else out[key] = { prev: cur[key]?.prev ?? prevOf(m), label: next };
        return out;
      });
      setEditing((e) => (e === key ? null : e));
      await onSaved();
    } catch {
      toast.error(C.saveError);
    } finally {
      setSaving((cur) => {
        const out = new Set(cur);
        out.delete(key);
        return out;
      });
    }
  }

  function stateCell(m: CardMerchantGroup) {
    return editing === m.merchantKey ? (
      <SupplierPicker
        parties={parties}
        L={L}
        saving={saving.has(m.merchantKey)}
        onPick={(idno, name) => save(m, { idno }, name)}
        onCancel={() => setEditing(null)}
      />
    ) : changed[m.merchantKey] ? (
      <ChangedState
        label={changed[m.merchantKey]!.label}
        L={L}
        saving={saving.has(m.merchantKey)}
        onUndo={() => save(m, changed[m.merchantKey]!.prev)}
        onEdit={() => setEditing(m.merchantKey)}
      />
    ) : (
      <MerchantState
        m={m}
        L={L}
        saving={saving.has(m.merchantKey)}
        onEdit={() => setEditing(m.merchantKey)}
        onIgnore={() => save(m, { idno: null }, C.ignored)}
        onReset={() => save(m, { reset: true }, C.resetDone)}
      />
    );
  }

  if (data.merchants.length === 0) return null;

  return (
    <section className="mb-4 rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex min-h-10 w-full flex-col gap-2 px-4 py-3 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="flex items-center gap-2 font-medium text-gray-900">
          {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
          <CreditCard className="h-4 w-4 text-gray-500" />
          {C.title}
        </span>
        <span className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="text-emerald-700">
            {C.attributed}: <b className="tabular-nums">{C.countSum(data.attributedCount, money(data.attributedSum))}</b>
          </span>
          <span className={data.unattributedCount > 0 ? "text-orange-700" : "text-gray-500"}>
            {C.unattributed}: <b className="tabular-nums">{C.countSum(data.unattributedCount, money(data.unattributedSum))}</b>
          </span>
          {data.ignoredCount > 0 ? (
            <span className="text-gray-500">
              {C.ignored}: <b className="tabular-nums">{C.countSum(data.ignoredCount, money(data.ignoredSum))}</b>
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="border-t border-gray-100 px-4 pb-4 pt-3">
          <p className="mb-2 max-w-3xl text-xs text-gray-500">
            {C.hint}
            {data.byAmountCount > 0 ? ` ${C.byAmount(data.byAmountCount)}.` : ""}
          </p>

          {rows.length === 0 ? (
            <p className="py-3 text-sm text-gray-500">{C.allDone}</p>
          ) : (
            <>
            {/* Phone: cards */}
            <ul className="space-y-2 md:hidden">
              {rows.map((m) => (
                <li key={m.merchantKey} className="rounded-xl border border-gray-200 bg-white p-3">
                  <div className="min-w-0 break-words text-sm font-medium text-gray-900">{m.merchantRaw}</div>
                  <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-gray-500">
                    <span className="whitespace-nowrap">
                      {C.colCount}: <span className="tabular-nums">{m.count}</span> · {formatShortDate(m.lastDate)}
                    </span>
                    <span className="whitespace-nowrap text-sm font-semibold tabular-nums text-gray-900">{money(m.sum)}</span>
                  </div>
                  <div className="mt-2 text-xs">{stateCell(m)}</div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
              <table className="w-full text-xs">
                <thead className="border-b border-gray-100 bg-gray-50 text-gray-500">
                  <tr>
                    <th className={TH}>{C.colMerchant}</th>
                    <th className={cn(TH, "text-right")}>{C.colCount}</th>
                    <th className={cn(TH, "text-right")}>{C.colSum}</th>
                    <th className={TH}>{C.colLast}</th>
                    <th className={TH}>{C.colSupplier}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {rows.map((m) => (
                    <tr key={m.merchantKey} className="align-top">
                      <td className={cn(TD, "font-medium text-gray-900")}>{m.merchantRaw}</td>
                      <td className={cn(TD, "text-right tabular-nums")}>{m.count}</td>
                      <td className={cn(TD, "whitespace-nowrap text-right tabular-nums")}>{money(m.sum)}</td>
                      <td className={cn(TD, "whitespace-nowrap text-gray-500")}>{formatShortDate(m.lastDate)}</td>
                      <td className={cn(TD, "min-w-[16rem]")}>
                        {stateCell(m)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            </>
          )}

          {showDone || hiddenDone > 0 ? (
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-10 w-full md:h-9 md:w-auto"
                disabled={saving.size > 0}
                onClick={() => {
                  setShowDone(!showDone);
                  setChanged({});
                  setFrozen(null);
                }}
              >
                {showDone ? C.hideAttributed : C.showAttributed(hiddenDone)}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function ChangedState({
  label,
  L,
  saving,
  onUndo,
  onEdit,
}: {
  label: string;
  L: SettlementLabels;
  saving: boolean;
  onUndo: () => void;
  onEdit: () => void;
}) {
  const C = L.card;
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-medium text-emerald-700">→ {label}</span>
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : null}
      <span className="flex w-full flex-col gap-1.5 md:w-auto md:flex-row md:flex-wrap md:gap-1">
        <button
          type="button"
          disabled={saving}
          onClick={onUndo}
          className="min-h-10 w-full rounded-md px-2 py-0.5 text-xs md:min-h-0 md:w-auto font-medium text-gray-700 ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
        >
          {C.undo}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onEdit}
          className="min-h-10 w-full rounded-md px-2 py-0.5 text-xs md:min-h-0 md:w-auto text-sky-700 hover:bg-sky-50 disabled:opacity-50"
        >
          {C.change}
        </button>
      </span>
    </div>
  );
}

function MerchantState({
  m,
  L,
  saving,
  onEdit,
  onIgnore,
  onReset,
}: {
  m: CardMerchantGroup;
  L: SettlementLabels;
  saving: boolean;
  onEdit: () => void;
  onIgnore: () => void;
  onReset: () => void;
}) {
  const C = L.card;
  const manual = m.source === "alias" || m.source === "ignored";
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      {m.source === "ignored" ? (
        <span className="text-gray-500">{C.ignored}</span>
      ) : m.idno ? (
        <span>
          <span className="text-gray-900">{m.idnoName ?? m.idno}</span>{" "}
          <span className="text-gray-400">{m.idno}</span>
        </span>
      ) : m.attributedCount > 0 ? (
        <span className="text-gray-700">{C.partly(m.attributedCount, m.count)}</span>
      ) : null}
      {m.source ? <span className="text-[11px] text-gray-400">{C.sources[m.source]}</span> : null}
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
      ) : (
        <span className="flex w-full flex-col gap-1.5 md:w-auto md:flex-row md:flex-wrap md:gap-1">
          <button
            type="button"
            onClick={onEdit}
            className="min-h-10 w-full rounded-md px-2 py-0.5 text-xs md:min-h-0 md:w-auto font-medium text-sky-700 ring-1 ring-sky-200 hover:bg-sky-50"
          >
            {m.idno || m.attributedCount > 0 ? C.change : C.pick}
          </button>
          {m.source !== "ignored" ? (
            <button
              type="button"
              onClick={onIgnore}
              className="min-h-10 w-full rounded-md px-2 py-0.5 text-xs md:min-h-0 md:w-auto text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50"
            >
              {C.notSupplier}
            </button>
          ) : null}
          {manual ? (
            <button
              type="button"
              onClick={onReset}
              className="min-h-10 w-full rounded-md px-2 py-0.5 text-xs md:min-h-0 md:w-auto text-gray-500 hover:text-gray-800"
            >
              {C.reset}
            </button>
          ) : null}
        </span>
      )}
    </div>
  );
}

function SupplierPicker({
  parties,
  L,
  saving,
  onPick,
  onCancel,
}: {
  parties: readonly SettlementRow[];
  L: SettlementLabels;
  saving: boolean;
  onPick: (idno: string, name: string) => void;
  onCancel: () => void;
}) {
  const C = L.card;
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = parties.filter((p) => p.state !== "service");
    const hit = s
      ? list.filter((p) => p.name.toLowerCase().includes(s) || p.idno.includes(s))
      : list.filter((p) => p.category === "supplier" || p.purchaseInvoiceCount > 0);
    return hit.slice(0, 8);
  }, [parties, q]);
  const rawIdno = /^\d{7,20}$/.test(q.trim()) && !matches.some((m) => m.idno === q.trim()) ? q.trim() : null;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={C.search}
            className="h-10 pl-7 text-xs md:h-8"
          />
        </div>
        <Button variant="outline" size="sm" className="h-10 md:h-9" onClick={onCancel} disabled={saving}>
          {C.cancel}
        </Button>
        {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : null}
      </div>
      <ul className="max-h-56 overflow-y-auto rounded-md border border-gray-200 bg-white">
        {matches.map((p) => (
          <li key={p.idno}>
            <button
              type="button"
              disabled={saving}
              onClick={() => onPick(p.idno, p.name)}
              className="flex w-full items-center justify-between gap-2 px-2 py-2.5 text-left text-xs hover:bg-gray-50 md:py-1.5"
            >
              <span className="truncate text-gray-900">{p.name}</span>
              <span className="shrink-0 text-gray-400">{p.idno}</span>
            </button>
          </li>
        ))}
        {rawIdno ? (
          <li>
            <button
              type="button"
              disabled={saving}
              onClick={() => onPick(rawIdno, rawIdno)}
              className="w-full px-2 py-2.5 text-left text-xs text-sky-700 md:py-1.5 hover:bg-gray-50"
            >
              {C.bindIdno(rawIdno)}
            </button>
          </li>
        ) : null}
        {matches.length === 0 && !rawIdno ? (
          <li className="px-2 py-1.5 text-xs text-gray-500">{C.noMatches}</li>
        ) : null}
      </ul>
    </div>
  );
}
