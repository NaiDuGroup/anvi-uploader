"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Ban, Loader2, Lock, MessageCircle, Pencil, X } from "lucide-react";
import type { TranslationDictionary } from "@/lib/i18n";
import {
  DEALER_CANCEL_REASON_MAX,
  DEALER_CANCEL_REASON_MIN,
  type DealerModifyBlock,
  type DealerOrderActionsState,
} from "@/lib/dealerOrderModify";
import { cn } from "@/lib/utils";

/** Id of the order chat's text box (the «Написать цеху» button focuses it). */
export const ORDER_CHAT_INPUT_ID = "order-chat-input";
/** Id of the order chat section (scrolled into view). */
export const ORDER_CHAT_SECTION_ID = "order-chat";

/** Scroll to the order's chat and put the cursor in its text box. */
export function focusOrderChat(): void {
  if (typeof document === "undefined") return;
  document.getElementById(ORDER_CHAT_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "center" });
  const input = document.getElementById(ORDER_CHAT_INPUT_ID) as HTMLTextAreaElement | null;
  // After the scroll starts: focusing first would jump the page without the smooth scroll.
  window.setTimeout(() => input?.focus({ preventScroll: true }), 250);
}

/**
 * Dealer's «Изменить» / «Отменить заказ» bar on the cabinet order page.
 * - `editable`: both buttons active;
 * - `locked` (printing / paid): both visible but disabled, with the plaque and «Написать цеху»;
 * - `hidden` (ready, delivered, cancelled): nothing — only the chat stays.
 */
export function DealerOrderActionsView({
  orderId,
  state,
  lockReason,
  t,
  onCancelClick,
  onWriteWorkshop,
}: {
  orderId: string;
  state: DealerOrderActionsState;
  lockReason: DealerModifyBlock | null;
  t: TranslationDictionary;
  onCancelClick: () => void;
  onWriteWorkshop: () => void;
}) {
  if (state === "hidden") return null;
  const locked = state === "locked";
  const d = t.dealerOrder;
  const buttonBase =
    "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-sm transition-colors sm:w-auto";
  return (
    <section
      data-testid="dealer-order-actions"
      data-state={state}
      className={cn(
        "rounded-lg border p-3 shadow-sm sm:p-4",
        locked ? "border-amber-200 bg-amber-50" : "border-gray-200 bg-white",
      )}
    >
      {locked ? (
        <div
          role="status"
          data-testid="dealer-order-locked"
          className="mb-3 flex items-start gap-2 text-sm text-amber-900"
        >
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 break-words">{lockReason === "paid" ? d.lockedPaid : d.lockedPrinting}</p>
        </div>
      ) : (
        <p className="mb-3 text-xs text-gray-500">{d.editableHint}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {locked ? (
          <button
            type="button"
            disabled
            aria-disabled="true"
            data-testid="dealer-order-edit"
            className={cn(buttonBase, "cursor-not-allowed bg-gray-100 text-gray-400")}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {d.edit}
          </button>
        ) : (
          <Link
            href={`/cabinet/orders/${orderId}/edit`}
            data-testid="dealer-order-edit"
            className={cn(buttonBase, "bg-gold text-white hover:bg-gold-dark")}
          >
            <Pencil className="h-4 w-4" aria-hidden />
            {d.edit}
          </Link>
        )}
        <button
          type="button"
          disabled={locked}
          aria-disabled={locked ? "true" : undefined}
          data-testid="dealer-order-cancel"
          onClick={locked ? undefined : onCancelClick}
          className={cn(
            buttonBase,
            locked
              ? "cursor-not-allowed bg-gray-100 text-gray-400"
              : "border border-red-200 bg-white text-red-700 hover:bg-red-50",
          )}
        >
          <Ban className="h-4 w-4" aria-hidden />
          {d.cancel}
        </button>
        {locked ? (
          <button
            type="button"
            data-testid="dealer-order-write-workshop"
            onClick={onWriteWorkshop}
            className={cn(buttonBase, "border border-amber-300 bg-white text-amber-900 hover:bg-amber-100")}
          >
            <MessageCircle className="h-4 w-4" aria-hidden />
            {d.writeWorkshop}
          </button>
        ) : null}
      </div>
    </section>
  );
}

/** Confirm dialog for the dealer's cancel: a reason is required. */
export function DealerCancelDialog({
  orderNumber,
  t,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  orderNumber: string;
  t: TranslationDictionary;
  busy: boolean;
  error: string | null;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const d = t.dealerOrder;
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const tooShort = reason.trim().length < DEALER_CANCEL_REASON_MIN;

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dealer-cancel-title"
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-start justify-between gap-3">
          <h2 id="dealer-cancel-title" className="text-base font-bold text-gray-900">
            {d.cancelDialogTitle(orderNumber)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-gray-400 hover:text-gray-700"
            aria-label={d.cancelKeep}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mb-3 text-sm text-gray-600">{d.cancelDialogText}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setTouched(true);
            if (tooShort || busy) return;
            onConfirm(reason.trim());
          }}
        >
          <label htmlFor="dealer-cancel-reason" className="mb-1 block text-xs font-semibold text-gray-700">
            {d.cancelReasonLabel}
          </label>
          <textarea
            id="dealer-cancel-reason"
            ref={inputRef}
            value={reason}
            maxLength={DEALER_CANCEL_REASON_MAX}
            onChange={(e) => setReason(e.target.value)}
            onBlur={() => setTouched(true)}
            rows={3}
            placeholder={d.cancelReasonPlaceholder}
            className="w-full resize-y rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold"
          />
          {touched && tooShort ? <p className="mt-1 text-xs text-red-600">{d.cancelReasonRequired}</p> : null}
          {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            >
              {d.cancelKeep}
            </button>
            <button
              type="submit"
              disabled={busy || tooShort}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />}
              {busy ? d.cancelling : d.cancelConfirm}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
