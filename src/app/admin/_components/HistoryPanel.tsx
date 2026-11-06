"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Badge } from "@/components/ui/badge";
import { Clock, X, RefreshCw } from "lucide-react";
import { layoutIssueReasonLabel } from "@/lib/layoutIssueClient";

export interface HistoryEntry {
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
  clientId: "historyFieldClientId",
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

function metaLineCode(entry: HistoryEntry): string {
  const code = entry.metadata?.lineCode;
  return typeof code === "string" && code.length > 0 ? code : "?";
}

/** Old / new file names of a per-file replace (`replacedFileName` / `newFileName`), null for older entries. */
export function replacedFileNames(entry: Pick<HistoryEntry, "metadata">): { oldName: string; newName: string } | null {
  const oldName = entry.metadata?.replacedFileName;
  const newName = entry.metadata?.newFileName;
  if (typeof oldName !== "string" || !oldName || typeof newName !== "string" || !newName) return null;
  return { oldName, newName };
}

/** One history line (exported for tests). */
export function describeEntry(entry: HistoryEntry, t: T): string {
  switch (entry.action) {
    case "order_created":
      return t.admin.historyOrderCreated;
    case "status_changed": {
      const text = t.admin.historyStatusChanged(
        formatValue(entry.oldValue, "status", t),
        formatValue(entry.newValue, "status", t),
      );
      return entry.metadata?.derived === true ? `${text} ${t.lineStatus.historyDerived}` : text;
    }
    case "line_status_changed": {
      const label = (v: string | null) =>
        v && v in t.lineStatus ? (t.lineStatus[v as keyof typeof t.lineStatus] as string) : (v ?? "?");
      return t.lineStatus.history(
        (entry.metadata?.lineCode as string | undefined) ?? "?",
        label(entry.oldValue),
        label(entry.newValue),
      );
    }
    case "line_layout_flagged": {
      const note = entry.metadata?.note;
      return t.layoutIssue.historyFlagged(
        metaLineCode(entry),
        layoutIssueReasonLabel(t.layoutIssue, entry.metadata?.reason as string | undefined),
        typeof note === "string" && note.length > 0 ? note : null,
      );
    }
    case "line_layout_cleared":
      return t.layoutIssue.historyCleared(metaLineCode(entry));
    case "line_layout_fixed": {
      // Per-file replace: «файл A заменён на B»; older entries (whole-line swap) keep the short text.
      const names = replacedFileNames(entry);
      return names
        ? t.layoutIssue.historyFixedFile(metaLineCode(entry), entry.metadata?.by === "client", names.oldName, names.newName)
        : t.layoutIssue.historyFixed(metaLineCode(entry), entry.metadata?.by === "client");
    }
    case "line_file_replaced": {
      const names = replacedFileNames(entry);
      return names
        ? t.layoutIssue.historyOwnerReplacedFile(metaLineCode(entry), entry.metadata?.role === "dealer", names.oldName, names.newName)
        : t.layoutIssue.historyOwnerReplaced(metaLineCode(entry), entry.metadata?.role === "dealer");
    }
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
    case "deleted":
      return t.admin.historyOrderDeleted;
    case "restored":
      return t.admin.historyOrderRestored;
    case "payment_mismatch":
      return t.admin.historyPaymentMismatch(
        String(entry.metadata?.paidMdl ?? "?"),
        String(entry.metadata?.totalMdl ?? entry.oldValue ?? "?"),
        entry.newValue ?? "",
      );
    case "dealer_edited":
      return `${t.dealerOrder.adminEditedBadge("")}`.trim() +
        `: ${t.admin.historyFieldPrice} ${formatValue(entry.oldValue, "price", t)} → ${formatValue(entry.newValue, "price", t)}`;
    case "cancelled_by_dealer":
      return `${t.dealerOrder.adminCancelled("", "").trim()} — ${t.dealerOrder.adminCancelReason}: ${
        (entry.metadata?.reason as string | undefined) ?? "—"
      }`;
    case "urgency_dealer_on":
      return t.dealerUrgency.historyDealerOn(t.dealerUrgency.feeShort(metaFee(entry)));
    case "urgency_dealer_off":
      return t.dealerUrgency.historyDealerOff(t.dealerUrgency.feeShort(metaFee(entry)));
    case "urgency_staff_off":
      return t.dealerUrgency.historyStaffOff(t.dealerUrgency.amount(metaFee(entry)));
    case "urgency_fee_waived":
      return t.dealerUrgency.historyFeeWaived(t.dealerUrgency.amount(metaFee(entry)));
    default:
      return entry.action;
  }
}

/** Fee of a dealer-urgency history entry (`metadata.feeMdl`), 0 when missing. */
function metaFee(entry: HistoryEntry): number {
  const fee = entry.metadata?.feeMdl;
  return typeof fee === "number" && Number.isFinite(fee) ? fee : 0;
}

function actionColor(action: string): "default" | "info" | "success" | "destructive" | "warning" | "secondary" {
  switch (action) {
    case "order_created":
      return "success";
    case "status_changed":
    case "line_status_changed":
      return "info";
    case "line_layout_flagged":
      return "destructive";
    case "line_layout_cleared":
      return "secondary";
    case "line_layout_fixed":
      return "success";
    case "line_file_replaced":
      return "warning";
    case "file_added":
      return "success";
    case "file_removed":
      return "destructive";
    case "file_updated":
    case "field_updated":
      return "warning";
    case "deleted":
      return "destructive";
    case "restored":
      return "success";
    case "dealer_edited":
      return "warning";
    case "cancelled_by_dealer":
    case "payment_mismatch":
      return "destructive";
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
        : role === "superadmin"
          ? t.admin.roleSuperAdmin
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
                        {entry.action === "line_status_changed"
                          ? t.lineStatus.historyAction
                          : (t.admin.historyActionLabels[entry.action] ?? entry.action.replace(/_/g, " "))}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-900 leading-snug">
                      {describeEntry(entry, t)}
                    </p>
                    {entry.action === "dealer_edited" ? (
                      <ArchivedFilesList metadata={entry.metadata} t={t} />
                    ) : null}
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
      <p className="text-[11px] font-medium text-gray-500">{t.dealerOrder.adminArchivedFiles(files.length)}</p>
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
