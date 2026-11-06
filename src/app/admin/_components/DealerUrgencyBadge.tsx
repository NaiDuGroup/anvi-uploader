"use client";

import { createContext, useContext, useState } from "react";
import { Flame } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n";
import { AdminConfirmDialog } from "./AdminConfirmDialog";

/** Whether the viewer may waive dealer urgency fees (any staff role); provided by the orders page. */
export const DealerUrgencyWaiveContext = createContext<{ canWaive: boolean; onWaived?: () => void }>({
  canWaive: false,
});

/** «срочно по заявке дилера · +50 лей» / «· бесплатно» / «· доплата снята». */
export function dealerUrgencyBadgeText(
  urgency: { feeMdl: number; waived: boolean },
  t: TranslationDictionary,
): string {
  const du = t.dealerUrgency;
  return du.adminBadge(urgency.waived ? du.adminFeeWaived : du.feeShort(urgency.feeMdl));
}

/**
 * Staff marker next to 🔥: urgency was requested by the dealer (with the fee
 * inside the price). On the orders list staff can waive a non-zero fee on
 * an unpaid order («Снять доплату», `DELETE /api/orders/[id]/urgency-fee`).
 */
export function DealerUrgencyBadge({
  orderId,
  urgency,
  isPaid,
  t,
  allowWaive = true,
}: {
  orderId: string;
  urgency: { feeMdl: number; waived: boolean };
  isPaid?: boolean;
  t: TranslationDictionary;
  /** Workshop board: label only. */
  allowWaive?: boolean;
}) {
  const { canWaive, onWaived } = useContext(DealerUrgencyWaiveContext);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const du = t.dealerUrgency;
  const label = dealerUrgencyBadgeText(urgency, t);
  const waivable = allowWaive && canWaive && !isPaid && !urgency.waived && urgency.feeMdl > 0;

  async function waive() {
    setBusy(true);
    setFailed(false);
    try {
      const res = await fetch(`/api/orders/${orderId}/urgency-fee`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setOpen(false);
      onWaived?.();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <span
        data-testid="dealer-urgency-badge"
        className="inline-flex max-w-full flex-wrap items-center gap-x-1 rounded-md bg-red-50 px-1.5 py-0.5 text-left text-[10px] font-semibold leading-tight text-red-800 ring-1 ring-inset ring-red-200"
        title={label}
      >
        <Flame className="h-3 w-3 shrink-0" aria-hidden />
        <span className="min-w-0">{label}</span>
        {waivable ? (
          <button
            type="button"
            data-testid="dealer-urgency-waive"
            onClick={() => setOpen(true)}
            className="whitespace-nowrap rounded px-0.5 text-[10px] font-semibold text-red-700 underline decoration-dotted underline-offset-2 hover:bg-red-100"
          >
            {du.waiveButton}
          </button>
        ) : null}
      </span>
      <AdminConfirmDialog
        open={open}
        title={du.waiveConfirmTitle(du.amount(urgency.feeMdl))}
        description={failed ? `${du.waiveConfirmText} ${du.waiveFailed}.` : du.waiveConfirmText}
        confirmLabel={du.waiveConfirm}
        cancelLabel={du.waiveCancel}
        confirmVariant="default"
        busy={busy}
        onConfirm={() => void waive()}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
