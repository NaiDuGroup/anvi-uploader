"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  CreditCard,
  Wand2,
  FileText,
  CheckCircle2,
  XCircle,
  Undo2,
  ChevronLeft,
  ChevronRight,
  Download,
  X,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  useBankStatements,
  useReconciliationQueue,
  useDebtorReport,
  useReconClients,
  useClientStatement,
  useBankStatementTransactions,
  type QueueRow,
} from "@/lib/swr";
import type {
  BalanceRow,
  ClientStatement,
  StatementEntry,
} from "@/lib/reconciliation/report";
import {
  getReconLabels,
  formatMoney,
  formatShortDate,
} from "@/lib/reconciliation/labels";
import { downloadActPdf } from "@/lib/reconciliation/downloadActPdf";
import { cn } from "@/lib/utils";
import FiscalInvoiceDetailDrawer from "./FiscalInvoiceDetailDrawer";

type ActKindFilter = "all" | "invoices" | "payments";

type Loc = ReturnType<typeof useLanguageStore.getState>["locale"];
type Labels = ReturnType<typeof getReconLabels>;

type Tab = "queue" | "debtors" | "act" | "statements";

const PAGE_SIZES = [25, 50, 100];

export default function ReconciliationPageClient() {
  const locale = useLanguageStore((s) => s.locale);
  const L = getReconLabels(locale);
  const [tab, setTab] = useState<Tab>("queue");
  const [uploading, setUploading] = useState(false);
  const [autoMatching, setAutoMatching] = useState(false);
  const [busyTxId, setBusyTxId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cardFileRef = useRef<HTMLInputElement>(null);
  const extrasFileRef = useRef<HTMLInputElement>(null);

  const [queuePage, setQueuePage] = useState(1);
  const [queuePageSize, setQueuePageSize] = useState(50);

  const { mutate: mutateStatements } = useBankStatements();
  const {
    rows,
    total: queueTotal,
    totalPages: queueTotalPages,
    isLoading: queueLoading,
    mutate: mutateQueue,
  } = useReconciliationQueue(undefined, queuePage, queuePageSize);
  const { mutate: mutateDebtors } = useDebtorReport();

  const refreshAll = () => {
    void mutateStatements();
    void mutateQueue();
    void mutateDebtors();
  };

  async function handleUpload(
    file: File,
    format: "maib_csv" | "maib_card_csv" | "maib_extras_txt" = "maib_csv",
  ) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("format", format);
      const res = await fetch("/api/admin/bank-statements", {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? L.uploadFail);
      toast.success(L.uploadOk(data.insertedCount ?? data.parsedCount ?? 0));
      refreshAll();
      // Run auto-match right after a successful upload so only the uncertain
      // transactions remain in the queue for manual review.
      await handleAutoMatch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.uploadFail);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
      if (cardFileRef.current) cardFileRef.current.value = "";
      if (extrasFileRef.current) extrasFileRef.current.value = "";
    }
  }

  async function handleAutoMatch() {
    setAutoMatching(true);
    try {
      const res = await fetch("/api/admin/reconciliation/auto-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoApply: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? L.actionFail);
      if (data.pull?.fetched > 0) {
        toast.success(L.pulledFiscal(data.pull.fetched));
      }
      toast.success(L.autoMatchOk(data.result.applied, data.result.scanned));
      setQueuePage(1);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setAutoMatching(false);
    }
  }

  async function confirmSuggestion(row: QueueRow) {
    const best = row.suggestions[0];
    if (!best) return;
    setBusyTxId(row.transaction.id);
    try {
      const res = await fetch(
        `/api/admin/bank-transactions/${row.transaction.id}/match`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allocations: [
              { fiscalInvoiceId: best.fiscalInvoiceId, amount: Number(best.amount) },
            ],
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? L.actionFail);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setBusyTxId(null);
    }
  }

  async function setIgnore(txId: string, ignore: boolean) {
    setBusyTxId(txId);
    try {
      const res = await fetch(`/api/admin/bank-transactions/${txId}/ignore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ignore }),
      });
      if (!res.ok) throw new Error(L.actionFail);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setBusyTxId(null);
    }
  }

  async function unmatch(txId: string) {
    setBusyTxId(txId);
    try {
      const res = await fetch(`/api/admin/bank-transactions/${txId}/match`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(L.actionFail);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setBusyTxId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5 sm:px-5 sm:py-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-gray-500">{L.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f, "maib_csv");
            }}
          />
          <input
            ref={cardFileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f, "maib_card_csv");
            }}
          />
          <input
            ref={extrasFileRef}
            type="file"
            accept=".txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleUpload(f, "maib_extras_txt");
            }}
          />
          <Button
            variant="outline"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || autoMatching}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {uploading ? L.uploading : L.upload}
          </Button>
          <Button
            variant="outline"
            onClick={() => cardFileRef.current?.click()}
            disabled={uploading || autoMatching}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="mr-2 h-4 w-4" />
            )}
            {L.uploadCard}
          </Button>
          <Button
            variant="outline"
            onClick={() => extrasFileRef.current?.click()}
            disabled={uploading || autoMatching}
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            {L.uploadExtras}
          </Button>
          <Button onClick={handleAutoMatch} disabled={autoMatching || uploading}>
            {autoMatching ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-2 h-4 w-4" />
            )}
            {autoMatching ? L.autoMatchRunning : L.autoMatch}
          </Button>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-gray-200">
        <TabButton active={tab === "queue"} onClick={() => setTab("queue")}>
          {L.tabQueue}
        </TabButton>
        <TabButton active={tab === "debtors"} onClick={() => setTab("debtors")}>
          {L.tabDebtors}
        </TabButton>
        <TabButton active={tab === "act"} onClick={() => setTab("act")}>
          {L.tabAct}
        </TabButton>
        <TabButton
          active={tab === "statements"}
          onClick={() => setTab("statements")}
        >
          {L.tabStatements}
        </TabButton>
      </div>

      {tab === "queue" ? (
        <>
          <QueueTable
            rows={rows}
            loading={queueLoading}
            L={L}
            locale={locale}
            busyTxId={busyTxId}
            onConfirm={confirmSuggestion}
            onIgnore={(id) => setIgnore(id, true)}
            onUnmatch={unmatch}
          />
          {rows && rows.length > 0 ? (
            <Pagination
              L={L}
              page={queuePage}
              totalPages={queueTotalPages}
              total={queueTotal}
              pageSize={queuePageSize}
              onPage={setQueuePage}
              onPageSize={(n) => {
                setQueuePageSize(n);
                setQueuePage(1);
              }}
            />
          ) : null}
        </>
      ) : null}

      {tab === "debtors" ? <DebtorsDashboard L={L} locale={locale} /> : null}

      {tab === "act" ? <ActView L={L} locale={locale} /> : null}

      {tab === "statements" ? <StatementsView L={L} locale={locale} /> : null}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        active
          ? "border-gold text-gray-900"
          : "border-transparent text-gray-500 hover:text-gray-900",
      )}
    >
      {children}
    </button>
  );
}

function ConfidenceBadge({ value, label }: { value: number; label: string }) {
  const tone =
    value >= 82
      ? "border-green-200 bg-green-50 text-green-700"
      : value >= 60
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-gray-200 bg-gray-100 text-gray-600";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        tone,
      )}
    >
      {value}% {label}
    </span>
  );
}

const TH = "px-4 py-3 text-left";
const TD = "px-4 py-3";

function QueueTable({
  rows,
  loading,
  L,
  locale,
  busyTxId,
  onConfirm,
  onIgnore,
  onUnmatch,
}: {
  rows: QueueRow[] | null;
  loading: boolean;
  L: ReturnType<typeof getReconLabels>;
  locale: ReturnType<typeof useLanguageStore.getState>["locale"];
  busyTxId: string | null;
  onConfirm: (row: QueueRow) => void;
  onIgnore: (txId: string) => void;
  onUnmatch: (txId: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }
  if (!rows || rows.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">{L.queueEmpty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <tr>
            <th className={TH}>{L.colDate}</th>
            <th className={TH}>{L.colPayer}</th>
            <th className={cn(TH, "hidden lg:table-cell")}>{L.colPurpose}</th>
            <th className={cn(TH, "text-right")}>{L.colAmount}</th>
            <th className={TH}>{L.colSuggestion}</th>
            <th className={cn(TH, "text-right")}>{L.colActions}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(({ transaction: tx, suggestions }) => {
            const best = suggestions[0];
            const busy = busyTxId === tx.id;
            const hasAllocations = tx.allocations.length > 0;
            const isMatched = tx.matchStatus === "MATCHED";
            const isOverpaid =
              hasAllocations && Number(tx.unallocatedAmount) > 0.005;
            const isResolved = isMatched || hasAllocations;
            return (
              <tr key={tx.id} className="align-top hover:bg-gray-50/60">
                <td className={cn(TD, "whitespace-nowrap")}>
                  {formatShortDate(tx.bookingDate)}
                </td>
                <td className={TD}>
                  <div className="font-medium text-gray-900">
                    {tx.counterpartyName ?? "—"}
                  </div>
                  <div className="text-xs text-gray-500">
                    {tx.counterpartyIdno ?? ""}
                  </div>
                </td>
                <td className={cn(TD, "hidden max-w-xs text-xs text-gray-500 lg:table-cell")}>
                  {tx.purpose ?? "—"}
                </td>
                <td className={cn(TD, "whitespace-nowrap text-right font-medium")}>
                  {formatMoney(tx.amount, tx.currency, locale)}
                </td>
                <td className={TD}>
                  {isResolved ? (
                    <div className="space-y-1">
                      {tx.allocations.map((a) => (
                        <div
                          key={a.id}
                          className="flex items-center gap-1 text-green-600"
                        >
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span className="font-medium text-gray-900">
                            {a.targetLabel}
                          </span>
                          <span className="text-xs text-gray-500">
                            {formatMoney(a.amount, tx.currency, locale)}
                          </span>
                        </div>
                      ))}
                      {isOverpaid ? (
                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                          {L.overpaid}: {formatMoney(tx.unallocatedAmount, tx.currency, locale)}
                        </span>
                      ) : null}
                    </div>
                  ) : best ? (
                    <div className="space-y-1">
                      <div className="font-medium text-gray-900">
                        {best.fiscalNumber}
                        <span className="ml-1 text-xs font-normal text-gray-500">
                          {best.buyerName}
                        </span>
                      </div>
                      <ConfidenceBadge value={best.confidence} label={L.confidence} />
                    </div>
                  ) : (
                    <span className="text-xs text-gray-500">{L.noSuggestion}</span>
                  )}
                </td>
                <td className={cn(TD, "whitespace-nowrap text-right")}>
                  {busy ? (
                    <Loader2 className="ml-auto h-4 w-4 animate-spin" />
                  ) : isResolved ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onUnmatch(tx.id)}
                    >
                      <Undo2 className="mr-1 h-4 w-4" />
                      {L.unmatch}
                    </Button>
                  ) : (
                    <div className="flex justify-end gap-1">
                      {best ? (
                        <Button
                          size="sm"
                          onClick={() => onConfirm({ transaction: tx, suggestions })}
                        >
                          <CheckCircle2 className="mr-1 h-4 w-4" />
                          {L.confirm}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onIgnore(tx.id)}
                      >
                        <XCircle className="mr-1 h-4 w-4" />
                        {L.ignore}
                      </Button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DebtorsDashboard({ L, locale }: { L: Labels; locale: Loc }) {
  const { debtors, creditors, operational, summary, isLoading, mutate } =
    useDebtorReport();
  const [section, setSection] = useState<"debtors" | "creditors" | "operational">(
    "debtors",
  );
  const [clientIdno, setClientIdno] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [busyIdno, setBusyIdno] = useState<string | null>(null);

  const activeList =
    section === "debtors"
      ? debtors
      : section === "creditors"
        ? creditors
        : operational;

  const filtered = useMemo(() => {
    if (!activeList) return null;
    return clientIdno
      ? activeList.filter((r) => r.buyerIdno === clientIdno)
      : activeList;
  }, [activeList, clientIdno]);

  const paged = filtered
    ? filtered.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize)
    : null;
  const totalPages = filtered
    ? Math.max(1, Math.ceil(filtered.length / pageSize))
    : 1;

  const clientOptions = useMemo<MenuSelectOption<string>[]>(
    () => [
      { value: "", label: L.allClients },
      ...(activeList ?? [])
        .map((r) => ({
          value: r.buyerIdno,
          label: r.clientName,
          description: r.buyerIdno,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ],
    [activeList, L.allClients],
  );

  const switchSection = (next: "debtors" | "creditors" | "operational") => {
    setSection(next);
    setClientIdno("");
    setPage(1);
  };

  async function markNotClient(row: BalanceRow) {
    setBusyIdno(row.buyerIdno);
    try {
      const res = await fetch("/api/admin/reconciliation/exclusions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idno: row.buyerIdno, name: row.clientName }),
      });
      if (!res.ok) throw new Error(L.actionFail);
      await mutate();
      toast.success(L.markNotClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setBusyIdno(null);
    }
  }

  async function unmarkClient(idno: string) {
    setBusyIdno(idno);
    try {
      const res = await fetch(
        `/api/admin/reconciliation/exclusions?idno=${encodeURIComponent(idno)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error(L.actionFail);
      await mutate();
      toast.success(L.unmarkClient);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : L.actionFail);
    } finally {
      setBusyIdno(null);
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }

  const overdueAmount = summary
    ? (
        Number(summary.aging.d1_15) +
        Number(summary.aging.d16_30) +
        Number(summary.aging.d30plus)
      ).toFixed(2)
    : "0";
  const net = summary
    ? (Number(summary.totalReceivable) - Number(summary.totalCredit)).toFixed(2)
    : "0";

  return (
    <div>
      {summary ? (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              title={L.cardReceivable}
              value={formatMoney(summary.totalReceivable, "MDL", locale)}
              sub={String(summary.debtorCount)}
              tone="neutral"
            />
            <StatCard
              title={L.cardCredit}
              value={formatMoney(summary.totalCredit, "MDL", locale)}
              sub={String(summary.creditorCount)}
              tone="amber"
            />
            <StatCard
              title={L.cardOverdue}
              value={String(summary.overdueCount)}
              sub={formatMoney(overdueAmount, "MDL", locale)}
              tone="red"
            />
            <StatCard
              title={L.cardNet}
              value={formatMoney(net, "MDL", locale)}
              tone="neutral"
            />
          </div>
          <AgingBar summary={summary} L={L} locale={locale} />
        </>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5 shadow-sm">
          <SectionButton
            active={section === "debtors"}
            onClick={() => switchSection("debtors")}
          >
            {L.sectionDebtors} · {debtors?.length ?? 0}
          </SectionButton>
          <SectionButton
            active={section === "creditors"}
            onClick={() => switchSection("creditors")}
          >
            {L.sectionCreditors} · {creditors?.length ?? 0}
          </SectionButton>
          <SectionButton
            active={section === "operational"}
            onClick={() => switchSection("operational")}
          >
            {L.sectionOperational} · {operational?.length ?? 0}
          </SectionButton>
        </div>
        <div className="w-full max-w-sm sm:ml-auto">
          <MenuSelect
            value={clientIdno}
            options={clientOptions}
            onChange={(next) => {
              setClientIdno(next);
              setPage(1);
            }}
            ariaLabel={L.selectClient}
            searchable
            searchPlaceholder={L.searchClient}
          />
        </div>
      </div>

      {section === "debtors" ? (
        <DebtorList rows={paged} L={L} locale={locale} />
      ) : section === "creditors" ? (
        <CreditorList
          rows={paged}
          L={L}
          locale={locale}
          busyIdno={busyIdno}
          onMarkNotClient={markNotClient}
        />
      ) : (
        <OperationalList
          rows={paged}
          total={summary?.operationalTotal ?? "0"}
          L={L}
          locale={locale}
          busyIdno={busyIdno}
          onUnmark={unmarkClient}
        />
      )}

      {filtered && filtered.length > 0 ? (
        <Pagination
          L={L}
          page={page}
          totalPages={totalPages}
          total={filtered.length}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  title,
  value,
  sub,
  tone,
}: {
  title: string;
  value: string;
  sub?: string;
  tone: "neutral" | "amber" | "red";
}) {
  const toneCls =
    tone === "amber"
      ? "text-amber-600"
      : tone === "red"
        ? "text-red-600"
        : "text-gray-900";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-gray-500">
        {title}
      </div>
      <div className={cn("mt-1 text-lg font-bold tabular-nums", toneCls)}>
        {value}
      </div>
      {sub ? (
        <div className="mt-0.5 text-xs text-gray-400 tabular-nums">{sub}</div>
      ) : null}
    </div>
  );
}

function AgingBar({
  summary,
  L,
  locale,
}: {
  summary: NonNullable<ReturnType<typeof useDebtorReport>["summary"]>;
  L: Labels;
  locale: Loc;
}) {
  const parts = [
    { label: L.agingCurrent, amount: Number(summary.aging.current), cls: "bg-emerald-400" },
    { label: L.aging1_15, amount: Number(summary.aging.d1_15), cls: "bg-amber-300" },
    { label: L.aging16_30, amount: Number(summary.aging.d16_30), cls: "bg-orange-400" },
    { label: L.aging30plus, amount: Number(summary.aging.d30plus), cls: "bg-red-500" },
  ];
  const total = parts.reduce((s, p) => s + p.amount, 0);
  return (
    <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500">
        {L.agingTitle}
      </div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {total > 0
          ? parts.map((p, i) =>
              p.amount > 0 ? (
                <div
                  key={i}
                  className={p.cls}
                  style={{ width: `${(p.amount / total) * 100}%` }}
                />
              ) : null,
            )
          : null}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", p.cls)} />
            <div className="min-w-0">
              <div className="text-xs text-gray-500">{p.label}</div>
              <div className="text-sm font-medium text-gray-900 tabular-nums">
                {formatMoney(p.amount.toFixed(2), "MDL", locale)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-gold text-white" : "text-gray-600 hover:bg-gray-50",
      )}
    >
      {children}
    </button>
  );
}

function ActLink({
  idno,
  clientName,
  locale,
  L,
}: {
  idno: string;
  clientName?: string;
  locale: Loc;
  L: Labels;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-gold hover:underline"
      >
        <FileText className="h-4 w-4" />
        {L.act}
      </button>
      {open ? (
        <ActModal
          idno={idno}
          clientName={clientName}
          locale={locale}
          L={L}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ActModal({
  idno,
  clientName,
  locale,
  L,
  onClose,
}: {
  idno: string;
  clientName?: string;
  locale: Loc;
  L: Labels;
  onClose: () => void;
}) {
  const { statement, isLoading } = useClientStatement(idno);
  const [fiscalId, setFiscalId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !fiscalId) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, fiscalId]);

  const titleName = statement?.buyer.name || clientName || idno;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={L.act}
        className="relative flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-gray-900">{titleName}</h2>
            <p className="mt-0.5 text-sm text-gray-500">{idno}</p>
            {statement ? (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
                <span>
                  {L.actTotalInvoiced}:{" "}
                  <strong className="tabular-nums text-gray-900">
                    {formatMoney(statement.totalInvoiced, "MDL", locale)}
                  </strong>
                </span>
                <span>
                  {L.actTotalPaid}:{" "}
                  <strong className="tabular-nums text-gray-900">
                    {formatMoney(statement.totalPaid, "MDL", locale)}
                  </strong>
                </span>
                <span>
                  {L.actBalance}:{" "}
                  <strong
                    className={cn(
                      "tabular-nums",
                      Number(statement.totalOutstanding) > 0
                        ? "text-red-600"
                        : Number(statement.totalOutstanding) < 0
                          ? "text-amber-600"
                          : "text-gray-900",
                    )}
                  >
                    {formatMoney(statement.totalOutstanding, "MDL", locale)}
                  </strong>
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title={L.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
            </div>
          ) : statement ? (
            <ActLedgerPanel
              statement={statement}
              L={L}
              locale={locale}
              onOpenInvoice={setFiscalId}
              showBuyerHeader={false}
            />
          ) : (
            <p className="py-12 text-center text-sm text-gray-500">
              {L.debtorsEmpty}
            </p>
          )}
        </div>
      </div>

      {fiscalId ? (
        <FiscalInvoiceDetailDrawer
          id={fiscalId}
          live={false}
          locale={locale}
          L={L}
          onClose={() => setFiscalId(null)}
          onEnriched={() => undefined}
          overlayClassName="z-[110]"
        />
      ) : null}
    </div>
  );
}

function filterActEntries(
  entries: StatementEntry[],
  query: string,
  kindFilter: ActKindFilter,
): StatementEntry[] {
  const q = query.trim().toLowerCase();
  return entries.filter((e) => {
    if (
      kindFilter === "invoices" &&
      e.kind !== "invoice" &&
      e.kind !== "paper_invoice"
    ) {
      return false;
    }
    if (
      kindFilter === "payments" &&
      e.kind !== "payment" &&
      e.kind !== "receipt"
    ) {
      return false;
    }
    if (!q) return true;
    const hay = [
      e.document,
      e.description ?? "",
      e.debit,
      e.credit,
      e.balance,
      e.kind,
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function ActLedgerPanel({
  statement,
  L,
  locale,
  onOpenInvoice,
  showBuyerHeader = true,
}: {
  statement: ClientStatement;
  L: Labels;
  locale: Loc;
  onOpenInvoice?: (fiscalInvoiceId: string) => void;
  showBuyerHeader?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<ActKindFilter>("all");
  const [downloading, setDownloading] = useState(false);

  const filtered = useMemo(
    () => filterActEntries(statement.entries, query, kindFilter),
    [statement.entries, query, kindFilter],
  );

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadActPdf(statement.buyer.idno, locale, statement.buyer.name);
    } catch {
      toast.error(L.downloadPdfFail);
    } finally {
      setDownloading(false);
    }
  }

  const chips: { id: ActKindFilter; label: string }[] = [
    { id: "all", label: L.actFilterAll },
    { id: "invoices", label: L.actFilterInvoices },
    { id: "payments", label: L.actFilterPayments },
  ];

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={L.actSearchPlaceholder}
            className="h-9 w-full rounded-lg border border-gray-200 bg-white py-1.5 pl-8 pr-3 text-sm outline-none ring-gold/30 focus:border-gold focus:ring-2"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setKindFilter(c.id)}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                kindFilter === c.id
                  ? "bg-gold text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200",
              )}
            >
              {c.label}
            </button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void handleDownload()}
          disabled={downloading}
        >
          {downloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          {downloading ? L.downloadingPdf : L.downloadPdf}
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">
          {L.actFilterEmpty}
        </p>
      ) : (
        <LedgerTable
          statement={statement}
          entries={filtered}
          L={L}
          locale={locale}
          onOpenInvoice={onOpenInvoice}
          showBuyerHeader={showBuyerHeader}
          showTotals={query.trim() === "" && kindFilter === "all"}
        />
      )}
    </div>
  );
}

function DebtorList({
  rows,
  L,
  locale,
}: {
  rows: BalanceRow[] | null;
  L: Labels;
  locale: Loc;
}) {
  if (!rows || rows.length === 0) {
    return <p className="py-12 text-center text-sm text-gray-500">{L.debtorsEmpty}</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
          <tr>
            <th className={TH}>{L.colClient}</th>
            <th className={cn(TH, "hidden md:table-cell")}>{L.colIdno}</th>
            <th className={cn(TH, "text-right")}>{L.colOpenInvoices}</th>
            <th className={cn(TH, "text-right")}>{L.colOutstanding}</th>
            <th className={cn(TH, "hidden md:table-cell")}>{L.colOldestDue}</th>
            <th className={cn(TH, "text-right")}>{L.act}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((d) => (
            <tr key={d.buyerIdno} className="hover:bg-gray-50/60">
              <td className={cn(TD, "font-medium text-gray-900")}>{d.clientName}</td>
              <td className={cn(TD, "hidden text-xs text-gray-500 md:table-cell")}>
                {d.buyerIdno ?? "—"}
              </td>
              <td className={cn(TD, "text-right")}>{d.openInvoices}</td>
              <td className={cn(TD, "text-right font-medium text-red-600 tabular-nums")}>
                {formatMoney(d.amount, "MDL", locale)}
              </td>
              <td className={cn(TD, "hidden md:table-cell")}>
                <span className={d.daysOverdue != null ? "text-red-600" : ""}>
                  {formatShortDate(d.oldestDueDate)}
                  {d.daysOverdue != null ? ` · ${L.overdueDays(d.daysOverdue)}` : ""}
                </span>
              </td>
              <td className={cn(TD, "text-right")}>
                <ActLink
                  idno={d.buyerIdno}
                  clientName={d.clientName}
                  locale={locale}
                  L={L}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CreditorList({
  rows,
  L,
  locale,
  busyIdno,
  onMarkNotClient,
}: {
  rows: BalanceRow[] | null;
  L: Labels;
  locale: Loc;
  busyIdno: string | null;
  onMarkNotClient: (row: BalanceRow) => void;
}) {
  if (!rows || rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">{L.creditorsEmpty}</p>
    );
  }
  return (
    <div>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{L.creditHint}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className={TH}>{L.colClient}</th>
              <th className={cn(TH, "hidden md:table-cell")}>{L.colIdno}</th>
              <th className={cn(TH, "text-right")}>{L.colOpenInvoices}</th>
              <th className={cn(TH, "text-right")}>{L.colCreditAmount}</th>
              <th className={cn(TH, "text-right")}>{L.act}</th>
              <th className={cn(TH, "text-right")} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((c) => (
              <tr key={c.buyerIdno} className="hover:bg-gray-50/60">
                <td className={cn(TD, "font-medium text-gray-900")}>{c.clientName}</td>
                <td className={cn(TD, "hidden text-xs text-gray-500 md:table-cell")}>
                  {c.buyerIdno ?? "—"}
                </td>
                <td className={cn(TD, "text-right")}>{c.openInvoices}</td>
                <td className={cn(TD, "text-right font-medium text-amber-600 tabular-nums")}>
                  {formatMoney(c.amount, "MDL", locale)}
                </td>
                <td className={cn(TD, "text-right")}>
                  <ActLink
                    idno={c.buyerIdno}
                    clientName={c.clientName}
                    locale={locale}
                    L={L}
                  />
                </td>
                <td className={cn(TD, "text-right")}>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busyIdno === c.buyerIdno}
                    onClick={() => onMarkNotClient(c)}
                  >
                    {busyIdno === c.buyerIdno ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      L.markNotClient
                    )}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OperationalList({
  rows,
  total,
  L,
  locale,
  busyIdno,
  onUnmark,
}: {
  rows: BalanceRow[] | null;
  total: string;
  L: Labels;
  locale: Loc;
  busyIdno: string | null;
  onUnmark: (idno: string) => void;
}) {
  if (!rows || rows.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">{L.operationalEmpty}</p>
    );
  }
  return (
    <div>
      <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{L.operationalHint}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className={TH}>{L.colClient}</th>
              <th className={cn(TH, "hidden md:table-cell")}>{L.colIdno}</th>
              <th className={cn(TH, "text-right")}>{L.colReceived}</th>
              <th className={cn(TH, "text-right")} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((o) => (
              <tr key={o.buyerIdno} className="hover:bg-gray-50/60">
                <td className={cn(TD, "font-medium text-gray-900")}>{o.clientName}</td>
                <td className={cn(TD, "hidden text-xs text-gray-500 md:table-cell")}>
                  {o.buyerIdno ?? "—"}
                </td>
                <td className={cn(TD, "text-right font-medium text-gray-700 tabular-nums")}>
                  {formatMoney(o.amount, "MDL", locale)}
                </td>
                <td className={cn(TD, "text-right")}>
                  {o.removable ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyIdno === o.buyerIdno}
                      onClick={() => onUnmark(o.buyerIdno)}
                    >
                      {busyIdno === o.buyerIdno ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        L.unmarkClient
                      )}
                    </Button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 text-right text-sm">
        <span className="text-gray-500">{L.operationalTotalLabel}: </span>
        <span className="font-semibold tabular-nums">
          {formatMoney(total, "MDL", locale)}
        </span>
      </div>
    </div>
  );
}

function Pagination({
  L,
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  L: ReturnType<typeof getReconLabels>;
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
      <div className="flex items-center gap-2">
        <span>{L.perPage}</span>
        <MenuSelect<number>
          value={pageSize}
          options={PAGE_SIZES.map((n) => ({ value: n, label: String(n) }))}
          onChange={onPageSize}
          ariaLabel={L.perPage}
          popoverMinWidthPx={88}
          className="w-20"
        />
        <span className="text-gray-400">· {total}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>{L.pageOf(page, totalPages)}</span>
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          onClick={() => onPage(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPages}
          onClick={() => onPage(Math.min(totalPages, page + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function ActView({ L, locale }: { L: Labels; locale: Loc }) {
  const { clients } = useReconClients();
  const [idno, setIdno] = useState("");
  const [fiscalId, setFiscalId] = useState<string | null>(null);
  const { statement, isLoading } = useClientStatement(idno || null);

  const options = useMemo<MenuSelectOption<string>[]>(
    () => [
      { value: "", label: L.selectClient },
      ...(clients ?? []).map((c) => ({
        value: c.idno,
        label: c.name,
        description: c.idno,
      })),
    ],
    [clients, L.selectClient],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-full max-w-sm">
          <MenuSelect
            value={idno}
            options={options}
            onChange={(v) => {
              setIdno(v);
              setFiscalId(null);
            }}
            ariaLabel={L.selectClient}
            searchable
            searchPlaceholder={L.searchClient}
          />
        </div>
      </div>

      {!idno ? (
        <p className="py-12 text-center text-sm text-gray-500">{L.actEmpty}</p>
      ) : isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
        </div>
      ) : statement ? (
        <ActLedgerPanel
          statement={statement}
          L={L}
          locale={locale}
          onOpenInvoice={setFiscalId}
        />
      ) : (
        <p className="py-12 text-center text-sm text-gray-500">{L.debtorsEmpty}</p>
      )}

      {fiscalId ? (
        <FiscalInvoiceDetailDrawer
          id={fiscalId}
          live={false}
          locale={locale}
          L={L}
          onClose={() => setFiscalId(null)}
          onEnriched={() => undefined}
          overlayClassName="z-[110]"
        />
      ) : null}
    </div>
  );
}

function fiscalIdFromEntry(e: StatementEntry): string | null {
  if (e.kind === "invoice") return e.sourceId;
  if (e.kind === "receipt" && e.sourceId.startsWith("receipt:")) {
    return e.sourceId.slice("receipt:".length);
  }
  return null;
}

function LedgerTable({
  statement,
  entries,
  L,
  locale,
  onOpenInvoice,
  showBuyerHeader = true,
  showTotals = true,
}: {
  statement: ClientStatement;
  entries: StatementEntry[];
  L: Labels;
  locale: Loc;
  onOpenInvoice?: (fiscalInvoiceId: string) => void;
  showBuyerHeader?: boolean;
  showTotals?: boolean;
}) {
  const cur = "MDL";
  return (
    <div>
      {showBuyerHeader ? (
        <div className="mb-2 text-sm text-gray-500">
          <span className="font-medium text-gray-900">{statement.buyer.name}</span>
          {statement.buyer.idno ? ` · ${statement.buyer.idno}` : ""}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className={TH}>{L.colDate}</th>
              <th className={TH}>{L.colDoc}</th>
              <th className={cn(TH, "text-right")}>{L.colDebit}</th>
              <th className={cn(TH, "text-right")}>{L.colCredit}</th>
              <th className={cn(TH, "text-right")}>{L.colBalance}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {entries.map((e) => {
              const isPayment = e.kind === "payment";
              const isReceipt = e.kind === "receipt";
              const isPaperInvoice = e.kind === "paper_invoice";
              const bal = Number(e.balance);
              const fiscalId = fiscalIdFromEntry(e);
              const clickable = Boolean(fiscalId && onOpenInvoice);
              const docTitle = isPayment
                ? `${L.rowPayment}: ${e.document}`
                : isReceipt
                  ? `${L.rowReceipt}: ${e.document}`
                  : isPaperInvoice
                    ? `${L.rowPaperInvoice}: ${e.document}`
                    : e.document;
              return (
                <tr
                  key={`${e.kind}-${e.sourceId}`}
                  className={cn(
                    "align-top hover:bg-gray-50/60",
                    clickable && "cursor-pointer",
                  )}
                  onClick={() => {
                    if (fiscalId && onOpenInvoice) onOpenInvoice(fiscalId);
                  }}
                >
                  <td className={cn(TD, "whitespace-nowrap")}>
                    {formatShortDate(e.date)}
                  </td>
                  <td className={TD}>
                    <div
                      className={cn(
                        "font-medium",
                        clickable && "text-gold hover:underline",
                        !clickable &&
                          (isReceipt
                            ? "text-blue-700"
                            : isPayment
                              ? "text-green-700"
                              : isPaperInvoice
                                ? "text-amber-800"
                                : "text-gray-900"),
                      )}
                    >
                      {docTitle}
                      {e.paperFiscal ? (
                        <span className="ml-2 inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                          {L.paperFiscalNote}
                        </span>
                      ) : null}
                    </div>
                    {e.description ? (
                      <div className="max-w-md truncate text-xs text-gray-400">
                        {e.description}
                      </div>
                    ) : isPaperInvoice ? (
                      <div className="max-w-md text-xs text-gray-400">
                        {L.paperFiscalNote}
                      </div>
                    ) : null}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right text-red-600")}>
                    {e.debit === "0.00" ? "" : formatMoney(e.debit, cur, locale)}
                  </td>
                  <td className={cn(TD, "whitespace-nowrap text-right text-green-700")}>
                    {e.credit === "0.00" ? "" : formatMoney(e.credit, cur, locale)}
                  </td>
                  <td
                    className={cn(
                      TD,
                      "whitespace-nowrap text-right font-medium",
                      bal > 0 ? "text-red-600" : "text-gray-500",
                    )}
                  >
                    {formatMoney(e.balance, cur, locale)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showTotals ? (
        <div className="mt-3 flex flex-col items-end gap-1 text-sm">
          <div className="flex w-full max-w-xs justify-between">
            <span className="text-gray-500">{L.actTotalInvoiced}</span>
            <span className="font-medium">
              {formatMoney(statement.totalInvoiced, cur, locale)}
            </span>
          </div>
          <div className="flex w-full max-w-xs justify-between">
            <span className="text-gray-500">{L.actTotalPaid}</span>
            <span className="font-medium">
              {formatMoney(statement.totalPaid, cur, locale)}
            </span>
          </div>
          <div className="flex w-full max-w-xs justify-between border-t border-gray-900 pt-1">
            <span className="font-semibold text-gray-900">{L.actBalance}</span>
            <span
              className={cn(
                "font-bold",
                Number(statement.totalOutstanding) > 0
                  ? "text-red-600"
                  : "text-gray-900",
              )}
            >
              {formatMoney(statement.totalOutstanding, cur, locale)}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatementsView({ L, locale }: { L: Labels; locale: Loc }) {
  const { statements, isLoading } = useBankStatements();
  const [openId, setOpenId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-gray-500" />
      </div>
    );
  }
  if (!statements || statements.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-gray-500">
        {L.statementsEmpty}
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-100 bg-gray-50/80 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <tr>
              <th className={TH}>{L.colFile}</th>
              <th className={TH}>{L.period}</th>
              <th className={cn(TH, "text-right")}>{L.colTransactions}</th>
              <th className={cn(TH, "hidden md:table-cell")}>{L.colUploadedBy}</th>
              <th className={cn(TH, "hidden md:table-cell")}>{L.uploaded}</th>
              <th className={cn(TH, "text-right")}>{L.colActions}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {statements.map((s) => (
              <tr
                key={s.id}
                className="cursor-pointer align-top hover:bg-gray-50/60"
                onClick={() => setOpenId(s.id)}
              >
                <td className={cn(TD, "font-medium text-gray-900")}>
                  {s.fileName}
                </td>
                <td className={cn(TD, "whitespace-nowrap text-gray-500")}>
                  {formatShortDate(s.periodFrom)}–{formatShortDate(s.periodTo)}
                </td>
                <td className={cn(TD, "text-right")}>{s.transactionCount}</td>
                <td className={cn(TD, "hidden text-gray-500 md:table-cell")}>
                  {s.uploadedByName ?? "—"}
                </td>
                <td className={cn(TD, "hidden text-gray-500 md:table-cell")}>
                  {formatShortDate(s.createdAt)}
                </td>
                <td className={cn(TD, "text-right")}>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setOpenId(s.id);
                    }}
                  >
                    <FileText className="mr-1 h-4 w-4" />
                    {L.viewTransactions}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openId ? (
        <StatementDrawer
          id={openId}
          L={L}
          locale={locale}
          onClose={() => setOpenId(null)}
        />
      ) : null}
    </>
  );
}

function StatementDrawer({
  id,
  L,
  locale,
  onClose,
}: {
  id: string;
  L: Labels;
  locale: Loc;
  onClose: () => void;
}) {
  const { statement, transactions, isLoading } =
    useBankStatementTransactions(id);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} aria-hidden />
      <aside className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {statement?.fileName ?? "…"}
            </h2>
            {statement ? (
              <p className="mt-0.5 text-sm text-gray-500">
                {formatShortDate(statement.periodFrom)}–
                {formatShortDate(statement.periodTo)} · {statement.transactionCount}{" "}
                {L.rows}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            title={L.close}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {isLoading || !transactions ? (
          <div className="flex items-center justify-center py-24 text-gray-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="p-5">
            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                    <th className="px-3 py-2">{L.colDate}</th>
                    <th className="px-3 py-2">{L.colPayer}</th>
                    <th className="px-3 py-2">{L.colDirection}</th>
                    <th className="px-3 py-2 text-right">{L.colAmount}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transactions.map((t) => {
                    const inc = t.direction === "CREDIT";
                    return (
                      <tr key={t.id} className="align-top">
                        <td className="whitespace-nowrap px-3 py-2">
                          {formatShortDate(t.bookingDate)}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900">
                            {t.counterpartyName ?? "—"}
                          </div>
                          {t.purpose ? (
                            <div className="max-w-md truncate text-xs text-gray-400">
                              {t.purpose}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 text-xs font-medium",
                              inc ? "text-green-700" : "text-gray-500",
                            )}
                          >
                            {inc ? (
                              <ArrowDownLeft className="h-3.5 w-3.5" />
                            ) : (
                              <ArrowUpRight className="h-3.5 w-3.5" />
                            )}
                            {inc ? L.dirIn : L.dirOut}
                          </span>
                        </td>
                        <td
                          className={cn(
                            "whitespace-nowrap px-3 py-2 text-right font-medium",
                            inc ? "text-green-700" : "text-gray-900",
                          )}
                        >
                          {inc ? "+" : "−"}
                          {formatMoney(t.amount, t.currency, locale)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
