"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, Check, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatShortDate } from "@/lib/reconciliation/labels";
import type { SettlementExtraLabels } from "@/lib/settlements/checkLabels";
import { CHECK_TYPES, type CheckSignal, type CheckType, type SettlementChecks } from "@/lib/settlements/types";
import { cn } from "@/lib/utils";

const TYPE_TONE: Record<CheckType, string> = {
  duplicate_sale: "bg-orange-50 text-orange-800 ring-orange-200",
  payment_without_invoice: "bg-sky-50 text-sky-800 ring-sky-200",
  supplier_overpaid: "bg-violet-50 text-violet-800 ring-violet-200",
  duplicate_payment: "bg-rose-50 text-rose-800 ring-rose-200",
  supplier_unpaid: "bg-amber-50 text-amber-800 ring-amber-200",
  payment_unmatched: "bg-amber-50 text-amber-800 ring-amber-200",
  card_unattributed: "bg-gray-100 text-gray-700 ring-gray-200",
  low_confidence_sales: "bg-gray-100 text-gray-700 ring-gray-200",
  vat_anomaly: "bg-rose-50 text-rose-800 ring-rose-200",
  receipt_and_bank: "bg-rose-50 text-rose-800 ring-rose-200",
  over_allocated: "bg-rose-50 text-rose-800 ring-rose-200",
  stale_link: "bg-amber-50 text-amber-800 ring-amber-200",
};

function actionHref(s: CheckSignal): string | null {
  if (s.type === "card_unattributed") return null;
  if (s.type === "low_confidence_sales") return "/admin/bookkeeping/reconciliation";
  if (!s.idno) return null;
  const base = `/admin/bookkeeping/settlements/${encodeURIComponent(s.idno)}`;
  return s.type === "supplier_unpaid" ||
    s.type === "payment_unmatched" ||
    s.type === "receipt_and_bank" ||
    s.type === "over_allocated" ||
    s.type === "stale_link"
    ? `${base}#supplier-match`
    : base;
}

export default function SettlementsChecks({
  checks,
  X,
  money,
  onChanged,
  onOpenCardPayments,
}: {
  checks: SettlementChecks | null | undefined;
  X: SettlementExtraLabels;
  money: (n: number) => string;
  onChanged: () => Promise<unknown> | void;
  onOpenCardPayments: () => void;
}) {
  const C = X.checks;
  const [type, setType] = useState<CheckType | "all">("all");
  const [showDismissed, setShowDismissed] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const signals = useMemo(() => checks?.signals ?? [], [checks]);
  const active = signals.filter((s) => !s.dismissal);
  const dismissedCount = signals.length - active.length;
  const pool = showDismissed ? signals : active;
  const counts = useMemo(() => {
    const out = new Map<string, number>();
    for (const s of pool) out.set(s.type, (out.get(s.type) ?? 0) + 1);
    return out;
  }, [pool]);
  const visible = pool.filter((s) => type === "all" || s.type === type);

  async function send(method: "POST" | "DELETE", s: CheckSignal, withNote?: string) {
    setBusy(s.key);
    try {
      const res = await fetch("/api/admin/settlements/checks/dismiss", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: s.key, note: withNote, idno: s.idno, amount: s.amount }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(null);
      setNote("");
      await onChanged();
    } catch {
      toast.error(C.error);
    } finally {
      setBusy(null);
    }
  }

  async function runMatching() {
    setBusy("run");
    let cursor: string | null = null;
    let suggested = 0;
    let confirmed = 0;
    try {
      for (let guard = 0; guard < 50; guard++) {
        const res: Response = await fetch("/api/admin/settlements/supplier-match/auto", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cursor ? { cursor } : {}),
        });
        if (!res.ok) throw new Error(String(res.status));
        const r = (await res.json()) as {
          total: number;
          remaining: number;
          nextCursor: string | null;
          suggested: number;
          confirmed: number;
        };
        suggested += r.suggested;
        confirmed += r.confirmed;
        setProgress({ done: r.total - r.remaining, total: r.total });
        if (!r.nextCursor || r.remaining <= 0) break;
        cursor = r.nextCursor;
      }
      toast.success(C.runDone(suggested, confirmed));
      await onChanged();
    } catch {
      toast.error(C.error);
    } finally {
      setBusy(null);
      setProgress(null);
    }
  }

  if (!checks) {
    return <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{C.unavailable}</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <p className="max-w-3xl text-sm text-gray-500">{C.hint}</p>
        <Button size="sm" variant="outline" className="gap-1.5 self-start" onClick={runMatching} disabled={busy !== null}>
          {busy === "run" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {progress ? C.running(progress.done, progress.total) : C.runMatching}
        </Button>
      </div>

      {!checks.matchingRan ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{C.matchingNotRun}</span>
        </div>
      ) : null}

      <div className="-mx-1 flex flex-wrap gap-1">
        {(["all", ...CHECK_TYPES] as const).map((t) => {
          const n = t === "all" ? pool.length : counts.get(t) ?? 0;
          if (t !== "all" && n === 0) return null;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "mx-0.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition",
                type === t ? "bg-gray-900 text-white ring-gray-900" : "bg-white text-gray-600 ring-gray-200 hover:text-gray-900",
              )}
            >
              {t === "all" ? C.allTypes : C.types[t]} <span className="opacity-60">{n}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">{signals.length === 0 ? C.emptyAll : C.empty}</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => {
            const href = actionHref(s);
            const isEditing = editing === s.key;
            return (
              <li
                key={s.key}
                className={cn(
                  "rounded-xl border bg-white p-3 shadow-sm",
                  s.dismissal ? "border-gray-200 opacity-70" : "border-gray-200",
                )}
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium ring-1", TYPE_TONE[s.type])}>
                        {C.types[s.type]}
                      </span>
                      {s.idno ? (
                        <Link
                          href={`/admin/bookkeeping/settlements/${encodeURIComponent(s.idno)}`}
                          className="text-sm font-medium text-gray-900 hover:underline"
                        >
                          {s.name ?? s.idno}
                        </Link>
                      ) : null}
                      {s.idno && s.name ? <span className="text-xs text-gray-400">{s.idno}</span> : null}
                    </div>
                    <p className="text-sm text-gray-700">{C.text(s, money, formatShortDate)}</p>
                    {s.dismissal ? (
                      <p className="text-xs text-gray-500">
                        {C.dismissedBy(s.dismissal.by, formatShortDate(s.dismissal.at), s.dismissal.note)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-1.5 sm:items-end">
                    <div className="text-right">
                      <div className="text-sm font-semibold tabular-nums text-gray-900">{money(s.amount)}</div>
                      {s.date ? <div className="text-xs text-gray-500">{formatShortDate(s.date)}</div> : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {href ? (
                        <Link
                          href={href}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-800 hover:border-gray-300"
                        >
                          {C.action[s.type]}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      ) : s.type === "card_unattributed" ? (
                        <button
                          type="button"
                          onClick={onOpenCardPayments}
                          className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-white px-2 text-xs font-medium text-gray-800 hover:border-gray-300"
                        >
                          {C.action[s.type]}
                          <ArrowRight className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                      {s.dismissal ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          disabled={busy !== null}
                          onClick={() => send("DELETE", s)}
                        >
                          {busy === s.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                          {C.restore}
                        </Button>
                      ) : !isEditing ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          title={C.dismissTitle}
                          onClick={() => {
                            setEditing(s.key);
                            setNote("");
                          }}
                        >
                          <Check className="h-3.5 w-3.5" />
                          {C.dismiss}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                {isEditing ? (
                  <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-2 sm:flex-row sm:items-center">
                    <Input
                      autoFocus
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={C.notePlaceholder}
                      aria-label={C.note}
                      className="h-8 text-xs sm:flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void send("POST", s, note);
                      }}
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-8 text-xs" disabled={busy !== null} onClick={() => send("POST", s, note)}>
                        {busy === s.key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {C.dismiss}
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditing(null)}>
                        {C.cancel}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {dismissedCount > 0 ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="text-xs text-gray-500 underline hover:text-gray-900"
            onClick={() => setShowDismissed(!showDismissed)}
          >
            {showDismissed ? C.hideDismissed : C.showDismissed(dismissedCount)}
          </button>
        </div>
      ) : null}
    </div>
  );
}
