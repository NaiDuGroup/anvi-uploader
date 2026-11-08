"use client";

import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { useLanguageStore } from "@/stores/useLanguageStore";
import {
  deriveOrderProductionSummary,
  isLineProductionStatus,
  type LineProductionStatus,
} from "@/lib/orderLineProductionStatus";
import { isWorkshopPhaseStatus } from "@/lib/orderStatusFromLines";

type T = ReturnType<typeof useLanguageStore.getState>["t"];

/**
 * Admin orders list: per-line production status (step 2). Lines only carry
 * their own information in the workshop phase (elsewhere they mirror the
 * order status), so both helpers render nothing outside it.
 */

export const LINE_STATUS_BADGE_CLASS: Record<LineProductionStatus, string> = {
  WAITING: "border-amber-200 bg-amber-50 text-amber-800",
  NEEDS_LAYOUT: "border-amber-300 bg-amber-50 text-amber-900",
  PRINTING: "border-orange-300 bg-orange-50 text-orange-800",
  DONE: "border-emerald-300 bg-emerald-50 text-emerald-800",
};

/** Small badge next to a line code («#9452.1/3 · Печатается»). */
export function OrderLineStatusBadge({
  orderStatus,
  productionStatus,
  t,
}: {
  orderStatus: string;
  productionStatus: string | undefined;
  t: T;
}) {
  if (!isWorkshopPhaseStatus(orderStatus) || !productionStatus) return null;
  const s: LineProductionStatus = isLineProductionStatus(productionStatus) ? productionStatus : "WAITING";
  return (
    <span
      data-testid="admin-line-status"
      data-status={s}
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[10px] font-semibold normal-case leading-none tracking-normal",
        LINE_STATUS_BADGE_CLASS[s],
      )}
    >
      {s === "DONE" ? (
        <Check className="h-2.5 w-2.5" aria-hidden />
      ) : s === "NEEDS_LAYOUT" ? (
        <Clock className="h-2.5 w-2.5 text-amber-700" aria-hidden />
      ) : null}
      {t.lineStatus[s]}
    </span>
  );
}

/**
 * «Печатается · готово 1 из 3» under the order status: only for a workshop
 * order with several lines in different states.
 */
export function orderLineSummaryText(
  order: { status: string; orderLines?: readonly { productionStatus?: string }[] },
  t: T,
): string | null {
  if (!isWorkshopPhaseStatus(order.status)) return null;
  const lines = (order.orderLines ?? []).filter(
    (l): l is { productionStatus: string } => typeof l.productionStatus === "string",
  );
  if (lines.length < 2) return null;
  const summary = deriveOrderProductionSummary(lines);
  if (summary.uniform !== null) return null;
  const head =
    order.status === "WORKSHOP_READY"
      ? t.lineStatus.DONE
      : order.status === "SENT_TO_WORKSHOP"
        ? t.lineStatus.WAITING
        : t.lineStatus.PRINTING;
  return t.lineStatus.summary(head, summary.counts.DONE, summary.total);
}

export function OrderLineSummary({
  order,
  t,
}: {
  order: { status: string; orderLines?: readonly { productionStatus?: string }[] };
  t: T;
}) {
  const text = orderLineSummaryText(order, t);
  if (!text) return null;
  return (
    <p data-testid="admin-line-summary" className="text-[11px] font-medium leading-snug text-orange-700">
      {text}
    </p>
  );
}
