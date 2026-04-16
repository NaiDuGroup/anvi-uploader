"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useTrashStore } from "@/stores/useTrashStore";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { Button } from "@/components/ui/button";
import {
  Trash2,
  RotateCcw,
  Info,
  Loader2,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

function PermanentDeleteModal({
  t,
  onConfirm,
  onClose,
}: {
  t: ReturnType<typeof useLanguageStore.getState>["t"];
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 text-gray-900">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-5 h-5 text-red-500" />
          <h2 className="text-lg font-bold">{t.admin.trashPermanentDelete}</h2>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          {t.admin.trashPermanentConfirmText}
        </p>
        <div className="flex gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={onClose}
            disabled={deleting}
          >
            {t.admin.cancel}
          </Button>
          <Button
            className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {t.admin.trashPermanentDelete}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function TrashPageClient() {
  const { t } = useLanguageStore();
  const {
    orders,
    loading,
    page,
    totalPages,
    totalCount,
    fetchTrash,
    restoreOrder,
    permanentDeleteOrder,
    setPage,
  } = useTrashStore();

  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [permanentDeleteId, setPermanentDeleteId] = useState<string | null>(null);

  const fetchedRef = useRef(false);
  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchTrash();
  }, [fetchTrash]);

  const handleRestore = useCallback(
    async (id: string) => {
      setRestoringId(id);
      try {
        await restoreOrder(id);
      } catch {
        /* error set in store */
      }
      setRestoringId(null);
    },
    [restoreOrder],
  );

  const handlePermanentDelete = useCallback(async () => {
    if (!permanentDeleteId) return;
    try {
      await permanentDeleteOrder(permanentDeleteId);
    } catch {
      /* error set in store */
    }
    setPermanentDeleteId(null);
  }, [permanentDeleteId, permanentDeleteOrder]);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  };

  const statusLabel = (status: string): string =>
    (t.statuses as Record<string, string>)[status] ?? status;

  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-5 sm:py-8">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-900 sm:text-2xl">
          {t.admin.trashTitle}
        </h1>
        <p className="mt-1 text-sm text-gray-500">{t.admin.trashSubtitle}</p>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t.admin.trashInfo}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-400">
          <Trash2 className="mb-3 h-12 w-12 text-gray-300" />
          <p className="text-base font-medium">{t.admin.trashEmpty}</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">
                  <th className="px-4 py-3">{t.common.orderId}</th>
                  <th className="px-4 py-3">{t.common.phone}</th>
                  <th className="px-4 py-3 hidden sm:table-cell">
                    {t.common.status}
                  </th>
                  <th className="px-4 py-3 hidden md:table-cell">
                    {t.common.files}
                  </th>
                  <th className="px-4 py-3">{t.admin.trashDeletedAt}</th>
                  <th className="px-4 py-3 hidden lg:table-cell">
                    {t.admin.trashDeletedBy}
                  </th>
                  <th className="px-4 py-3">{t.admin.trashDaysRemaining}</th>
                  <th className="px-4 py-3 text-right">
                    {t.common.actions}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="transition-colors hover:bg-gray-50/60"
                  >
                    <td className="px-4 py-3 font-medium text-gray-900">
                      #{String(order.orderNumber).padStart(4, "0")}
                      {order.clientName && (
                        <span className="ml-2 text-xs font-normal text-gray-500">
                          {order.clientName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600">{order.phone}</td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="inline-block rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
                        {statusLabel(order.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500">
                      {order.files.length}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {formatDate(order.deletedAt)}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-gray-600">
                      {order.deletedByName ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <DaysRemainingBadge days={order.daysRemaining} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => handleRestore(order.id)}
                          disabled={restoringId === order.id}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-colors disabled:opacity-60 disabled:cursor-wait"
                          title={t.admin.trashRestore}
                        >
                          {restoringId === order.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <RotateCcw className="h-3.5 w-3.5" />
                          )}
                          <span className="hidden sm:inline">
                            {restoringId === order.id
                              ? t.admin.trashRestoring
                              : t.admin.trashRestore}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPermanentDeleteId(order.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
                          title={t.admin.trashPermanentDelete}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-gray-600">
              <span>
                {totalCount}{" "}
                {totalCount === 1 ? t.admin.order : t.admin.navOrders.toLowerCase()}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {permanentDeleteId && (
        <PermanentDeleteModal
          t={t}
          onConfirm={handlePermanentDelete}
          onClose={() => setPermanentDeleteId(null)}
        />
      )}
    </main>
  );
}

function DaysRemainingBadge({ days }: { days: number }) {
  const urgent = days <= 7;
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${
        urgent
          ? "bg-red-100 text-red-700"
          : "bg-gray-100 text-gray-700"
      }`}
    >
      {days}
    </span>
  );
}
