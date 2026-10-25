"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminConfirmDialog } from "@/app/admin/_components/AdminConfirmDialog";
import { useLanguageStore } from "@/stores/useLanguageStore";
import { formatAmountInput } from "@/lib/money";
import { StockMovementKind, type StockUnit } from "@/lib/stock/unified/kinds";
import type {
  StockMovementJson,
  StockMovementsPage,
  StockVariantJson,
} from "@/lib/stock/unified/adminTypes";
import { formatQuantity } from "@/lib/stock/unified/quantity";
import { StockModalShell } from "../StockModalShell";
import { dateLocaleFor } from "../catalogStock";
import { stockErrorMessage, stockFetch } from "./stockApi";

const PAGE_SIZE = 30;

function movementTitle(m: StockMovementJson, s: ReturnType<typeof useLanguageStore.getState>["t"]["stock"]): string {
  const kind: string = s.movementKinds[m.kind as StockMovementKind] ?? m.kind;
  return m.orderNumber != null ? `${kind} · ${s.orderRef(m.orderNumber)}` : kind;
}

/** Paginated movement history of one variant; receipts can be cancelled from here. */
export function StockHistoryModal({
  variant,
  itemName,
  unit,
  onClose,
  onChanged,
}: {
  variant: StockVariantJson;
  itemName: string;
  unit: StockUnit;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const { t, locale } = useLanguageStore();
  const s = t.stock;
  const dateLoc: string = dateLocaleFor(locale);
  const [movements, setMovements] = useState<StockMovementJson[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [reversing, setReversing] = useState<boolean>(false);

  const loadPage = useCallback(
    async (next: number, replace: boolean): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const data = await stockFetch<StockMovementsPage>(
          `/api/admin/stock/variants/${variant.id}/movements?page=${next}&pageSize=${PAGE_SIZE}`,
        );
        setMovements((prev) => (replace ? data.movements : [...prev, ...data.movements]));
        setTotal(data.total);
        setPage(next);
      } catch (e) {
        setError(stockErrorMessage(e, s));
      } finally {
        setLoading(false);
      }
    },
    [variant.id, s],
  );

  useEffect(() => {
    void loadPage(1, true);
  }, [loadPage]);

  async function reverse(receiptId: string): Promise<void> {
    setReversing(true);
    setError(null);
    try {
      await stockFetch(`/api/admin/stock/receipts/${receiptId}`, { method: "DELETE" });
      setReverseId(null);
      await loadPage(1, true);
      await onChanged();
    } catch (e) {
      setReverseId(null);
      setError(stockErrorMessage(e, s));
    } finally {
      setReversing(false);
    }
  }

  return (
    <StockModalShell
      titleId="stock-history-title"
      title={s.historyTitle}
      subtitle={
        <>
          <p className="font-mono text-xs text-gray-500">{variant.sku}</p>
          <p className="line-clamp-2">
            {itemName}
            {variant.label ? <span className="text-gray-500"> · {variant.label}</span> : null}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {s.currentStock}:{" "}
            <span className="tabular-nums text-gray-900">
              {formatQuantity(variant.stockQuantity)} {s.units[unit]}
            </span>
          </p>
        </>
      }
      busy={reversing}
      onClose={onClose}
    >
      {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
      {movements.length === 0 && !loading ? (
        <p className="text-sm text-gray-500">{s.historyEmpty}</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {movements.map((m) => {
            const canReverse: boolean = m.kind === StockMovementKind.Receipt && m.receiptId != null;
            const meta: string = [
              new Date(m.createdAt).toLocaleString(dateLoc, {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }),
              m.createdByName,
              m.note,
            ]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={m.id} className="flex flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{movementTitle(m, s)}</p>
                  <p className="break-words text-xs text-gray-500">{meta}</p>
                </div>
                <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                  <span
                    className={
                      m.delta > 0
                        ? "tabular-nums text-emerald-700"
                        : m.delta < 0
                          ? "tabular-nums text-red-600"
                          : "tabular-nums text-gray-600"
                    }
                  >
                    {m.delta > 0 ? "+" : ""}
                    {formatQuantity(m.delta)} {s.units[unit]}
                    {m.costMdl != null ? (
                      <span className="ml-2 text-xs text-gray-500">
                        {formatAmountInput(m.costMdl)} {t.admin.currency}
                      </span>
                    ) : null}
                  </span>
                  {canReverse ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 gap-1 px-2 text-xs"
                      disabled={reversing}
                      onClick={() => setReverseId(m.receiptId)}
                    >
                      <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      {s.reverseReceipt}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {loading ? (
        <div className="flex justify-center py-4 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </div>
      ) : movements.length < total ? (
        <div className="mt-3 flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => void loadPage(page + 1, false)}>
            {s.loadMore}
          </Button>
        </div>
      ) : null}

      <AdminConfirmDialog
        open={reverseId != null}
        title={s.reverseConfirmTitle}
        description={s.reverseConfirmDescription}
        confirmLabel={s.reverseReceipt}
        cancelLabel={s.cancel}
        busy={reversing}
        onClose={() => {
          if (!reversing) setReverseId(null);
        }}
        onConfirm={() => {
          if (reverseId) void reverse(reverseId);
        }}
      />
    </StockModalShell>
  );
}
