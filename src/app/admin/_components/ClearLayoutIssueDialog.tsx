"use client";

import { useEffect } from "react";
import { Loader2, Undo2, X } from "lucide-react";
import { useLanguageStore } from "@/stores/useLanguageStore";

/**
 * In-page confirm for «Снять отметку» on a «Нужен макет» line (studio orders
 * list, ЦЕХ sidebar, workshop board) — styled like {@link LayoutIssueModal},
 * instead of the browser's native confirm box. The caller does the DELETE.
 */
export default function ClearLayoutIssueDialog({
  lineCode,
  isSubmitting = false,
  error,
  onConfirm,
  onClose,
}: {
  lineCode: string;
  isSubmitting?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useLanguageStore();
  const li = t.layoutIssue;
  const close = () => {
    if (!isSubmitting) onClose();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isSubmitting, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" data-testid="clear-layout-issue-dialog">
      <div className="absolute inset-0 bg-black/50" onClick={close} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-layout-issue-title"
        className="relative w-full max-w-md rounded-2xl bg-white p-5 text-gray-900 shadow-xl sm:p-6"
      >
        <button
          type="button"
          onClick={close}
          disabled={isSubmitting}
          aria-label={li.cancel}
          className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="mb-2 flex items-center gap-2 pr-8">
          <Undo2 className="h-5 w-5 shrink-0 text-gray-500" aria-hidden />
          <h2 id="clear-layout-issue-title" className="text-base font-bold sm:text-lg">
            {li.clearConfirm(lineCode)}
          </h2>
        </div>
        <p className="mb-4 text-sm text-gray-600">{li.clearConfirmHint}</p>
        {error ? (
          <p className="mb-3 text-sm text-red-600" role="alert" data-testid="clear-layout-issue-error">
            {error}
          </p>
        ) : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={isSubmitting}
            className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {li.cancel}
          </button>
          <button
            type="button"
            data-testid="clear-layout-issue-confirm"
            disabled={isSubmitting}
            onClick={onConfirm}
            autoFocus
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg bg-gray-800 px-4 text-sm font-semibold text-white shadow-sm hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Undo2 className="h-4 w-4" aria-hidden />}
            {li.clear}
          </button>
        </div>
      </div>
    </div>
  );
}
