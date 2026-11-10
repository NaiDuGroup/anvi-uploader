"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Check, ChevronDown, CreditCard, Landmark, Link2, Loader2, RotateCcw, Sparkles, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetcher } from "@/lib/swr/fetcher";
import { formatShortDate } from "@/lib/reconciliation/labels";
import type { SettlementExtraLabels } from "@/lib/settlements/checkLabels";
import type { InvoicePaymentStatus } from "@/lib/settlements/supplierMatch";
import type {
  SupplierLinkDto,
  SupplierMatchCardResponse,
  SupplierPaymentDto,
} from "@/lib/settlements/supplierMatchLoad";
import { cn } from "@/lib/utils";
import { AdminConfirmDialog } from "./AdminConfirmDialog";

const STATUS_PILL: Record<InvoicePaymentStatus, string> = {
  paid: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  partial: "bg-amber-50 text-amber-800 ring-amber-200",
  unpaid: "bg-rose-50 text-rose-800 ring-rose-200",
  receipt: "bg-sky-50 text-sky-800 ring-sky-200",
  credit: "bg-gray-100 text-gray-700 ring-gray-200",
};

const LIST_LIMIT = 25;

export function PaymentStatusPill({
  status,
  labels,
}: {
  status: InvoicePaymentStatus;
  labels: Record<InvoicePaymentStatus, string>;
}) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1",
        STATUS_PILL[status],
      )}
    >
      {labels[status]}
    </span>
  );
}

function confidenceTone(n: number): string {
  if (n >= 90) return "bg-emerald-50 text-emerald-800 ring-emerald-200";
  if (n >= 70) return "bg-sky-50 text-sky-800 ring-sky-200";
  if (n >= 50) return "bg-amber-50 text-amber-800 ring-amber-200";
  return "bg-gray-100 text-gray-700 ring-gray-200";
}

async function post(url: string, body: unknown, method = "POST"): Promise<{ done?: number; skipped?: number; suggested?: number; confirmed?: number }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body == null ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

export default function SupplierMatchPanel({
  idno,
  X,
  money,
  onChanged,
}: {
  idno: string;
  X: SettlementExtraLabels;
  money: (n: number) => string;
  onChanged?: () => void;
}) {
  const M = X.match;
  const url = `/api/admin/settlements/supplier-match?idno=${encodeURIComponent(idno)}`;
  const { data, isLoading, mutate } = useSWR<SupplierMatchCardResponse>(url, fetcher, {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [linking, setLinking] = useState<string | null>(null);
  const [undoLink, setUndoLink] = useState<SupplierLinkDto | null>(null);
  const [showAllInvoices, setShowAllInvoices] = useState(false);
  const [showAllPayments, setShowAllPayments] = useState(false);
  const [showRejected, setShowRejected] = useState(false);

  async function run(key: string, fn: () => Promise<{ done?: number; skipped?: number; suggested?: number; confirmed?: number }>) {
    setBusy(key);
    try {
      const r = await fn();
      if (r.suggested != null && r.confirmed != null) toast.success(M.autoDone(r.suggested, r.confirmed));
      else if (r.skipped) toast.message(M.skipped(r.skipped));
      else toast.success(M.saved);
      await mutate();
      onChanged?.();
    } catch {
      toast.error(M.error);
    } finally {
      setBusy(null);
    }
  }

  const loaded = Boolean(data);
  useEffect(() => {
    if (loaded && window.location.hash === "#supplier-match") {
      document.getElementById("supplier-match")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [loaded]);

  const strong = useMemo(
    () => (data?.suggestions ?? []).filter((s) => s.confidence >= 80).map((s) => s.allocationId),
    [data],
  );

  if (isLoading && !data) {
    return (
      <div className="flex justify-center rounded-xl border border-gray-200 bg-white py-6 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }
  if (!data || (data.invoices.length === 0 && data.payments.length === 0)) return null;

  const invoices = showAllInvoices ? data.invoices : data.invoices.slice(0, LIST_LIMIT);
  const payments = showAllPayments ? data.payments : data.payments.slice(0, LIST_LIMIT);
  const counts = (Object.keys(data.counts) as InvoicePaymentStatus[]).filter((k) => data.counts[k] > 0);

  return (
    <div id="supplier-match" className="space-y-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">{M.title}</div>
          <p className="mt-0.5 max-w-2xl text-xs text-gray-400">{M.hint}</p>
          {counts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              {counts.map((k) => (
                <span key={k} className={cn("rounded-full px-2 py-0.5 text-xs ring-1", STATUS_PILL[k])}>
                  {M.status[k]} · {data.counts[k]}
                </span>
              ))}
            </div>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5 self-start"
          disabled={busy !== null}
          onClick={() => run("auto", () => post("/api/admin/settlements/supplier-match/auto", { idno }))}
        >
          {busy === "auto" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {busy === "auto" ? M.autoRunning : M.autoRun}
        </Button>
      </div>

      {/* Suggestions */}
      <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-2.5">
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-violet-800">
            {M.suggestions} {data.suggestions.length > 0 ? `· ${data.suggestions.length}` : ""}
          </div>
          {strong.length > 1 ? (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs"
              disabled={busy !== null}
              onClick={() => run("all", () => post("/api/admin/settlements/supplier-match/confirm", { ids: strong }))}
            >
              {M.confirmAll(strong.length)}
            </Button>
          ) : null}
        </div>
        {data.suggestions.length === 0 ? (
          <p className="text-xs text-gray-500">{M.noSuggestions}</p>
        ) : (
          <ul className="space-y-1.5">
            {data.suggestions.map((s) => (
              <li
                key={s.allocationId}
                className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white px-2.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1", confidenceTone(s.confidence))}>
                      {M.confidence(s.confidence)}
                    </span>
                    <span className="font-medium tabular-nums text-gray-900">{money(s.amount)}</span>
                    <span className="text-gray-500">
                      {formatShortDate(s.paymentDate)} · {s.paymentKind === "card" ? M.card : M.bank} {s.paymentDocument}
                    </span>
                    <span className="text-gray-400">→</span>
                    <span className="font-medium text-gray-900">{s.invoiceDocument}</span>
                    <span className="text-gray-500">
                      {formatShortDate(s.invoiceDate)} · {s.invoiceTotal != null ? money(s.invoiceTotal) : ""}
                    </span>
                  </div>
                  {s.reason ? <div className="text-gray-500">{s.reason}</div> : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      run(s.allocationId, () => post("/api/admin/settlements/supplier-match/confirm", { ids: [s.allocationId] }))
                    }
                  >
                    {busy === s.allocationId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                    {M.confirm}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 text-xs"
                    disabled={busy !== null}
                    onClick={() =>
                      run(`r${s.allocationId}`, () => post("/api/admin/settlements/supplier-match/reject", { ids: [s.allocationId] }))
                    }
                  >
                    <XIcon className="h-3.5 w-3.5" />
                    {M.reject}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {data.rejected.length > 0 ? (
          <div className="mt-2 border-t border-violet-100 pt-2">
            <button
              type="button"
              className="flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-700"
              aria-expanded={showRejected}
              onClick={() => setShowRejected((v) => !v)}
            >
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showRejected ? "" : "-rotate-90")} />
              {M.rejectedTitle} · {data.rejected.length}
            </button>
            {showRejected ? (
              <>
                <p className="mb-1.5 mt-1 text-[11px] text-gray-400">{M.rejectedHint}</p>
                <ul className="space-y-1.5">
                  {data.rejected.map((s) => (
                    <li
                      key={s.allocationId}
                      className="flex flex-col gap-2 rounded-md border border-gray-200 bg-white/70 px-2.5 py-2 text-xs sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-0.5 text-gray-500">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-medium ring-1", confidenceTone(s.confidence))}>
                            {M.confidence(s.confidence)}
                          </span>
                          <span className="font-medium tabular-nums text-gray-700">{money(s.amount)}</span>
                          <span>
                            {formatShortDate(s.paymentDate)} · {s.paymentKind === "card" ? M.card : M.bank} {s.paymentDocument}
                          </span>
                          <span className="text-gray-400">→</span>
                          <span className="font-medium text-gray-700">{s.invoiceDocument}</span>
                          <span>
                            {formatShortDate(s.invoiceDate)} · {s.invoiceTotal != null ? money(s.invoiceTotal) : ""}
                          </span>
                        </div>
                        {s.reason ? <div>{s.reason}</div> : null}
                        {s.rejectedAt ? <div className="text-gray-400">{M.rejectedAt(formatShortDate(s.rejectedAt))}</div> : null}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 shrink-0 gap-1 self-start text-xs sm:self-auto"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`u${s.allocationId}`, async () => {
                            await post(`/api/admin/settlements/supplier-match/${encodeURIComponent(s.allocationId)}`, null, "DELETE");
                            // Re-run matching so the suggestion comes back right away.
                            return post("/api/admin/settlements/supplier-match/auto", { idno });
                          })
                        }
                      >
                        {busy === `u${s.allocationId}` ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        {M.restore}
                      </Button>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {data.stale.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-2.5">
          <div className="text-xs font-semibold uppercase tracking-wider text-amber-800">
            {M.staleTitle} · {data.stale.length}
          </div>
          <p className="mb-1.5 text-[11px] text-amber-800/80">{M.staleHint}</p>
          <ul className="space-y-1">
            {data.stale.map((l) => (
              <li
                key={l.allocationId}
                className="flex items-center justify-between gap-2 rounded-md border border-amber-100 bg-white px-2.5 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate text-gray-700">
                  {l.paymentKind === "card" ? <CreditCard className="mr-1 inline h-3 w-3" /> : <Landmark className="mr-1 inline h-3 w-3" />}
                  {l.paymentDate ? `${formatShortDate(l.paymentDate)} · ` : ""}
                  {l.paymentDocument ?? "—"} → {l.invoiceDocument ?? "—"} · {money(l.amount)}{" "}
                  {l.staleReason ? <span className="text-amber-700">({M.staleReason[l.staleReason]})</span> : null}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 shrink-0 px-2 text-[11px]"
                  disabled={busy !== null}
                  onClick={() => setUndoLink(l)}
                >
                  {M.undo}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {/* Invoices */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {M.invoices} · {data.invoices.length}
          </div>
          {data.invoices.length === 0 ? (
            <p className="text-xs text-gray-500">{M.noInvoices}</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {invoices.map((inv) => {
                const confirmed = inv.links.filter((l) => l.status === "confirmed");
                return (
                  <li key={inv.id} className="px-2.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="font-medium text-gray-900">{inv.document}</span>
                        <span className="text-gray-500">{formatShortDate(inv.issueDate)}</span>
                        <PaymentStatusPill status={inv.status} labels={M.status} />
                      </div>
                      <span className="tabular-nums text-gray-700">
                        {inv.status === "partial" ? M.paidOf(money(inv.paid), money(inv.total)) : money(inv.total)}
                      </span>
                    </div>
                    {inv.status === "receipt" && inv.receiptRef ? (
                      <div className="mt-0.5 text-gray-400">{inv.receiptRef}</div>
                    ) : null}
                    {inv.creditOffset > 0 ? (
                      <div className="mt-0.5 text-gray-500">{M.creditOffset(money(inv.creditOffset))}</div>
                    ) : null}
                    {inv.overAllocated > 0 ? (
                      <div className="mt-0.5 text-rose-700">{M.overAllocated(money(inv.overAllocated))}</div>
                    ) : null}
                    {confirmed.length > 0 ? (
                      <ul className="mt-1 space-y-0.5">
                        {confirmed.map((l) => (
                          <li key={l.allocationId} className="flex items-center justify-between gap-2 text-gray-500">
                            <span className="min-w-0 truncate">
                              {l.paymentKind === "card" ? <CreditCard className="mr-1 inline h-3 w-3" /> : <Landmark className="mr-1 inline h-3 w-3" />}
                              {formatShortDate(l.paymentDate)} · {l.paymentDocument} · {money(l.amount)}{" "}
                              <span className="text-gray-400">({l.auto ? M.auto : M.manual})</span>
                            </span>
                            <button
                              type="button"
                              className="shrink-0 rounded px-1 text-gray-400 hover:bg-gray-100 hover:text-rose-700"
                              title={M.undo}
                              aria-label={M.undo}
                              onClick={() => setUndoLink(l)}
                            >
                              <XIcon className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {data.invoices.length > LIST_LIMIT && !showAllInvoices ? (
            <button type="button" className="mt-1 text-xs text-gray-500 underline" onClick={() => setShowAllInvoices(true)}>
              {M.showAll(data.invoices.length)}
            </button>
          ) : null}
        </div>

        {/* Payments */}
        <div>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
            {M.payments} · {data.payments.length}
          </div>
          {data.payments.length === 0 ? (
            <p className="text-xs text-gray-500">{M.noPayments}</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
              {payments.map((p) => {
                const left = Math.round((p.amount - p.allocated) * 100) / 100;
                return (
                  <li key={p.id} className="px-2.5 py-2 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex min-w-0 items-center gap-1.5">
                        {p.kind === "card" ? (
                          <CreditCard className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        ) : (
                          <Landmark className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                        )}
                        <span className="text-gray-500">{formatShortDate(p.date)}</span>
                        <span className="truncate font-medium text-gray-900">{p.document}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="tabular-nums text-gray-700">{money(p.amount)}</span>
                        {left > 0.005 ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 gap-1 px-2 text-[11px]"
                            onClick={() => setLinking(linking === p.id ? null : p.id)}
                          >
                            <Link2 className="h-3 w-3" />
                            {M.link}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    {p.purpose ? (
                      <div className="mt-0.5 truncate text-gray-400" title={p.purpose}>
                        {p.purpose}
                      </div>
                    ) : null}
                    {left > 0.005 && p.allocated > 0 ? (
                      <div className="mt-0.5 text-amber-700">{M.left(money(left))}</div>
                    ) : null}
                    {linking === p.id ? (
                      <LinkForm
                        payment={p}
                        left={left}
                        data={data}
                        M={M}
                        money={money}
                        busy={busy === `link${p.id}`}
                        cancelLabel={X.checks.cancel}
                        onCancel={() => setLinking(null)}
                        onSave={(allocations) =>
                          run(`link${p.id}`, async () => {
                            const r = await post("/api/admin/settlements/supplier-match/allocate", {
                              bankTransactionId: p.id,
                              allocations,
                            });
                            setLinking(null);
                            return r;
                          })
                        }
                      />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {data.payments.length > LIST_LIMIT && !showAllPayments ? (
            <button type="button" className="mt-1 text-xs text-gray-500 underline" onClick={() => setShowAllPayments(true)}>
              {M.showAll(data.payments.length)}
            </button>
          ) : null}
        </div>
      </div>

      <AdminConfirmDialog
        open={undoLink !== null}
        title={M.undoConfirm}
        description={undoLink ? `${undoLink.paymentDocument ?? ""} → ${undoLink.invoiceDocument ?? ""} · ${money(undoLink.amount)}` : ""}
        confirmLabel={M.undo}
        cancelLabel={X.checks.cancel}
        busy={busy === "undo"}
        onConfirm={() => {
          const l = undoLink;
          if (!l) return;
          void run("undo", async () => {
            const r = await post(`/api/admin/settlements/supplier-match/${encodeURIComponent(l.allocationId)}`, null, "DELETE");
            setUndoLink(null);
            return r;
          });
        }}
        onClose={() => setUndoLink(null)}
      />
    </div>
  );
}

function LinkForm({
  left,
  data,
  M,
  money,
  busy,
  cancelLabel,
  onCancel,
  onSave,
}: {
  cancelLabel: string;
  payment: SupplierPaymentDto;
  left: number;
  data: SupplierMatchCardResponse;
  M: SettlementExtraLabels["match"];
  money: (n: number) => string;
  busy: boolean;
  onCancel: () => void;
  onSave: (allocations: Array<{ purchaseInvoiceId: string; amount: number }>) => void;
}) {
  const open = useMemo(
    () =>
      data.invoices
        .filter((i) => i.status === "unpaid" || i.status === "partial")
        .map((i) => ({ ...i, open: Math.round((i.total - i.paid - i.creditOffset) * 100) / 100 }))
        .filter((i) => i.open > 0)
        .sort((a, b) => (a.issueDate ?? "").localeCompare(b.issueDate ?? "")),
    [data],
  );
  const [picked, setPicked] = useState<Record<string, string>>({});
  const total = Object.values(picked).reduce((s, v) => s + (Number(v.replace(",", ".")) || 0), 0);

  function toggle(id: string, amount: number) {
    setPicked((cur) => {
      const next = { ...cur };
      if (id in next) delete next[id];
      else {
        const room = Math.max(0, Math.round((left - total) * 100) / 100);
        next[id] = String(Math.min(amount, room || amount));
      }
      return next;
    });
  }

  return (
    <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-2">
      <div className="text-xs font-medium text-gray-800">{M.linkTitle}</div>
      <p className="mb-1.5 text-[11px] text-gray-500">{M.linkHint}</p>
      {open.length === 0 ? (
        <p className="text-xs text-gray-500">{M.noInvoices}</p>
      ) : (
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {open.map((i) => (
            <li key={i.id} className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex min-w-0 flex-1 items-center gap-1.5">
                <input type="checkbox" checked={i.id in picked} onChange={() => toggle(i.id, i.open)} />
                <span className="font-medium text-gray-900">{i.document}</span>
                <span className="text-gray-500">{formatShortDate(i.issueDate)}</span>
                <span className="text-gray-500">{M.linkOpen(money(i.open))}</span>
              </label>
              {i.id in picked ? (
                <Input
                  inputMode="decimal"
                  value={picked[i.id]}
                  onChange={(e) => setPicked((cur) => ({ ...cur, [i.id]: e.target.value }))}
                  className="h-7 w-28 text-xs tabular-nums"
                  aria-label={M.linkAmount}
                />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          className="h-7 text-xs"
          disabled={busy || Object.keys(picked).length === 0}
          onClick={() =>
            onSave(
              Object.entries(picked)
                .map(([purchaseInvoiceId, v]) => ({ purchaseInvoiceId, amount: Number(v.replace(",", ".")) }))
                .filter((a) => Number.isFinite(a.amount) && a.amount > 0),
            )
          }
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {M.linkSave}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </Button>
        <span className="text-[11px] tabular-nums text-gray-500">
          {money(total)} / {money(left)}
        </span>
      </div>
    </div>
  );
}
