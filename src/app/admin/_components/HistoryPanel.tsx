"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Badge } from "@/components/ui/badge";
import { Clock, X, RefreshCw } from "lucide-react";

interface HistoryEntry {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  userName: string;
  userRole: string;
}

type T = ReturnType<typeof useLanguageStore.getState>["t"];

const FIELD_LABELS: Record<string, keyof T["admin"]> = {
  price: "historyFieldPrice",
  isPrio: "historyFieldPrio",
  isPaid: "historyFieldPaid",
  notes: "historyFieldNotes",
  phone: "historyFieldPhone",
  clientName: "historyFieldClientName",
  issueReason: "historyFieldIssueReason",
};

function formatValue(raw: string | null, field: string | null, t: T): string {
  if (raw === null || raw === "") return t.admin.historyValueEmpty;
  if (field === "isPrio" || field === "isPaid") {
    return raw === "true" ? t.admin.historyValueTrue : t.admin.historyValueFalse;
  }
  if (field === "status") {
    const statusKey = raw as keyof T["statuses"];
    return t.statuses[statusKey] ?? raw;
  }
  return raw;
}

function describeEntry(entry: HistoryEntry, t: T): string {
  switch (entry.action) {
    case "order_created":
      return t.admin.historyOrderCreated;
    case "status_changed":
      return t.admin.historyStatusChanged(
        formatValue(entry.oldValue, "status", t),
        formatValue(entry.newValue, "status", t),
      );
    case "field_updated": {
      const labelKey = entry.field ? FIELD_LABELS[entry.field] : undefined;
      const fieldLabel = labelKey
        ? (t.admin[labelKey] as string)
        : entry.field ?? "?";
      return t.admin.historyFieldUpdated(
        fieldLabel,
        formatValue(entry.oldValue, entry.field, t),
        formatValue(entry.newValue, entry.field, t),
      );
    }
    case "file_added":
      return t.admin.historyFileAdded(
        (entry.metadata?.fileName as string) ?? "?",
      );
    case "file_removed":
      return t.admin.historyFileRemoved(
        (entry.metadata?.fileName as string) ?? "?",
      );
    case "file_updated":
      return t.admin.historyFileUpdated(
        (entry.metadata?.fileName as string) ?? "?",
      );
    default:
      return entry.action;
  }
}

function actionColor(action: string): "default" | "info" | "success" | "destructive" | "warning" | "secondary" {
  switch (action) {
    case "order_created":
      return "success";
    case "status_changed":
      return "info";
    case "file_added":
      return "success";
    case "file_removed":
      return "destructive";
    case "file_updated":
    case "field_updated":
      return "warning";
    default:
      return "secondary";
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday) return time;
  return `${d.toLocaleDateString([], { day: "2-digit", month: "2-digit" })} ${time}`;
}

export default function HistoryPanel({
  orderId,
  orderNumber,
  t,
  onClose,
}: {
  orderId: string;
  orderNumber: number;
  t: T;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/orders/${orderId}/history`);
      if (res.ok) {
        const data: HistoryEntry[] = await res.json();
        setEntries(data);
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

  const roleLabel = (role: string) =>
    role === "workshop"
      ? t.admin.roleWorkshop
      : role === "client"
        ? t.admin.historyClient
        : t.admin.roleAdmin;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white shadow-2xl flex flex-col h-full">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">
              {t.admin.history} — #{String(orderNumber).padStart(4, "0")}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={fetchHistory}
              className="text-gray-400 hover:text-gray-600 p-1"
              title={t.common.refresh}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
          {loading && entries.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">{t.common.loading}</p>
          )}
          {!loading && entries.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">{t.admin.noHistory}</p>
          )}

          <div className="relative">
            {entries.length > 0 && (
              <div className="absolute left-3 top-2 bottom-2 w-px bg-gray-200" />
            )}
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className="relative pl-8">
                  <div className="absolute left-1.5 top-1.5 w-3 h-3 rounded-full bg-white border-2 border-gray-300 z-10" />
                  <div className="bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-medium text-gray-700">
                        {entry.userName}
                      </span>
                      <Badge
                        variant={
                          entry.userRole === "workshop"
                            ? "warning"
                            : entry.userRole === "client"
                              ? "outline"
                              : "secondary"
                        }
                        className="text-[9px] px-1 py-0"
                      >
                        {roleLabel(entry.userRole)}
                      </Badge>
                      <Badge
                        variant={actionColor(entry.action)}
                        className="text-[9px] px-1 py-0 ml-auto"
                      >
                        {entry.action.replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-900 leading-snug">
                      {describeEntry(entry, t)}
                    </p>
                    <span className="text-[10px] text-gray-400 mt-1 block">
                      {formatDate(entry.createdAt)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
