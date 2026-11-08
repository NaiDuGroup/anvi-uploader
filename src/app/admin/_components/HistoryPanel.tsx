"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import {
  ArrowRightLeft,
  CircleCheck,
  CircleX,
  Clock,
  Coins,
  FileMinus,
  FilePlus,
  Flame,
  Pencil,
  Plus,
  RefreshCw,
  Replace,
  Trash2,
  TriangleAlert,
  Truck,
  Undo2,
  UserRound,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  actorName,
  actorRole,
  describeHistoryEntry,
  groupHistoryByDay,
  historyStatusLabel,
  historyTime,
  visibleHistoryEntries,
  type HistoryEntry,
  type HistoryIconKind,
} from "@/lib/orderHistoryFormat";
import { STATUS_VARIANT_MAP, TRIGGER_COLORS } from "@/app/admin/_lib/orderStatus";
import { LINE_STATUS_BADGE_CLASS } from "./OrderLineStatusBadges";
import type { OrderStatus } from "@/lib/validations";
import type { LineProductionStatus } from "@/lib/orderLineProductionStatus";

export type { HistoryEntry } from "@/lib/orderHistoryFormat";

type T = ReturnType<typeof useLanguageStore.getState>["t"];

const ICONS: Record<HistoryIconKind, { icon: LucideIcon; className: string }> = {
  created: { icon: Plus, className: "bg-emerald-100 text-emerald-700" },
  status: { icon: ArrowRightLeft, className: "bg-blue-100 text-blue-700" },
  urgency: { icon: Flame, className: "bg-red-100 text-red-600" },
  payment: { icon: Wallet, className: "bg-emerald-100 text-emerald-700" },
  payment_problem: { icon: TriangleAlert, className: "bg-red-100 text-red-600" },
  price: { icon: Coins, className: "bg-amber-100 text-amber-700" },
  file_added: { icon: FilePlus, className: "bg-sky-100 text-sky-700" },
  file_removed: { icon: FileMinus, className: "bg-rose-100 text-rose-600" },
  file_replaced: { icon: Replace, className: "bg-violet-100 text-violet-700" },
  problem: { icon: TriangleAlert, className: "bg-amber-100 text-amber-700" },
  problem_cleared: { icon: CircleCheck, className: "bg-emerald-100 text-emerald-700" },
  shipping: { icon: Truck, className: "bg-indigo-100 text-indigo-700" },
  client: { icon: UserRound, className: "bg-slate-100 text-slate-600" },
  edit: { icon: Pencil, className: "bg-gray-100 text-gray-600" },
  deleted: { icon: Trash2, className: "bg-red-100 text-red-600" },
  restored: { icon: Undo2, className: "bg-emerald-100 text-emerald-700" },
  cancelled: { icon: CircleX, className: "bg-red-100 text-red-600" },
};

/** Same colours as the status dropdown in the orders list. */
function statusChipClass(code: string, scope: "order" | "line"): string {
  if (scope === "line") {
    return LINE_STATUS_BADGE_CLASS[code as LineProductionStatus] ?? "border-gray-200 bg-gray-50 text-gray-700";
  }
  const variant = STATUS_VARIANT_MAP[code as OrderStatus] ?? "outline";
  // Drop the hover colour: the chip is not a button here.
  return (TRIGGER_COLORS[variant] ?? TRIGGER_COLORS.outline!).replace(/\s*hover:\S+/g, "");
}

function StatusChip({ code, scope, t }: { code: string | null; scope: "order" | "line"; t: T }) {
  const label = historyStatusLabel(code, scope, t);
  if (!code || !label) return null;
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusChipClass(code, scope)}`}>
      {label}
    </span>
  );
}

export default function HistoryPanel({
  orderId,
  orderNumber,
  currentStatus,
  t,
  onClose,
}: {
  orderId: string;
  orderNumber: number;
  /** Order status now («acum: …» under the title). */
  currentStatus?: string | null;
  t: T;
  onClose: () => void;
}) {
  const locale = useLanguageStore((s) => s.locale);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${orderId}/history`);
      if (res.ok) {
        const data: unknown = await res.json();
        if (Array.isArray(data)) setEntries(data as HistoryEntry[]);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const days = useMemo(
    () => groupHistoryByDay(visibleHistoryEntries(entries), locale, t),
    [entries, locale, t],
  );

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-2 border-b bg-gray-50 px-4 py-3">
          <div className="flex min-w-0 items-start gap-2">
            <Clock className="mt-0.5 h-5 w-5 shrink-0 text-gray-500" />
            <div className="min-w-0">
              <h2 className="font-semibold text-gray-900">
                {t.admin.history} — #{String(orderNumber).padStart(4, "0")}
              </h2>
              {currentStatus && historyStatusLabel(currentStatus, "order", t) ? (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                  <span>{t.orderHistory.nowStatus}</span>
                  <StatusChip code={currentStatus} scope="order" t={t} />
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={fetchHistory}
              className="p-1 text-gray-400 hover:text-gray-600"
              title={t.common.refresh}
              aria-label={t.common.refresh}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="×">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && entries.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">{t.common.loading}</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">{t.admin.noHistory}</p>
          )}

          <div className="space-y-5">
            {days.map((day) => (
              <section key={day.key}>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{day.label}</h3>
                <div className="relative">
                  <div className="absolute bottom-3 left-[13px] top-3 w-px bg-gray-200" />
                  <ul className="space-y-3">
                    {day.entries.map((entry) => (
                      <HistoryRow key={entry.id} entry={entry} locale={locale} t={t} />
                    ))}
                  </ul>
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function HistoryRow({ entry, locale, t }: { entry: HistoryEntry; locale: Parameters<typeof historyTime>[1]; t: T }) {
  const d = describeHistoryEntry(entry, t);
  const { icon: Icon, className } = ICONS[d.kind];
  const role = actorRole(entry, t);
  const hasChips =
    d.status && (historyStatusLabel(d.status.from, d.status.scope, t) || historyStatusLabel(d.status.to, d.status.scope, t));
  return (
    <li className="relative flex gap-3">
      <span className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ring-4 ring-white ${className}`}>
        <Icon className="h-3.5 w-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 break-words text-sm leading-snug text-gray-900">
            {d.showActor ? (
              <>
                <span className="font-semibold">{actorName(entry, t)}</span>
                {role ? <span className="text-gray-500"> ({role})</span> : null} {d.text}
              </>
            ) : (
              d.text
            )}
          </p>
          <time className="shrink-0 text-[11px] tabular-nums text-gray-400" dateTime={entry.createdAt}>
            {historyTime(entry.createdAt, locale)}
          </time>
        </div>
        {hasChips && d.status ? (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <StatusChip code={d.status.from} scope={d.status.scope} t={t} />
            {historyStatusLabel(d.status.from, d.status.scope, t) ? (
              <span className="text-xs text-gray-400" aria-hidden>
                →
              </span>
            ) : null}
            <StatusChip code={d.status.to} scope={d.status.scope} t={t} />
          </div>
        ) : null}
        {d.details.map((line, i) => (
          <p key={i} className="mt-0.5 break-words text-xs text-gray-500">
            {line}
          </p>
        ))}
        {entry.action === "dealer_edited" ? <ArchivedFilesList metadata={entry.metadata} t={t} /> : null}
      </div>
    </li>
  );
}

/** Previous file versions a dealer edit replaced or removed (`OrderFileArchive`), downloadable. */
function ArchivedFilesList({ metadata, t }: { metadata: Record<string, unknown> | null; t: T }) {
  const raw = metadata?.archivedFiles;
  const files = Array.isArray(raw)
    ? raw.filter(
        (f): f is { id: string; fileName: string } =>
          f != null && typeof f === "object" && typeof (f as { id?: unknown }).id === "string",
      )
    : [];
  if (files.length === 0) return null;
  return (
    <div className="mt-1.5">
      <p className="text-[11px] font-medium text-gray-500">{t.orderHistory.previousFiles(files.length)}</p>
      <ul className="mt-0.5 space-y-0.5">
        {files.map((f) => (
          <li key={f.id} className="truncate text-xs">
            <a href={`/api/download/archived/${f.id}`} className="text-blue-600 hover:underline">
              {f.fileName}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
